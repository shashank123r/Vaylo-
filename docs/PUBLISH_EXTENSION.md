# Publishing the browser extension (so customers can install it)

End users cannot run `npm run ext:build` or "Load unpacked" — that is a developer
flow. For a shipped product, you publish the extension **once** to a browser web
store, and users install it with one click. This is a one-time owner task.

After publishing, set `EXTENSION_WEBSTORE_URL` in the app's environment to your
listing URL. The Extension settings page then shows an **Add to browser** button
instead of the developer instructions. Until it is set, the page honestly shows the
developer build flow.

---

## 1. Prepare the package

1. Build it **pointed at your deployed app** so the extension talks to production,
   not localhost:
   ```bash
   APP_URL=https://your-app-domain.com npm run ext:build
   ```
   This templates the manifest's host/content-script matches and the default
   backend URL with your origin (localhost is kept too, so the same build still
   works in dev). Output is `extension/dist`.
2. Confirm `extension/dist/manifest.json`:
   - `name`, `description`, `version` are correct.
   - `host_permissions` list only the ATS domains you support (Greenhouse, Lever,
     Ashby) plus your JobFlow URL — nothing broader.
   - Icons are present (16/32/48/128).
3. Zip the **contents** of `extension/dist` (not the folder itself):
   `cd extension/dist && zip -r ../jobflow-extension.zip .`

## 2. Chrome Web Store (primary)

1. Create a developer account at
   https://chromewebstore.google.com/u/0/devconsole — one-time $5 USD fee.
2. "Add new item" → upload `jobflow-extension.zip`.
3. Fill the listing: name, summary, screenshots, category, a **privacy policy URL**,
   and the data-use disclosures (declare that you handle the user's profile/resume
   data, and that you do NOT sell it).
4. Justify each permission in the review notes (why you need each host).
5. Submit for review. Approval typically takes a few business days.
6. On approval you get a permanent URL:
   `https://chromewebstore.google.com/detail/<name>/<extension-id>`.

After it is live:
- Set `EXTENSION_WEBSTORE_URL` to that URL and redeploy.
- Set `EXTENSION_ALLOWED_ORIGIN=chrome-extension://<extension-id>` so pairing
  accepts the published extension's origin.

## 3. Edge Add-ons and Firefox (optional)

- Edge: https://partner.microsoft.com/dashboard/microsoftedge — accepts the same
  MV3 zip, free.
- Firefox: https://addons.mozilla.org/developers/ — may need minor manifest
  adjustments; free.
  `EXTENSION_WEBSTORE_URL` accepts any of these store URLs.

## 4. Updates

Bump `version` in the manifest, rebuild, zip, and upload a new package to the same
listing. Users auto-update; no action on their side. The pairing flow and
`EXTENSION_WEBSTORE_URL` do not change.

## Notes

- The pairing code is still required after install: the user pastes it once so the
  extension talks to their JobFlow account. The store install and the pairing are
  separate steps on purpose (install = get the software; pair = authorize it).
- Never ship a build that requests broad `<all_urls>` host permissions or reads
  pages outside the supported ATS domains — stores reject it and it is a privacy
  risk.
