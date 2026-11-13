import { makeAdapter } from "./factory";

// Lever postings (jobs.lever.co). Selectors reflect common Lever markup; validate
// against live pages before production use.
export const lever = makeAdapter({
  name: "lever",
  urlRe: /jobs\.lever\.co|lever\.co/i,
  containerSelectors: ["form.application-form", ".application-form", "form[action*='lever']"],
  companySelectors: [".main-header-logo img", "[data-qa='company-name']", ".posting-headline h2 + *"],
  titleSelectors: [".posting-headline h2", "[data-qa='posting-name']", "h2"],
});
