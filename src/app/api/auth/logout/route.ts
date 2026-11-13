import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, SESSION_COOKIE } from "@/lib/auth/session";
import { externalUrl } from "@/lib/http/intent";

export async function POST(req: NextRequest) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  await destroySession(token);
  const res = NextResponse.redirect(externalUrl(req, "/"), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
