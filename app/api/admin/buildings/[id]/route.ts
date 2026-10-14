import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSameOrigin } from "@/lib/security";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый запрос" }, { status: 403 });
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "ADMIN") return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null) as { restore?: unknown } | null;
  const deletedAt = body?.restore === true ? null : new Date();
  const building = await prisma.building.update({ where: { id }, data: { deletedAt } });
  await prisma.auditLog.create({ data: { actorId: actor.id, action: deletedAt ? "BUILDING_DELETED" : "BUILDING_RESTORED", entityType: "Building", entityId: id } });
  return NextResponse.json({ building: { id: building.id, deletedAt: building.deletedAt } });
}
