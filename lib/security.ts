import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

const throttleKey = (identifier: string) => createHash("sha256").update(identifier).digest("hex");

export async function checkLoginRateLimit(identifier: string, limit = 8, windowMs = 15 * 60_000) {
  const key = throttleKey(identifier);
  const now = new Date();
  await prisma.authThrottle.deleteMany({ where: { resetAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } } });
  const existing = await prisma.authThrottle.findUnique({ where: { key } });
  if (!existing || existing.resetAt <= now) {
    await prisma.authThrottle.upsert({
      where: { key },
      create: { key, attempts: 1, resetAt: new Date(now.getTime() + windowMs) },
      update: { attempts: 1, resetAt: new Date(now.getTime() + windowMs) },
    });
    return true;
  }
  const updated = await prisma.authThrottle.update({
    where: { key },
    data: { attempts: { increment: 1 } },
    select: { attempts: true },
  });
  return updated.attempts <= limit;
}

export async function clearLoginRateLimit(identifier: string) {
  await prisma.authThrottle.deleteMany({ where: { key: throttleKey(identifier) } });
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
