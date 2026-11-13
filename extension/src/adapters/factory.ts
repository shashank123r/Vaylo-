import type { Adapter } from "./types";
import { buildFields, planFields, textContentOf, detectNavigation, deepCollectControls } from "./shared";

export interface AdapterConfig {
  name: string;
  urlRe: RegExp;
  containerSelectors: string[];
  companySelectors: string[];
  titleSelectors: string[];
}

function findApplicationForm(doc: Document): Element | null {
  // Prefer a <form> that contains a file upload or an email field — the hallmark
  // of an application form — over unrelated forms (search, newsletter).
  const forms = Array.from(doc.querySelectorAll("form"));
  return (
    forms.find((f) => f.querySelector('input[type="file"]')) ??
    forms.find((f) => f.querySelector('input[type="email"]')) ??
    forms[0] ??
    null
  );
}

export function makeAdapter(cfg: AdapterConfig): Adapter {
  return {
    name: cfg.name,
    matches: (url: string) => cfg.urlRe.test(url),
    detect(doc: Document) {
      // Choose the container that ACTUALLY holds the application fields. Picking the
      // first matching selector is wrong when a site wraps a tiny "autofill"/widget
      // element that matches a generic selector but contains almost nothing (e.g.
      // Ashby's autofill pane has a single file input while the real fields live
      // elsewhere in the body). So gather all candidates and pick the one with the
      // most fillable controls; if that's still tiny, fall back to the whole body.
      const candidates: Element[] = [];
      for (const s of cfg.containerSelectors) {
        const e = doc.querySelector(s);
        if (e) candidates.push(e);
      }
      const appForm = findApplicationForm(doc);
      if (appForm) candidates.push(appForm);
      let container: Element = doc.body;
      let best = -1;
      for (const c of candidates) {
        const n = deepCollectControls(c).length;
        if (n > best) {
          best = n;
          container = c;
        }
      }
      if (best < 2) container = doc.body;
      if (!container) return null;
      const fields = buildFields(container, doc);
      if (fields.length === 0) return null;
      const unsupported = fields
        .filter((f) => f.key === "unknown" || f.key.startsWith("sensitive:"))
        .map((f) => f.label)
        .filter(Boolean);
      const nav = detectNavigation(container);
      return {
        ats: cfg.name,
        company: textContentOf(doc, cfg.companySelectors),
        title: textContentOf(doc, cfg.titleSelectors),
        fields,
        unsupported,
        multiStep: nav.hasNext,
        nav,
      };
    },
    plan: (form, profile) => planFields(form, profile),
  };
}
