import "server-only";
import bcrypt from "bcryptjs";

// Cost factor. 12 in production; lower in tests (BCRYPT_ROUNDS) for speed.
const ROUNDS = Math.max(4, Math.min(15, Number(process.env.BCRYPT_ROUNDS ?? 12)));

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
