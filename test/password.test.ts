import assert from "node:assert/strict";
import test from "node:test";
import { generateTemporaryPassword, hashPassword, validatePassword, verifyPassword } from "../lib/password.ts";

test("пароль хранится как scrypt-хеш и проверяется безопасно", async () => {
  const hash = await hashPassword("SecurePassword2026");
  assert.match(hash, /^scrypt:/);
  assert.equal(await verifyPassword("SecurePassword2026", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
});

test("временный пароль случаен и соответствует политике", () => {
  const first = generateTemporaryPassword(); const second = generateTemporaryPassword();
  assert.notEqual(first, second); assert.equal(validatePassword(first), true);
});

test("политика отклоняет слишком короткие и чрезмерно длинные пароли", () => {
  assert.equal(validatePassword("short1"), false);
  assert.equal(validatePassword(`Secure1${"x".repeat(130)}`), false);
});
