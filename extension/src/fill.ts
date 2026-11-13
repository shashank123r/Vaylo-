import type { FieldPlan } from "./adapters/types";

// Resolve a selector across OPEN shadow roots: a plain doc.querySelector cannot see
// elements inside a shadow DOM (e.g. Ashby's application fields), so we descend into
// shadow roots when the light-DOM lookup misses.
export function deepQuerySelector(root: Document | ShadowRoot, selector: string): Element | null {
  const direct = root.querySelector(selector);
  if (direct) return direct;
  for (const el of Array.from(root.querySelectorAll("*"))) {
    const sr = (el as HTMLElement).shadowRoot;
    if (sr) {
      const found = deepQuerySelector(sr, selector);
      if (found) return found;
    }
  }
  return null;
}

export interface FillOutcome {
  filled: { selector: string; label: string }[];
  failed: { selector: string; label: string; reason: string }[];
}

// Sets a value through the element's native setter so React/Vue, which track the
// value via their own property descriptor, actually register the change.
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // Prefer the prototype's value setter so React (which overrides the instance
  // setter and tracks the previous value) registers the change. We find it by
  // walking the element's own prototype chain, so this works in any realm (the
  // page's window in the browser, jsdom's window in tests) without referencing a
  // global HTMLInputElement. Falls back to a direct assignment if needed.
  let obj: object | null = el;
  let desc: PropertyDescriptor | undefined;
  while (obj && !(desc = Object.getOwnPropertyDescriptor(obj, "value"))) {
    obj = Object.getPrototypeOf(obj);
  }
  try {
    desc?.set?.call(el, value);
  } catch {
    /* fall through to direct assignment */
  }
  if (el.value !== value) el.value = value;
}

function truthy(v: string): boolean {
  return /^(yes|true|on|1|checked)$/i.test(v.trim());
}

// Applies a plan's fills to the live DOM. This is exactly what the content script
// runs in the user's tab. It only writes values the plan produced (which excludes
// sensitive questions and anything missing from the profile). It never clicks
// submit. File uploads are handled via the real <input type=file> control, which
// scripts cannot set for security reasons — the user attaches the file.
export function applyFills(doc: Document, plan: FieldPlan): FillOutcome {
  const filled: FillOutcome["filled"] = [];
  const failed: FillOutcome["failed"] = [];
  const view = doc.defaultView ?? (globalThis as unknown as Window);
  const EventCtor: typeof Event = (view as unknown as { Event: typeof Event }).Event ?? Event;
  const fire = (el: Element, ...types: string[]) =>
    types.forEach((t) => el.dispatchEvent(new EventCtor(t, { bubbles: true })));

  for (const f of plan.fills) {
    const el = deepQuerySelector(doc, f.selector) as HTMLElement | null;
    if (!el) {
      failed.push({ selector: f.selector, label: f.label, reason: "Field not found on page." });
      continue;
    }
    try {
      const tag = el.tagName.toLowerCase();
      const inputType = (el.getAttribute("type") ?? "").toLowerCase();

      if (tag === "select") {
        const select = el as HTMLSelectElement;
        const opt = Array.from(select.options).find(
          (o) => o.value === f.value || o.text.trim() === f.value,
        );
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
        setNativeValue(el as HTMLInputElement | HTMLTextAreaElement, f.value);
        fire(el, "input", "change");
      }
      filled.push({ selector: f.selector, label: f.label });
    } catch {
      failed.push({ selector: f.selector, label: f.label, reason: "Could not set value." });
    }
  }
  return { filled, failed };
}
