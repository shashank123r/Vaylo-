import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { createPairing } from "@/lib/extension/pairing";

// Web-session authenticated: issues a one-time pairing token the user copies into
// the extension. The raw token is returned exactly once and only here.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { token, expiresAt } = await createPairing(user.id);
  return NextResponse.json(
    { token, expiresAt: expiresAt.toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
