import type { Adapter } from "./types";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { ashby } from "./ashby";
import { generic } from "./generic";

export const ADAPTERS: Adapter[] = [greenhouse, lever, ashby];

/**
 * Returns the DEDICATED adapter for this URL, or null when none matches. The
 * generic fallback is intentionally NOT in this list, so callers can distinguish
 * "a site we have a tuned adapter for" from "best-effort generic". Use
 * `pickAdapter(url) ?? generic` to get an adapter that also handles unknown sites.
 */
export function pickAdapter(url: string): Adapter | null {
  return ADAPTERS.find((a) => a.matches(url)) ?? null;
}

/** The adapter to actually use for autofill: a dedicated one if we have it, else generic. */
export function adapterFor(url: string): Adapter {
  return pickAdapter(url) ?? generic;
}

export * from "./types";
export { greenhouse, lever, ashby, generic };
export { collectValidationErrors, detectNavigation } from "./shared";
