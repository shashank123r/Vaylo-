import type { FieldPlan } from "./adapters/types";
import { applyFills, setNativeValue, deepQuerySelector, type FillOutcome } from "./fill";

// Visible autofill: a floating cursor moves to each field, "clicks" it, and types
// the value out character by character, so the user can WATCH the form being
// filled in their own tab. This is cosmetic on top of the same safe plan — it only
// writes the values the plan produced (no sensitive/unknown fields) and NEVER
// clicks submit. Falls back to the instant fill when motion is reduced or layout
// is unavailable (e.g. in tests).

const CURSOR_ID = "vaylo-autofill-cursor";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function reducedMotion(view: Window): boolean {
  try {
    return view.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

function ensureCursor(doc: Document): HTMLElement {
  const existing = doc.getElementById(CURSOR_ID);
  if (existing) return existing;
  const c = doc.createElement("div");
  c.id = CURSOR_ID;
  c.setAttribute("aria-hidden", "true");
  Object.assign(c.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: "2147483647",
    pointerEvents: "none",
    transform: "translate(-80px, -80px)",
    transition: "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
    willChange: "transform",
  } as Partial<CSSStyleDeclaration>);
  // Pointer arrow. Inner span is scaled for the click pulse (keeps the outer
  // element's translate transition untouched).
  c.innerHTML =
    '<span style="display:block;transform-origin:4px 4px">' +
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" ' +
    'style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">' +
    '<path d="M5 3l14 7-5.6 1.6L10.5 18 5 3z" fill="#252824" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/>' +
    "</svg></span>";
  doc.body.appendChild(c);
  return c;
}

function moveTo(cursor: HTMLElement, el: Element): Promise<void> {
  try {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch {
    /* ignore */
  }
  const r = el.getBoundingClientRect();
  const x = Math.round(r.left + Math.min(26, Math.max(10, r.width / 2)));
  const y = Math.round(r.top + r.height / 2);
  cursor.style.transform = `translate(${x}px, ${y}px)`;
  return sleep(260);
}

async function clickPulse(cursor: HTMLElement): Promise<void> {
  const inner = cursor.firstElementChild as HTMLElement | null;
  inner?.animate?.([{ transform: "scale(1)" }, { transform: "scale(0.65)" }, { transform: "scale(1)" }], {
    duration: 170,
    easing: "ease-out",
  });
  await sleep(150);
}

async function typeInto(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  fire: (el: Element, ...t: string[]) => void,
): Promise<void> {
  try {
    el.focus();
  } catch {
    /* ignore */
  }
  // Don't type very long values out character by character (e.g. a pasted block) —
  // set them directly so a run never drags on.
  if (value.length > 50) {
    setNativeValue(el, value);
    fire(el, "input", "change");
    return;
  }
  for (let i = 1; i <= value.length; i++) {
    setNativeValue(el, value.slice(0, i));
    fire(el, "input");
    await sleep(22);
  }
  fire(el, "change");
  fire(el, "blur");
}

function truthy(v: string): boolean {
  return /^(yes|true|on|1|checked)$/i.test(v.trim());
}

/**
 * Animated version of applyFills. Same inputs/outputs; just visible. The caller
 * awaits it. On reduced motion or when there is no usable layout, it delegates to
 * the instant applyFills so behaviour and results are identical.
 */
export async function applyFillsAnimated(doc: Document, plan: FieldPlan): Promise<FillOutcome> {
  const view = doc.defaultView ?? (globalThis as unknown as Window);
  const hasLayout = typeof (doc.body as Element | null)?.getBoundingClientRect === "function";
  if (!hasLayout || reducedMotion(view)) return applyFills(doc, plan);

  const filled: FillOutcome["filled"] = [];
  const failed: FillOutcome["failed"] = [];
  const EventCtor: typeof Event = (view as unknown as { Event: typeof Event }).Event ?? Event;
  const fire = (el: Element, ...types: string[]) =>
    types.forEach((t) => el.dispatchEvent(new EventCtor(t, { bubbles: true })));

  const cursor = ensureCursor(doc);

  for (const f of plan.fills) {
    const el = deepQuerySelector(doc, f.selector) as HTMLElement | null;
    if (!el) {
      failed.push({ selector: f.selector, label: f.label, reason: "Field not found on page." });
      continue;
    }
    try {
      await moveTo(cursor, el);
      await clickPulse(cursor);
      const tag = el.tagName.toLowerCase();
      const inputType = (el.getAttribute("type") ?? "").toLowerCase();

      if (tag === "select") {
        const select = el as HTMLSelectElement;
        const opt = Array.from(select.options).find((o) => o.value === f.value || o.text.trim() === f.value);
        if (!opt) {
          failed.push({ selector: f.selector, label: f.label, reason: "No matching option." });
          continue;
        }
        select.value = opt.value;
        fire(select, "input", "change");
      } else if (inputType === "checkbox") {
        (el as HTMLInputElement).checked = truthy(f.value);
        fire(el, "click", "change");
      } else if (inputType === "radio") {
        (el as HTMLInputElement).checked = true;
        fire(el, "click", "change");
      } else {
        await typeInto(el as HTMLInputElement | HTMLTextAreaElement, f.value, fire);
      }
      filled.push({ selector: f.selector, label: f.label });
    } catch {
      failed.push({ selector: f.selector, label: f.label, reason: "Could not set value." });
    }
  }

  // Fade the cursor out once done.
  cursor.style.transition = "transform 240ms cubic-bezier(0.22,1,0.36,1), opacity 400ms ease";
  cursor.style.opacity = "0";
  setTimeout(() => cursor.remove(), 500);

  return { filled, failed };
}
