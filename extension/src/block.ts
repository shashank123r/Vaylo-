// Pure page-safety check, shared by the content script and tested in jsdom.
// Detects a login wall or a CAPTCHA/verification challenge. When present we must
// PAUSE and let the user complete it — never fill or bypass it.

export function detectBlock(doc: Document): string | null {
  if (
    doc.querySelector(
      'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[title*="captcha" i], .g-recaptcha, .h-captcha, [data-hcaptcha-widget-id], [data-sitekey]',
    )
  ) {
    return "A CAPTCHA / verification is on this page. Complete it yourself, then run again.";
  }
  // A password field signals a sign-in / account wall. Real application forms use a
  // resume/file upload, not a password, so if there is a password and NO file upload
  // on the page, treat it as a login wall and pause (never auto-fill credentials).
  if (doc.querySelector('input[type="password"]') && !doc.querySelector('input[type="file"]')) {
    return "This page requires sign-in. Log in yourself, then run again.";
  }
  return null;
}

const EXPIRED_RE =
  /no longer (accepting|available|open)|this (job|position|posting|role|requisition|vacancy|opening) (is|has been|has|was)\s+(closed|expired|filled|removed|no longer)|position (has been )?filled|applications?\s+(are\s+)?closed|posting (has )?expired|we are no longer accepting|this posting is no longer|(job|vacancy|requisition|role)\s+(is\s+)?closed|closed\s+for\s+applications|expired\s+job|this listing has expired/i;

// Detects a closed / expired / filled posting. Only meaningful when NO application
// form is present (a real open form takes precedence), so the caller checks it in
// that branch. Returns a reason or null.
export function detectExpired(doc: Document): string | null {
  const text = (doc.body?.textContent || "").replace(/\s+/g, " ");
  return EXPIRED_RE.test(text)
    ? "This posting appears closed or expired — no longer accepting applications."
    : null;
}
