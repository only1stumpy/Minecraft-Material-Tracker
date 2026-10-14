import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt);
const KEY_LENGTH = 64;

export function generateTemporaryPassword() {
  return `Av1-${randomBytes(18).toString("base64url")}`;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, storedHex] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !storedHex) return false;
  const stored = Buffer.from(storedHex, "hex");
  if (stored.length !== KEY_LENGTH) return false;
  const candidate = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return timingSafeEqual(stored, candidate);
}

export function validatePassword(password: string) {
  return password.length >= 8 && password.length <= 128 && /[a-zа-я]/i.test(password) && /\d/.test(password);
}
