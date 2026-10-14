import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSameOrigin } from "@/lib/security";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый запрос" }, { status: 403 });
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (actor.role !== "ADMIN") return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null) as { restore?: unknown } | null;
  const deletedAt = body?.restore === true ? null : new Date();
  const existing = await prisma.building.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Постройка не найдена" }, { status: 404 });
  const building = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.building.update({ where: { id }, data: { deletedAt } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: deletedAt ? "BUILDING_DELETED" : "BUILDING_RESTORED", entityType: "Building", entityId: id } });
    return updated;
  });
  return NextResponse.json({ building: { id: building.id, deletedAt: building.deletedAt } });
}
