import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, validateSameOrigin } from "@/lib/security";

export async function POST(request: Request) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый источник запроса" }, { status: 403 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!checkRateLimit(`login:${ip}`, 8, 15 * 60_000)) return NextResponse.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
  const body = await request.json().catch(() => null) as { nickname?: unknown; password?: unknown } | null;
  const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const user = nickname ? await prisma.user.findUnique({ where: { minecraftNickname: nickname } }) : null;
  if (!user || user.isBlocked || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Неверный ник или пароль" }, { status: 401 });
  }
  await createSession(user.id, user.sessionVersion);
  await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
  await prisma.auditLog.create({ data: { actorId: user.id, action: "LOGIN", entityType: "User", entityId: user.id } });
  return NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword });
}
