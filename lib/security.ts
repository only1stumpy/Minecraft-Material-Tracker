import { NextResponse } from "next/server.js";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.ts";

const LOGIN_NAMESPACE = "login";
const MAX_RATE_LIMIT = 2_147_483_646;
const THROTTLE_RETENTION_MS = 24 * 60 * 60_000;

export type RateLimitPolicy = Readonly<{
  limit: number;
  windowMs: number;
}>;

export type RateLimitResult = Readonly<{
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
  resetAt: Date;
}>;

type ThrottleRow = {
  attempts: number;
  resetAt: Date;
};

function validateRateLimitPolicy({ limit, windowMs }: RateLimitPolicy) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RATE_LIMIT) {
    throw new RangeError("Rate limit must be an integer from 1 to 2147483646");
  }
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new RangeError("Rate-limit window must be a positive integer in milliseconds");
  }
}

function validateRateLimitPart(value: string, name: string) {
  if (!value || value.length > 512) {
    throw new RangeError(`${name} must contain from 1 to 512 characters`);
  }
}

/**
 * Hash a namespaced identifier before it reaches the database. The separator
 * keeps `namespace` and `identifier` unambiguous while the digest avoids
 * storing player names, IPs, or session-derived identifiers in plain text.
 */
export function hashRateLimitKey(namespace: string, identifier: string) {
  validateRateLimitPart(namespace, "Rate-limit namespace");
  validateRateLimitPart(identifier, "Rate-limit identifier");
  return createHash("sha256").update(`${namespace}\u0000${identifier}`, "utf8").digest("hex");
}

/**
 * Convert the atomically consumed counter into a stable response for callers.
 * `retryAfter` is expressed in whole seconds for direct use in HTTP headers.
 */
export function getRateLimitResult(
  attempts: number,
  resetAt: Date,
  now: Date,
  limit: number,
): RateLimitResult {
  const retryAfter = Math.max(0, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
  return {
    allowed: attempts <= limit,
    limit,
    remaining: Math.max(0, limit - attempts),
    retryAfter,
    resetAt,
  };
}

/**
 * Consume one request from a database-backed fixed-window bucket.
 *
 * The INSERT ... ON CONFLICT statement is one PostgreSQL operation. Concurrent
 * requests therefore serialize on the primary key instead of racing through a
 * read-then-upsert sequence and accidentally resetting an active window.
 */
export async function checkRateLimit(
  namespace: string,
  identifier: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  validateRateLimitPolicy(policy);
  const key = hashRateLimitKey(namespace, identifier);
  const now = new Date();
  const resetAt = new Date(now.getTime() + policy.windowMs);

  const rows = await prisma.$queryRaw<ThrottleRow[]>(Prisma.sql`
    INSERT INTO "AuthThrottle" ("key", "attempts", "resetAt", "updatedAt")
    VALUES (${key}, 1, ${resetAt}, ${now})
    ON CONFLICT ("key") DO UPDATE
    SET
      "attempts" = CASE
        WHEN "AuthThrottle"."resetAt" <= ${now} THEN 1
        ELSE LEAST("AuthThrottle"."attempts" + 1, ${policy.limit + 1})
      END,
      "resetAt" = CASE
        WHEN "AuthThrottle"."resetAt" <= ${now} THEN ${resetAt}
        ELSE "AuthThrottle"."resetAt"
      END,
      "updatedAt" = ${now}
    RETURNING "attempts", "resetAt"
  `);

  const row = rows[0];
  if (!row) {
    throw new Error("Rate-limit bucket was not returned by the database");
  }
  return getRateLimitResult(row.attempts, new Date(row.resetAt), now, policy.limit);
}

export async function checkMutationRateLimit(
  scope: string,
  userId: string,
  policy: RateLimitPolicy,
): Promise<NextResponse | null> {
  const result = await checkRateLimit(`mutation:${scope}`, userId, policy);
  if (result.allowed) return null;

  const response = NextResponse.json(
    { error: "Слишком много запросов. Повторите позже." },
    { status: 429 },
  );
  response.headers.set("Retry-After", String(result.retryAfter));
  return response;
}

export async function checkLoginRateLimit(identifier: string, limit = 8, windowMs = 15 * 60_000) {
  const now = new Date();
  await prisma.authThrottle.deleteMany({
    where: { resetAt: { lt: new Date(now.getTime() - THROTTLE_RETENTION_MS) } },
  });
  return (await checkRateLimit(LOGIN_NAMESPACE, identifier, { limit, windowMs })).allowed;
}

export async function clearLoginRateLimit(identifier: string) {
  await prisma.authThrottle.deleteMany({ where: { key: hashRateLimitKey(LOGIN_NAMESPACE, identifier) } });
}

export function validateSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try { return new URL(referer).host === new URL(request.url).host; } catch { return false; }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}

export function forbidden(message = "Недостаточно прав") {
  return NextResponse.json({ error: message }, { status: 403 });
}
