import { NextResponse } from "next/server";
import type { Prisma, UserRole } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { generateTemporaryPassword, hashPassword } from "@/lib/password";
import { createUserNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { checkMutationRateLimit, validateSameOrigin } from "@/lib/security";

type UpdateBody = { action?: unknown; nickname?: unknown; role?: unknown; blocked?: unknown };
const ROLES = ["ADMIN", "MODERATOR", "PLAYER"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый запрос" }, { status: 403 });
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (actor.role !== "ADMIN" || actor.mustChangePassword) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  const rateLimit = await checkMutationRateLimit("admin-user-update", actor.id, { limit: 30, windowMs: 60_000 });
  if (rateLimit) return rateLimit;
  const { id } = await params;
  if (id === actor.id) return NextResponse.json({ error: "Меняйте собственный пароль через профиль" }, { status: 400 });

  const body = await request.json().catch(() => null) as UpdateBody | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });

  let temporaryPassword: string | undefined;
  let passwordHash: string | undefined;
  if (body.action === "resetPassword") {
    if (body.role !== undefined || body.nickname !== undefined || body.blocked !== undefined) return NextResponse.json({ error: "Сброс пароля должен быть отдельной операцией" }, { status: 400 });
    temporaryPassword = generateTemporaryPassword();
    passwordHash = await hashPassword(temporaryPassword);
  } else {
    if (body.action !== undefined) return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
    if (body.nickname !== undefined && (typeof body.nickname !== "string" || !/^[A-Za-z0-9_]{3,16}$/.test(body.nickname))) return NextResponse.json({ error: "Некорректный Minecraft-ник" }, { status: 400 });
    if (body.role !== undefined && (typeof body.role !== "string" || !(ROLES as readonly string[]).includes(body.role))) return NextResponse.json({ error: "Некорректная роль" }, { status: 400 });
    if (body.blocked !== undefined && typeof body.blocked !== "boolean") return NextResponse.json({ error: "Некорректный статус блокировки" }, { status: 400 });
    if (body.nickname === undefined && body.role === undefined && body.blocked === undefined) return NextResponse.json({ error: "Нет изменений" }, { status: 400 });
  }

  try {
    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new Error("USER_NOT_FOUND");
      const data: Prisma.UserUpdateInput = {};
      let shouldRevokeSessions = false;
      let action = "USER_UPDATED";

      if (body.action === "resetPassword") {
        data.passwordHash = passwordHash;
        data.mustChangePassword = true;
        action = "PASSWORD_RESET";
        shouldRevokeSessions = true;
      } else {
        if (body.nickname !== undefined && typeof body.nickname === "string") {
          data.minecraftNickname = body.nickname;
          data.normalizedNickname = body.nickname.toLowerCase();
        }
        if (body.role !== undefined && typeof body.role === "string") {
          const role = body.role as UserRole;
          if (role !== target.role) { data.role = role; shouldRevokeSessions = true; }
        }
        if (body.blocked !== undefined && typeof body.blocked === "boolean") {
          if (body.blocked !== target.isBlocked) { data.isBlocked = body.blocked; shouldRevokeSessions = true; }
        }
        const removesActiveAdmin = target.role === "ADMIN" && !target.isBlocked && (data.role !== undefined || data.isBlocked === true);
        if (removesActiveAdmin) {
          const activeAdmins = await tx.user.count({ where: { role: "ADMIN", isBlocked: false } });
          if (activeAdmins <= 1) throw new Error("LAST_ADMIN");
        }
      }

      if (Object.keys(data).length === 0) throw new Error("NO_CHANGES");
      if (shouldRevokeSessions) data.sessionVersion = { increment: 1 };
      const updated = await tx.user.update({ where: { id }, data });
      if (shouldRevokeSessions) await tx.session.deleteMany({ where: { userId: id } });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action,
          entityType: "User",
          entityId: id,
          metadata: { oldRole: target.role, newRole: updated.role, blocked: updated.isBlocked },
        },
      });
      if (target.role !== updated.role) await createUserNotifications(tx, {
        recipientIds: [id],
        actorId: actor.id,
        kind: "ROLE_CHANGED",
        payload: { oldRole: target.role, newRole: updated.role },
      });
      return updated;
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ user: { id: user.id, minecraftNickname: user.minecraftNickname, role: user.role, isBlocked: user.isBlocked }, temporaryPassword });
  } catch (error) {
    if (error instanceof Error && error.message === "USER_NOT_FOUND") return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    if (error instanceof Error && error.message === "LAST_ADMIN") return NextResponse.json({ error: "Нельзя отключить последнего администратора" }, { status: 409 });
    if (error instanceof Error && error.message === "NO_CHANGES") return NextResponse.json({ error: "Нет изменений" }, { status: 400 });
    if (typeof error === "object" && error !== null && "code" in error && String(error.code) === "P2002") return NextResponse.json({ error: "Minecraft-ник уже занят" }, { status: 409 });
    if (typeof error === "object" && error !== null && "code" in error && String(error.code) === "P2034") return NextResponse.json({ error: "Данные пользователя изменились. Обновите список и повторите действие." }, { status: 409 });
    return NextResponse.json({ error: "Не удалось изменить пользователя" }, { status: 500 });
  }
}
