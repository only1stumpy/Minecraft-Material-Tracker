import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { canManageBuilding } from "@/lib/permissions";
import { createUserNotifications, isTaskCompletionTransition } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { checkMutationRateLimit, validateSameOrigin } from "@/lib/security";

const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый источник запроса" }, { status: 403 });
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (actor.mustChangePassword) return NextResponse.json({ error: "Сначала смените временный пароль" }, { status: 403 });
  const rateLimit = await checkMutationRateLimit("task-update", actor.id, { limit: 60, windowMs: 60_000 });
  if (rateLimit) return rateLimit;
  const { id } = await params;
  const body = await request.json().catch(() => null) as { status?: unknown; title?: unknown; description?: unknown; assigneeNickname?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  const existing = await prisma.buildingTask.findUnique({
    where: { id },
    select: { id: true, buildingId: true, title: true, description: true, status: true, assigneeId: true, createdById: true, building: { select: { name: true, ownerId: true, responsibleId: true, deletedAt: true } } },
  });
  if (!existing || existing.building.deletedAt) return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  const manager = canManageBuilding(actor, { ownerId: existing.building.ownerId });
  const assignedPlayer = existing.assigneeId === actor.id;
  const changes: Prisma.BuildingTaskUpdateInput = {};

  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !(TASK_STATUSES as readonly string[]).includes(body.status)) return NextResponse.json({ error: "Некорректный статус задачи" }, { status: 400 });
    if (!manager && !assignedPlayer) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    changes.status = body.status as typeof existing.status;
  }

  if (body.title !== undefined || body.description !== undefined || body.assigneeNickname !== undefined) {
    if (!manager) return NextResponse.json({ error: "Редактировать задачу может владелец постройки или модератор" }, { status: 403 });
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 160) return NextResponse.json({ error: "Название задачи должно содержать от 1 до 160 символов" }, { status: 400 });
      changes.title = body.title.trim();
    }
    if (body.description !== undefined) {
      if (body.description !== null && (typeof body.description !== "string" || body.description.length > 2000)) return NextResponse.json({ error: "Описание задачи слишком длинное" }, { status: 400 });
      changes.description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
    }
    if (body.assigneeNickname !== undefined) {
      if (body.assigneeNickname !== null && typeof body.assigneeNickname !== "string") return NextResponse.json({ error: "Некорректный исполнитель" }, { status: 400 });
      const nickname = typeof body.assigneeNickname === "string" ? body.assigneeNickname.trim() : "";
      const assignee = nickname ? await prisma.user.findFirst({ where: { normalizedNickname: nickname.toLowerCase(), isBlocked: false }, select: { id: true, minecraftNickname: true } }) : null;
      if (nickname && !assignee) return NextResponse.json({ error: "Игрок не найден или заблокирован" }, { status: 404 });
      changes.assignee = assignee ? { connect: { id: assignee.id } } : { disconnect: true };
    }
  }
  if (Object.keys(changes).length === 0) return NextResponse.json({ error: "Нет изменений" }, { status: 400 });

  try {
    const task = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.buildingTask.findUnique({
        where: { id },
        select: { status: true, assigneeId: true },
      });
      if (!current) throw new Error("TASK_NOT_FOUND");
      const updated = await tx.buildingTask.update({ where: { id }, data: changes, select: { id: true, title: true, description: true, status: true, assigneeId: true } });
      if (updated.assigneeId && updated.assigneeId !== existing.assigneeId) await createUserNotifications(tx, {
        recipientIds: [updated.assigneeId], actorId: actor.id, kind: "BUILDING_ASSIGNED", buildingId: existing.buildingId, entityId: id,
        payload: { buildingName: existing.building.name, taskTitle: updated.title },
      });
      if (isTaskCompletionTransition(current.status, updated.status) && (current.assigneeId || updated.assigneeId)) await createUserNotifications(tx, {
        recipientIds: [existing.createdById, existing.building.ownerId, existing.building.responsibleId, current.assigneeId, updated.assigneeId],
        actorId: actor.id,
        kind: "BUILDING_STATUS_CHANGED",
        buildingId: existing.buildingId,
        entityId: id,
        payload: { buildingName: existing.building.name, taskTitle: updated.title, taskStatus: updated.status, previousTaskStatus: current.status },
      });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "TASK_UPDATED", entityType: "BuildingTask", entityId: id, metadata: { status: updated.status } } });
      return updated;
    });
    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof Error && error.message === "TASK_NOT_FOUND") return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
    if (typeof error === "object" && error !== null && "code" in error && String(error.code) === "P2034") {
      return NextResponse.json({ error: "Задача изменена параллельно. Обновите её и повторите действие." }, { status: 409 });
    }
    return NextResponse.json({ error: "Не удалось изменить задачу" }, { status: 500 });
  }
}
