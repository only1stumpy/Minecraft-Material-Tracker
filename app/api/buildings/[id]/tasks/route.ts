import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { canManageBuilding } from "@/lib/permissions";
import { createUserNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { validateSameOrigin } from "@/lib/security";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый источник запроса" }, { status: 403 });
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (actor.mustChangePassword) return NextResponse.json({ error: "Сначала смените временный пароль" }, { status: 403 });
  const { id: buildingId } = await params;
  const body = await request.json().catch(() => null) as { title?: unknown; description?: unknown; assigneeNickname?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 160) return NextResponse.json({ error: "Название задачи должно содержать от 1 до 160 символов" }, { status: 400 });
  const description = typeof body?.description === "string" && body.description.trim() ? body.description.trim() : null;
  if (description && description.length > 2000) return NextResponse.json({ error: "Описание задачи слишком длинное" }, { status: 400 });
  const assigneeNickname = typeof body?.assigneeNickname === "string" ? body.assigneeNickname.trim() : "";

  try {
    const task = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const building = await tx.building.findFirst({ where: { id: buildingId, deletedAt: null }, select: { id: true, name: true, ownerId: true } });
      if (!building) throw new Error("BUILDING_NOT_FOUND");
      if (!canManageBuilding(actor, { ownerId: building.ownerId })) throw new Error("FORBIDDEN");
      const assignee = assigneeNickname
        ? await tx.user.findFirst({ where: { normalizedNickname: assigneeNickname.toLowerCase(), isBlocked: false }, select: { id: true, minecraftNickname: true } })
        : null;
      if (assigneeNickname && !assignee) throw new Error("ASSIGNEE_NOT_FOUND");
      const created = await tx.buildingTask.create({
        data: { buildingId, title, description, assigneeId: assignee?.id ?? null, createdById: actor.id },
        select: { id: true, title: true, description: true, status: true, createdAt: true, assignee: { select: { minecraftNickname: true } } },
      });
      if (assignee) await createUserNotifications(tx, {
        recipientIds: [assignee.id], actorId: actor.id, kind: "BUILDING_ASSIGNED", buildingId, entityId: created.id,
        payload: { buildingName: building.name, taskTitle: title },
      });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "TASK_CREATED", entityType: "BuildingTask", entityId: created.id } });
      return created;
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "BUILDING_NOT_FOUND") return NextResponse.json({ error: "Постройка не найдена" }, { status: 404 });
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    if (error instanceof Error && error.message === "ASSIGNEE_NOT_FOUND") return NextResponse.json({ error: "Игрок не найден или заблокирован" }, { status: 404 });
    return NextResponse.json({ error: "Не удалось создать задачу" }, { status: 500 });
  }
}
