import { NextResponse } from "next/server";
import { getCurrentUser, destroyCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSameOrigin } from "@/lib/security";

export async function POST(request: Request) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый запрос" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.auditLog.create({ data: { actorId: user.id, action: "LOGOUT_ALL", entityType: "User", entityId: user.id } }),
  ]);
  await destroyCurrentSession();
  return NextResponse.json({ ok: true });
}
