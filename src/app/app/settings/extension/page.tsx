import { getCurrentUser } from "@/lib/auth/current";
import { getConnectionStatus } from "@/lib/extension/pairing";
import { getQuota } from "@/lib/billing/entitlement";
import { env } from "@/lib/env";
import { PairingPanel } from "./PairingPanel";
import { PageHeader } from "@/components/ui";

export default async function ExtensionSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const user = (await getCurrentUser())!;
  const sp = await searchParams;
  const [status, quota] = await Promise.all([getConnectionStatus(user.id), getQuota(user.id)]);
  const storeUrl = env.EXTENSION_WEBSTORE_URL;

  return (
    <div className="mx-auto max-w-reading animate-fade-in">
      <PageHeader
        title="Browser extension"
        subtitle="The Vaylo extension fills supported application forms from your approved profile. You review and submit yourself, and confirm every result — it never clicks submit for you."
      />

      {sp.from === "auto-apply" && !status.connected && (
        <div className="mb-4 rounded-md border border-brick/20 bg-brick-soft px-4 py-3 text-sm text-ink">
          <strong>Connect the extension to run live browser auto-apply.</strong>
          <span className="mt-1 block text-ink-muted">
            Just two things: (1) build &amp; load the extension below, (2) generate a pairing code and
            paste it in. Then go back to Auto-apply.
          </span>
        </div>
      )}

      <div className="card mt-6 p-5">
        <h2 className="font-semibold">Your submission allowance</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {quota.subscribed ? (
            <>
              You are on Pro: up to <strong>{quota.limit}</strong> confirmed successful submissions per day
              (resets at midnight IST). <strong>{quota.used}</strong> used today, <strong>{quota.remaining}</strong> left.
              Failed, blocked, or ambiguous attempts never count.
            </>
          ) : (
            <>
              Free accounts get <strong>{quota.limit}</strong> confirmed successful submissions. You
              have used <strong>{quota.used}</strong>; <strong>{quota.remaining}</strong> left. Failed
              attempts never count. After the free limit, an active subscription is required.
            </>
          )}
        </p>
      </div>

      <div className="mt-6">
        <PairingPanel initialConnected={status.connected} />
      </div>

      {storeUrl ? (
        <div className="card mt-6 p-5">
          <h2 className="font-semibold">Install the extension</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Add it to your browser in one click, then paste a pairing code from above.
          </p>
          <a
            href={storeUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-primary mt-3 inline-block"
          >
            Add to browser
          </a>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-ink-muted">
            <li>Click <strong>Add to browser</strong> and confirm the install in your browser.</li>
            <li>Open the extension and paste a pairing code from above. You only pair once.</li>
            <li>
              On a supported job page (Greenhouse, Lever, Ashby), open the extension and click{" "}
              <strong>Fill this application</strong>. Review, attach your resume, submit on the site,
              then report the outcome.
            </li>
          </ol>
          <p className="mt-3 text-xs text-ink-muted">
            Supported today: Greenhouse, Lever, Ashby (best-effort; validate on live pages). Other sites
            show an honest manual-fallback message.
          </p>
        </div>
      ) : (
        <div className="card mt-6 p-5">
          <h2 className="font-semibold">Install the extension (developer build)</h2>
          <p className="mt-1 text-sm text-ink-muted">
            The extension is not yet published to a web store, so it is installed manually. Once it is
            published, this page shows a one-click <strong>Add to browser</strong> button instead.
          </p>
          <a href="/api/extension/download" className="btn-primary mt-3 inline-block" download>
            Download extension (.zip)
          </a>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-muted">
            <li>
              <strong>Download</strong> the zip above and unzip it to a folder you will keep (or build
              it yourself with <code className="rounded bg-surface-2 px-1">npm run ext:build</code> →{" "}
              <code className="rounded bg-surface-2 px-1">extension/dist</code>).
            </li>
            <li>
              Open <code className="rounded bg-surface-2 px-1">chrome://extensions</code>, turn on Developer
              mode, click <strong>Load unpacked</strong>, and choose the unzipped folder.
            </li>
            <li>
              Open the extension and paste a pairing code from above. That is all — the extension already
              knows your Vaylo address, and you only pair once.
            </li>
            <li>
              On a supported job page (Greenhouse, Lever, Ashby), open the extension and click{" "}
              <strong>Fill this application</strong>. Review, attach your resume, submit on the site, then
              report the outcome.
            </li>
          </ol>
          <p className="mt-3 text-xs text-ink-muted">
            Supported today: Greenhouse, Lever, Ashby (best-effort; validate on live pages). Other sites
            show an honest manual-fallback message.
          </p>
        </div>
      )}
    </div>
  );
}
