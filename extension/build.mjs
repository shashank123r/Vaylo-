// Bundles the JobFlow Chrome extension into extension/dist for "Load unpacked".
// Set APP_URL to your deployed app origin before publishing (e.g.
//   APP_URL=https://app.jobflow.com npm run ext:build
// ); the manifest's host/content-script matches and the default backend URL are
// templated from it. Localhost is always kept so the same build works in dev.
import { build } from "esbuild";
import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");

const DEV_URL = "http://localhost:3000";
const APP_URL = (process.env.APP_URL || DEV_URL).replace(/\/+$/, "");
let appOrigin;
try {
  appOrigin = new URL(APP_URL).origin;
} catch {
  throw new Error(`APP_URL is not a valid URL: ${APP_URL}`);
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const common = {
  bundle: true,
  target: "chrome120",
  logLevel: "info",
  minify: false,
  sourcemap: false,
  // Inject the deployed app origin so the extension defaults to the right backend.
  define: { __APP_URL__: JSON.stringify(appOrigin) },
};

await build({ ...common, entryPoints: [join(root, "src/background.ts")], outfile: join(dist, "background.js"), format: "esm" });
await build({ ...common, entryPoints: [join(root, "src/content.ts")], outfile: join(dist, "content.js"), format: "iife" });
await build({ ...common, entryPoints: [join(root, "src/popup.ts")], outfile: join(dist, "popup.js"), format: "iife" });
await build({ ...common, entryPoints: [join(root, "src/bridge.ts")], outfile: join(dist, "bridge.js"), format: "iife" });

await cp(join(root, "public"), dist, { recursive: true });

// Template the manifest's host/content-script matches with the deployed origin.
// Always keep localhost so one build works both in dev and in production.
const manifestPath = join(dist, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const appMatch = `${appOrigin}/*`;
const devMatch = `${DEV_URL}/*`;
const ensure = (arr, vals) => Array.from(new Set([...vals, ...arr]));
if (appOrigin !== DEV_URL) {
  manifest.host_permissions = ensure(manifest.host_permissions, [devMatch, appMatch]);
  for (const cs of manifest.content_scripts ?? []) {
    cs.matches = ensure(cs.matches, [devMatch, appMatch]);
  }
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Extension backend origin: ${appOrigin}`);

// Also package dist/ into a zip the app can offer as a direct download.
// Zip the CONTENTS of dist (not the folder) so unzipping yields a loadable folder.
const zipPath = join(root, "jobflow-extension.zip");
await rm(zipPath, { force: true });
try {
  execFileSync("zip", ["-r", "-q", zipPath, "."], { cwd: dist, stdio: "inherit" });
  console.log("Packaged -> extension/jobflow-extension.zip (served at /api/extension/download)");
} catch (err) {
  console.warn("Could not create zip (is the `zip` CLI installed?):", err.message);
}

console.log("Extension built -> extension/dist (Load unpacked that folder in chrome://extensions)");
