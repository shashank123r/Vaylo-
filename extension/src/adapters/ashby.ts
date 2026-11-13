import { makeAdapter } from "./factory";

// Ashby job boards (jobs.ashbyhq.com). Ashby renders dynamic React forms with
// accessible labels; selectors below are best-effort. Validate against live pages.
export const ashby = makeAdapter({
  name: "ashby",
  urlRe: /ashbyhq\.com/i,
  containerSelectors: ["form[class*='ApplicationForm']", "[class*='application-form']", "form"],
  companySelectors: ["[class*='JobPostingHeader'] [class*='company']", "[class*='company']"],
  titleSelectors: ["[class*='JobPostingHeader'] h1", "h1"],
});
