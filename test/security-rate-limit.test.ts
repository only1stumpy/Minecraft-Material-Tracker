import assert from "node:assert/strict";
import test from "node:test";
import { getRateLimitResult, hashRateLimitKey } from "../lib/security.ts";

test("rate-limit result exposes remaining requests and whole-second retry delay", () => {
  const now = new Date("2026-10-14T12:00:00.000Z");
  const resetAt = new Date("2026-10-14T12:00:05.250Z");

  assert.deepEqual(getRateLimitResult(2, resetAt, now, 3), {
    allowed: true,
    limit: 3,
    remaining: 1,
    retryAfter: 6,
    resetAt,
  });
  assert.deepEqual(getRateLimitResult(4, resetAt, now, 3), {
    allowed: false,
    limit: 3,
    remaining: 0,
    retryAfter: 6,
    resetAt,
  });
});

test("rate-limit key is deterministic, namespaced, and does not expose the identifier", () => {
  const key = hashRateLimitKey("mutation:tasks", "minecraft-player");

  assert.equal(key, hashRateLimitKey("mutation:tasks", "minecraft-player"));
  assert.notEqual(key, hashRateLimitKey("mutation:buildings", "minecraft-player"));
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key.includes("minecraft-player"), false);
});

test("rate-limit key and policy inputs reject empty or unsafe values", () => {
  assert.throws(() => hashRateLimitKey("", "player"), RangeError);
  assert.throws(() => hashRateLimitKey("login", ""), RangeError);
  assert.throws(() => hashRateLimitKey("x".repeat(513), "player"), RangeError);
});
