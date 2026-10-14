import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { generateTemporaryPassword, hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { validateSameOrigin } from "@/lib/security";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый запрос" }, { status: 403 });
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "ADMIN") return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  const { id } = await params;
  if (id === actor.id) return NextResponse.json({ error: "Изменяйте собственный пароль и сессии через профиль" }, { status: 400 });
  const body = await request.json().catch(() => null) as { action?: unknown; nickname?: unknown; role?: unknown; blocked?: unknown } | null;
  let temporaryPassword: string | undefined;
  const data: Prisma.UserUpdateInput = {};
  if (body?.action === "resetPassword") {
    temporaryPassword = generateTemporaryPassword();
    data.passwordHash = await hashPassword(temporaryPassword); data.mustChangePassword = true; data.sessionVersion = { increment: 1 };
  } else {
    if (typeof body?.nickname === "string" && /^[A-Za-z0-9_]{3,16}$/.test(body.nickname)) data.minecraftNickname = body.nickname;
    if (body?.role === "ADMIN" || body?.role === "PLAYER") data.role = body.role;
    if (typeof body?.blocked === "boolean") { data.isBlocked = body.blocked; data.sessionVersion = { increment: 1 }; }
  }
  const user = await prisma.user.update({ where: { id }, data });
  if (data.sessionVersion) await prisma.session.deleteMany({ where: { userId: id } });
  await prisma.auditLog.create({ data: { actorId: actor.id, action: body?.action === "resetPassword" ? "PASSWORD_RESET" : "USER_UPDATED", entityType: "User", entityId: id } });
  return NextResponse.json({ user: { id: user.id, minecraftNickname: user.minecraftNickname, role: user.role, isBlocked: user.isBlocked }, temporaryPassword });
}
