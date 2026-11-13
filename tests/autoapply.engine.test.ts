import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { runApplication } from "@/lib/autoapply/engine";
import type { AutofillProfile } from "../extension/src/adapters/types";

const DIR = join(process.cwd(), "tests", "fixtures", "apply");
let server: Server;
let base = "";
let resumePath = "";

const profile: AutofillProfile = {
  name: "Jordan Lee",
  email: "jordan@example.com",
  phone: "+1 555 0100",
  location: "Austin, USA",
  website: "https://jordan.dev",
  linkedin: "https://linkedin.com/in/jordan",
  github: "https://github.com/jordan",
};

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const name = normalize(decodeURIComponent((req.url || "/").split("?")[0]!)).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\//, "");
    try {
      const html = await readFile(join(DIR, name || "confirm.html"));
      res.writeHead(200, { "content-type": "text/html" });
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  base = typeof addr === "object" && addr ? `http://127.0.0.1:${addr.port}` : "";
  const d = await mkdtemp(join(tmpdir(), "jf-test-"));
  resumePath = join(d, "resume.pdf");
  await writeFile(resumePath, Buffer.from("%PDF-1.4 test resume"));
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("auto-apply engine (real browser, fixture forms)", () => {
  it("fills, uploads the resume, submits when AUTHORIZED, and confirms by evidence", async () => {
    const r = await runApplication({ url: `${base}/confirm.html`, profile, resumePath, autoSubmit: true, authorized: true });
    expect(r.status).toBe("submitted_confirmed");
    expect(r.fileUploaded).toBe(true);
    expect(r.filled.map((f) => f.label).join(" ")).toMatch(/name|email/i);
    expect(r.evidence).toMatch(/application received|thank you/i);
  });

  it("fills but does NOT submit when the run is not authorized", async () => {
    const r = await runApplication({ url: `${base}/confirm.html`, profile, resumePath, autoSubmit: true, authorized: false });
    expect(r.status).toBe("filled");
    expect(r.fileUploaded).toBe(true);
  });

  it("fills but does NOT submit in prepare mode (autoSubmit off)", async () => {
    const r = await runApplication({ url: `${base}/confirm.html`, profile, resumePath, autoSubmit: false, authorized: true });
    expect(r.status).toBe("filled");
  });

  it("PAUSES for sign-in / MFA when a password field is present (never bypasses auth)", async () => {
    const r = await runApplication({ url: `${base}/login.html`, profile, resumePath, autoSubmit: true, authorized: true });
    expect(r.status).toBe("paused");
    expect(r.reason).toMatch(/sign-in|log in|MFA/i);
  });

  it("PAUSES on a CAPTCHA / anti-bot check instead of bypassing it", async () => {
    const r = await runApplication({ url: `${base}/captcha.html`, profile, resumePath, autoSubmit: true, authorized: true });
    expect(r.status).toBe("paused");
    expect(r.reason).toMatch(/captcha|anti-bot/i);
  });

  it("PAUSES on a required sensitive question (sponsorship) instead of guessing", async () => {
    const r = await runApplication({ url: `${base}/sensitive.html`, profile, resumePath, autoSubmit: true, authorized: true });
    expect(r.status).toBe("paused");
    expect(r.reason).toMatch(/required question|sponsor/i);
  });

  it("reports FAILED when the site shows validation errors after submit (no false success)", async () => {
    const r = await runApplication({ url: `${base}/errors.html`, profile, resumePath, autoSubmit: true, authorized: true });
    expect(r.status).toBe("failed");
    expect(r.reason).toMatch(/error/i);
  });

  it("returns unsupported when there is no form", async () => {
    const r = await runApplication({ url: `${base}/missing.html`, profile, resumePath, autoSubmit: true, authorized: true });
    // missing.html 404s -> page has no form fields
    expect(["unsupported", "failed"]).toContain(r.status);
  });
});
