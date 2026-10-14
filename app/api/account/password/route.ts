import { NextResponse } from "next/server";
import { createSession, getCurrentUser } from "@/lib/auth";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { validateSameOrigin } from "@/lib/security";

export async function POST(request: Request) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый запрос" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  const body = await request.json().catch(() => null) as { currentPassword?: unknown; newPassword?: unknown } | null;
  const current = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const next = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (!(await verifyPassword(current, user.passwordHash))) return NextResponse.json({ error: "Текущий пароль неверен" }, { status: 400 });
  if (!validatePassword(next)) return NextResponse.json({ error: "Пароль должен содержать не менее 12 символов, буквы и цифры" }, { status: 400 });
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false, sessionVersion: { increment: 1 } } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.auditLog.create({ data: { actorId: user.id, action: "PASSWORD_CHANGED", entityType: "User", entityId: user.id } }),
  ]);
  await createSession(user.id, user.sessionVersion + 1);
  return NextResponse.json({ ok: true });
}
