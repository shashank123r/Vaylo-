import { makeAdapter } from "./factory";

// Greenhouse job boards (boards.greenhouse.io, job-boards.greenhouse.io, grnh.se).
// Selectors reflect common Greenhouse markup; VALIDATE against live pages before
// relying on it in production (see JOBFLOW_STATUS.md).
export const greenhouse = makeAdapter({
  name: "greenhouse",
  urlRe: /greenhouse\.io|grnh\.se/i,
  containerSelectors: ["#application_form", "form#application-form", ".application--form", "form[action*='greenhouse']"],
  companySelectors: [".company-name", "[class*='company']", ".app-title + *"],
  titleSelectors: [".app-title", ".job__title h1", "h1.app-title", "h1"],
});
