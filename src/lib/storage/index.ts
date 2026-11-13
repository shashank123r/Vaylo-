import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { env } from "@/lib/env";

// Private file storage. Files live outside the web root and are only ever served
// to their owner through an authorized route. Keys are random; never derived from
// user input, so there is no path-traversal surface.

const BASE = resolve(process.cwd(), env.STORAGE_LOCAL_DIR);

function keyToPath(key: string): string {
  // Keys are hex from newKey(); reject anything else as a defense in depth.
  if (!/^[a-f0-9]{32,}$/.test(key)) throw new Error("Invalid storage key");
  return join(BASE, key);
}

export function newKey(): string {
  return randomBytes(24).toString("hex");
}

export async function put(key: string, data: Buffer): Promise<void> {
  await mkdir(BASE, { recursive: true });
  await writeFile(keyToPath(key), data, { mode: 0o600 });
}

export async function get(key: string): Promise<Buffer> {
  return readFile(keyToPath(key));
}

export async function remove(key: string): Promise<void> {
  await unlink(keyToPath(key)).catch(() => {});
}
