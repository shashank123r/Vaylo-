import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { getCurrentUser } from "@/lib/auth/current";

// Serves the packaged extension (extension/jobflow-extension.zip) as a direct
// download. Signed-in users only. The zip is produced by `npm run ext:build`.
// This is the interim path until the extension is published to a web store.
const ZIP_PATH = join(process.cwd(), "extension", "jobflow-extension.zip");

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Sign in to download the extension.", { status: 401 });
  }

  try {
    await stat(ZIP_PATH);
  } catch {
    return new Response(
      "The extension package is not built yet. Run `npm run ext:build` to produce it.",
      { status: 404 },
    );
  }

  const buf = await readFile(ZIP_PATH);
  // Copy into a fresh ArrayBuffer so the body is a plain BlobPart.
  const body = new Uint8Array(buf);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="jobflow-extension.zip"',
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
