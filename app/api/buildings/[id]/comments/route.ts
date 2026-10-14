import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { createUserNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { checkMutationRateLimit, validateSameOrigin } from "@/lib/security";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый источник запроса" }, { status: 403 });
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (actor.mustChangePassword) return NextResponse.json({ error: "Сначала смените временный пароль" }, { status: 403 });
  const rateLimit = await checkMutationRateLimit("comment-create", actor.id, { limit: 20, windowMs: 60_000 });
  if (rateLimit) return rateLimit;

  const { id: buildingId } = await params;
  const body = await request.json().catch(() => null) as { body?: unknown; materialId?: unknown } | null;
  const commentBody = typeof body?.body === "string" ? body.body.trim() : "";
  if (!commentBody || commentBody.length > 3000 || commentBody.includes("\u0000")) return NextResponse.json({ error: "Комментарий должен содержать от 1 до 3000 символов" }, { status: 400 });
  const materialId = typeof body?.materialId === "string" && body.materialId ? body.materialId : null;

  try {
    const comment = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const building = await tx.building.findFirst({ where: { id: buildingId, deletedAt: null }, select: { id: true, name: true, ownerId: true, responsibleId: true } });
      if (!building) throw new Error("BUILDING_NOT_FOUND");
      if (materialId) {
        const material = await tx.material.findFirst({ where: { id: materialId, buildingId, isArchived: false }, select: { id: true } });
        if (!material) throw new Error("MATERIAL_NOT_FOUND");
      }
      const created = await tx.comment.create({ data: { buildingId, materialId, authorId: actor.id, body: commentBody }, select: { id: true, body: true, materialId: true, createdAt: true } });
      const otherAuthors = await tx.comment.findMany({ where: { buildingId, id: { not: created.id }, hiddenAt: null }, distinct: ["authorId"], select: { authorId: true }, take: 100 });
      await createUserNotifications(tx, {
        recipientIds: [building.ownerId, building.responsibleId, ...otherAuthors.map(({ authorId }) => authorId)],
        actorId: actor.id,
        kind: "COMMENT_ADDED",
        buildingId,
        entityId: created.id,
        payload: { buildingName: building.name, materialId },
      });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "COMMENT_CREATED", entityType: "Comment", entityId: created.id } });
      return created;
    });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "BUILDING_NOT_FOUND") return NextResponse.json({ error: "Постройка не найдена" }, { status: 404 });
    if (error instanceof Error && error.message === "MATERIAL_NOT_FOUND") return NextResponse.json({ error: "Материал не найден" }, { status: 404 });
    return NextResponse.json({ error: "Не удалось сохранить комментарий" }, { status: 500 });
  }
}
