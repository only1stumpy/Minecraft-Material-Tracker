import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { generateTemporaryPassword, hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { validateSameOrigin } from "@/lib/security";

type UpdateBody = {
  action?: unknown;
  nickname?: unknown;
  role?: unknown;
  blocked?: unknown;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validateSameOrigin(request)) {
    return NextResponse.json({ error: "Недопустимый запрос" }, { status: 403 });
  }
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (actor.role !== "ADMIN") return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });

  const { id } = await params;
  if (id === actor.id) {
    return NextResponse.json({ error: "Изменяйте собственный пароль и сессии через профиль" }, { status: 400 });
  }
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  const body = await request.json().catch(() => null) as UpdateBody | null;
  if (!body) return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });

  let temporaryPassword: string | undefined;
  const data: Prisma.UserUpdateInput = {};
  if (body.action === "resetPassword") {
    temporaryPassword = generateTemporaryPassword();
    data.passwordHash = await hashPassword(temporaryPassword);
    data.mustChangePassword = true;
    data.sessionVersion = { increment: 1 };
  } else {
    if (body.nickname !== undefined) {
      if (typeof body.nickname !== "string" || !/^[A-Za-z0-9_]{3,16}$/.test(body.nickname)) {
        return NextResponse.json({ error: "Некорректный Minecraft-ник" }, { status: 400 });
      }
      data.minecraftNickname = body.nickname;
      data.normalizedNickname = body.nickname.toLowerCase();
    }
    if (body.role !== undefined) {
      if (body.role !== "ADMIN" && body.role !== "PLAYER") {
        return NextResponse.json({ error: "Некорректная роль" }, { status: 400 });
      }
      data.role = body.role;
    }
    if (body.blocked !== undefined) {
      if (typeof body.blocked !== "boolean") return NextResponse.json({ error: "Некорректный статус" }, { status: 400 });
      data.isBlocked = body.blocked;
      data.sessionVersion = { increment: 1 };
    }
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Нет изменений" }, { status: 400 });
  if (target.role === "ADMIN" && (data.role === "PLAYER" || data.isBlocked === true)) {
    const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", isBlocked: false } });
    if (activeAdmins <= 1) return NextResponse.json({ error: "Нельзя отключить последнего администратора" }, { status: 409 });
  }

  try {
    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.user.update({ where: { id }, data });
      if (data.sessionVersion) await tx.session.deleteMany({ where: { userId: id } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: body.action === "resetPassword" ? "PASSWORD_RESET" : "USER_UPDATED", entityType: "User", entityId: id } });
      return updated;
    });
    return NextResponse.json({ user: { id: user.id, minecraftNickname: user.minecraftNickname, role: user.role, isBlocked: user.isBlocked }, temporaryPassword });
  } catch {
    return NextResponse.json({ error: "Не удалось изменить пользователя. Проверьте уникальность ника." }, { status: 409 });
  }
}
