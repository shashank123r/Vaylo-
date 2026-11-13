// Content script injected into a supported job tab on explicit user action.
// Runs in the page's isolated world. Receives the user's own approved profile
// from the background worker, maps + fills safe fields, reports navigation,
// validation errors and anything needing attention, and NEVER clicks submit.
import { adapterFor, collectValidationErrors } from "./adapters/index";
import { applyFillsAnimated } from "./animate";
import { detectBlock, detectExpired } from "./block";
import type { Adapter, DetectedForm } from "./adapters/types";

declare const chrome: {
  runtime: { onMessage: { addListener: (cb: (msg: any, sender: any, send: (r: any) => void) => boolean | void) => void } };
};

interface JfWindow extends Window {
  __jfInjected?: boolean;
}
const w = window as JfWindow;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Wait for a dynamically rendered (SPA) application form to appear.
async function detectReady(adapter: Adapter): Promise<DetectedForm | null> {
  for (let i = 0; i < 10; i++) {
    const form = adapter.detect(document);
    if (form && form.fields.length > 0) return form;
    await sleep(300);
  }
  return adapter.detect(document);
}

async function handle(msg: any, send: (r: any) => void) {
  try {
    // 1) Never fill behind a login wall or CAPTCHA — pause for the user instead.
    const blocked = detectBlock(document);
    if (blocked) {
      send({ supported: false, blocked: true, reason: blocked });
      return;
    }
    // 2) Use a dedicated adapter when we have one, else the generic best-effort one.
    const adapter = adapterFor(location.href);
    const form = await detectReady(adapter);
    if (!form) {
      // No fillable form: distinguish a closed/expired posting from a plain miss so
      // the engine can record EXPIRED and move on to the next job.
      const expired = detectExpired(document);
      if (expired) {
        send({ supported: false, expired: true, reason: expired });
        return;
      }
      send({ supported: false, reason: "No application form detected on this page. You can apply manually." });
      return;
    }
    const plan = adapter.plan(form, msg.profile);
    let fill = { filled: [] as unknown[], failed: [] as unknown[] };
    // Visible fill: a floating cursor moves to each field and types it out so the
    // user can watch. Same safe plan, same result; it just animates.
    if (msg.type === "jf-fill") fill = (await applyFillsAnimated(document, plan)) as typeof fill;

    const container = document.querySelector("form") ?? document.body;
    const validationErrors = collectValidationErrors(container, document);

    send({
      supported: true,
      ats: form.ats,
      company: form.company ?? null,
      title: form.title ?? null,
      multiStep: form.multiStep,
      nav: form.nav,
      filled: fill.filled,
      failed: fill.failed,
      skipped: plan.skipped,
      fileField: plan.fileField ?? null,
      // A resume/CV upload control exists. Browsers forbid scripts from setting a
      // file input, so the USER must attach the file — we only point them to it.
      needsUpload: !!plan.fileField,
      unsupported: form.unsupported,
      validationErrors,
      requiresAttention: plan.skipped.length + validationErrors.length,
    });
  } catch (e) {
    send({ supported: false, reason: `Error reading page: ${String((e as Error)?.message ?? e)}` });
  }
}

if (!w.__jfInjected) {
  w.__jfInjected = true;
  chrome.runtime.onMessage.addListener((msg, _sender, send) => {
    if (msg?.type !== "jf-detect" && msg?.type !== "jf-fill") return;
    void handle(msg, send);
    return true; // async response
  });
}
