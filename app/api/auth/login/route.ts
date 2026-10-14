import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { checkLoginRateLimit, clearLoginRateLimit, validateSameOrigin } from "@/lib/security";

const FAKE_PASSWORD_HASH = "scrypt:00000000000000000000000000000000:373f8e9a7e5369a3f3a924ff35878d76d6b3a7b2b07c08bfa2dfc6668c6509ea582588264f33c6a923cce6a7ff40ceb56e4884712a16c1df06535d301e24b7d1";

export async function POST(request: Request) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый источник запроса" }, { status: 403 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const body = await request.json().catch(() => null) as { nickname?: unknown; password?: unknown } | null;
  const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const rateLimitKey = `${ip}:${nickname.toLowerCase()}`;
  if (!(await checkLoginRateLimit(rateLimitKey))) return NextResponse.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
  const user = nickname ? await prisma.user.findUnique({ where: { normalizedNickname: nickname.toLowerCase() } }) : null;
  const passwordIsValid = await verifyPassword(password, user?.passwordHash ?? FAKE_PASSWORD_HASH);
  if (!user || user.isBlocked || !passwordIsValid) {
    return NextResponse.json({ error: "Неверный ник или пароль" }, { status: 401 });
  }
  await clearLoginRateLimit(rateLimitKey);
  await createSession(user.id, user.sessionVersion);
  await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
  await prisma.auditLog.create({ data: { actorId: user.id, action: "LOGIN", entityType: "User", entityId: user.id } });
  return NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword });
}
