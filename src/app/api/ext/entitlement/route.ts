import { NextRequest, NextResponse } from "next/server";
import { requireExtensionUser } from "@/lib/extension/auth";
import { getQuota } from "@/lib/billing/entitlement";

// Checked by the extension BEFORE a final submit. If canSubmit is false, the
// extension stops and shows the upgrade path; it does not click submit.
export async function GET(req: NextRequest) {
  const user = await requireExtensionUser(req);
  if (!user) return NextResponse.json({ error: "Invalid or expired pairing" }, { status: 401 });
  const quota = await getQuota(user.id);
  return NextResponse.json(quota, { headers: { "Cache-Control": "no-store" } });
}
