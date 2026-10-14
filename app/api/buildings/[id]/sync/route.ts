import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (actor.mustChangePassword) return NextResponse.json({ error: "Сначала смените временный пароль" }, { status: 403 });

  const sinceValue = new URL(request.url).searchParams.get("since");
  if (!sinceValue || sinceValue.length > 40 || !Number.isFinite(Date.parse(sinceValue))) {
    return NextResponse.json({ error: "Некорректный курсор синхронизации" }, { status: 400 });
  }
  const { id } = await params;
  const building = await prisma.building.findFirst({
    where: { id, deletedAt: null },
    select: { updatedAt: true },
  });
  if (!building) return NextResponse.json({ error: "Постройка не найдена" }, { status: 404 });

  const [activity, comment, task] = await Promise.all([
    prisma.materialActivity.findFirst({ where: { material: { buildingId: id } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.comment.findFirst({ where: { buildingId: id }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.buildingTask.findFirst({ where: { buildingId: id }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  const cursor = [building.updatedAt, activity?.createdAt, comment?.updatedAt, task?.updatedAt]
    .filter((value): value is Date => value instanceof Date)
    .reduce((latest, value) => value > latest ? value : latest, building.updatedAt);
  const changed = cursor.getTime() > Date.parse(sinceValue);
  return NextResponse.json({ cursor: cursor.toISOString(), changed });
}
