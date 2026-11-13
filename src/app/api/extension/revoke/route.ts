import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { revokePairing } from "@/lib/extension/pairing";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  await revokePairing(user.id);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
