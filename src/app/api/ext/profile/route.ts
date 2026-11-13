import { NextRequest, NextResponse } from "next/server";
import { requireExtensionUser } from "@/lib/extension/auth";
import { buildAutofillProfile } from "@/lib/extension/profile";
import { getQuota } from "@/lib/billing/entitlement";

export async function GET(req: NextRequest) {
  const user = await requireExtensionUser(req);
  if (!user) return NextResponse.json({ error: "Invalid or expired pairing" }, { status: 401 });
  const [profile, quota] = await Promise.all([buildAutofillProfile(user.id), getQuota(user.id)]);
  return NextResponse.json({ profile, quota }, { headers: { "Cache-Control": "no-store" } });
}
