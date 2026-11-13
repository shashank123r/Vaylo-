import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

// A guest hitting a protected /app URL must be redirected to /login with the
// EXACT path + query preserved, so the workflow resumes after auth.
describe("protected-route proxy (auth guard)", () => {
  it("redirects guests to /login preserving the exact next", () => {
    const url = "http://localhost:3000/app/jobs/import?demo=demo-ml-infra&intent=apply";
    const res = proxy(new NextRequest(new URL(url)));
    expect(res.status).toBe(307);
    const location = res.headers.get("location")!;
    const loc = new URL(location);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/app/jobs/import?demo=demo-ml-infra&intent=apply");
  });

  it("passes through when a session cookie is present", () => {
    const req = new NextRequest(new URL("http://localhost:3000/app"), {
      headers: { cookie: "jf_session=sometoken" },
    });
    const res = proxy(req);
    // NextResponse.next() has no redirect location.
    expect(res.headers.get("location")).toBeNull();
  });
});
