import "server-only";
import { chromium, type Browser } from "playwright";

// Launches a headless Chromium for the server-side apply engine. Headless by
// default; it never persists cookies or credentials. Used only for filling and
// (when explicitly authorized) submitting supported employer forms.
//
// The flags make it safe inside a container: --no-sandbox is required when the
// process runs as root (the default in our image), and --disable-dev-shm-usage
// avoids Chromium crashing on the small default /dev/shm (64 MB) in Docker.
export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}
