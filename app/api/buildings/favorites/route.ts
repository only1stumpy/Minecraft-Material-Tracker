import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSameOrigin } from "@/lib/security";

export async function POST(request: Request) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый источник запроса" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Сначала смените временный пароль" }, { status: 403 });
  const body = await request.json().catch(() => null) as { buildingId?: unknown; favorite?: unknown } | null;
  if (typeof body?.buildingId !== "string" || typeof body.favorite !== "boolean") return NextResponse.json({ error: "Некорректный запрос избранного" }, { status: 400 });
  const building = await prisma.building.findFirst({ where: { id: body.buildingId, deletedAt: null }, select: { id: true } });
  if (!building) return NextResponse.json({ error: "Постройка не найдена" }, { status: 404 });
  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (body.favorite) await tx.favorite.upsert({ where: { userId_buildingId: { userId: user.id, buildingId: building.id } }, create: { userId: user.id, buildingId: building.id }, update: {} });
      else await tx.favorite.deleteMany({ where: { userId: user.id, buildingId: building.id } });
      await tx.auditLog.create({ data: { actorId: user.id, action: body.favorite ? "BUILDING_FAVORITED" : "BUILDING_UNFAVORITED", entityType: "Building", entityId: building.id } });
    });
    return NextResponse.json({ favorite: body.favorite });
  } catch {
    return NextResponse.json({ error: "Не удалось обновить избранное" }, { status: 500 });
  }
}
