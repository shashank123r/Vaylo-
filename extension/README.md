# JobFlow Autofill — Chrome extension (MV3)

Fills **supported** job application forms from your approved JobFlow profile. You
review every field, attach your resume, and submit on the site yourself. The
extension **never clicks submit for you** and never answers sensitive questions.

## Build & install (Load unpacked)

```bash
# from the project root
npm run ext:build          # bundles to extension/dist
```

1. Open `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select the `extension/dist` folder.
3. In JobFlow, go to **Settings → Browser extension**, click **Generate pairing code**.
4. Open the extension, set your JobFlow URL (default `http://localhost:3000`), paste the code, **Connect**.

## How it works

- The extension pairs with your account using a short-lived (30-day), revocable
  token stored in extension storage — never in a web page.
- On a supported job page, click **Fill this application**. The background worker
  fetches your approved profile from the backend and injects a content script
  that detects the form and fills the safe fields.
- **Sensitive questions** (work authorization/sponsorship, gender, race, veteran,
  disability, salary, criminal history, age) and anything it can't map are left
  for you, with a reason shown.
- **Resume upload**: browsers do not let scripts set a file input for security, so
  the extension detects the control and asks you to attach the file yourself.
- After you submit on the site, report the outcome (Confirmed / Failed / Not sure).
  The backend records it idempotently and consumes a free-quota slot **only** on a
  confirmed success. Failed/uncertain never count.

## Supported ATS (matrix)

| ATS        | URL pattern                    | Detection | Status                          |
|------------|--------------------------------|-----------|---------------------------------|
| Greenhouse | `*.greenhouse.io`, `grnh.se`   | yes       | adapter + tests; validate live  |
| Lever      | `jobs.lever.co`                | yes       | adapter + tests; validate live  |
| Ashby      | `jobs.ashbyhq.com`             | yes       | adapter + tests; validate live  |
| Others     | —                              | no        | honest manual-fallback message  |

Adapters are unit-tested against local fixture HTML (`tests/adapters.test.ts`,
`tests/fill.test.ts`). They have **not** been verified against live employer
pages from the build environment; validate on real pages before production use.

## Security

- Minimal permissions: `storage`, `activeTab`, `scripting`, `sidePanel`; host
  permission only for your JobFlow backend. ATS hosts are **optional** permissions.
- The pairing token never enters the page or any third-party site.
- The extension reads only the application form, not unrelated page content.
- It never transmits website passwords, cookies, or page content to the backend
  or any model. It never bypasses CAPTCHA, MFA, or anti-bot protections — it pauses
  for you.
- The backend is the source of truth for applications, quota and entitlements, and
  enforces per-user isolation on every extension request.
