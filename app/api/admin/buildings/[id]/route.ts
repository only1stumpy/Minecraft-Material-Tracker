import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { canModerateContent } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { checkMutationRateLimit, validateSameOrigin } from "@/lib/security";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый запрос" }, { status: 403 });
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (!canModerateContent(actor) || actor.mustChangePassword) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  const rateLimit = await checkMutationRateLimit("moderation-building", actor.id, { limit: 60, windowMs: 60_000 });
  if (rateLimit) return rateLimit;
  const { id } = await params;
  const body = await request.json().catch(() => null) as { restore?: unknown } | null;
  if (!body || (body.restore !== undefined && typeof body.restore !== "boolean")) return NextResponse.json({ error: "Некорректное действие" }, { status: 400 });

  const existing = await prisma.building.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Постройка не найдена" }, { status: 404 });
  const deletedAt = body.restore === true ? null : new Date();
  const building = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.building.update({ where: { id }, data: { deletedAt, version: { increment: 1 } } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: deletedAt ? "BUILDING_SOFT_DELETED" : "BUILDING_RESTORED", entityType: "Building", entityId: id } });
    return updated;
  });
  return NextResponse.json({ building: { id: building.id, deletedAt: building.deletedAt, status: building.status } });
}
