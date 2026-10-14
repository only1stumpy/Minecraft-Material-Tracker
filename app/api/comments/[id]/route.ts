import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { canModerateContent } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { checkMutationRateLimit, validateSameOrigin } from "@/lib/security";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый источник запроса" }, { status: 403 });
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (actor.mustChangePassword) return NextResponse.json({ error: "Сначала смените временный пароль" }, { status: 403 });
  const rateLimit = await checkMutationRateLimit("comment-update", actor.id, { limit: 30, windowMs: 60_000 });
  if (rateLimit) return rateLimit;
  const { id } = await params;
  const body = await request.json().catch(() => null) as { body?: unknown; hidden?: unknown } | null;
  const existing = await prisma.comment.findUnique({ where: { id }, select: { id: true, body: true, authorId: true, hiddenAt: true, buildingId: true } });
  if (!existing) return NextResponse.json({ error: "Комментарий не найден" }, { status: 404 });

  const changes: Prisma.CommentUpdateInput = {};
  let action: string;
  if (body?.body !== undefined && actor.id === existing.authorId && typeof body.body === "string") {
    const text = body.body.trim();
    if (!text || text.length > 3000 || text.includes("\u0000")) return NextResponse.json({ error: "Комментарий должен содержать от 1 до 3000 символов" }, { status: 400 });
    changes.body = text;
    action = "COMMENT_EDITED";
  } else if (typeof body?.hidden === "boolean" && canModerateContent(actor)) {
    changes.hiddenAt = body.hidden ? new Date() : null;
    changes.moderatedBy = body.hidden ? { connect: { id: actor.id } } : { disconnect: true };
    action = body.hidden ? "COMMENT_HIDDEN" : "COMMENT_RESTORED";
  } else {
    return NextResponse.json({ error: "Недостаточно прав или некорректное действие" }, { status: 403 });
  }

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const saved = await tx.comment.update({ where: { id }, data: changes, select: { id: true, body: true, hiddenAt: true, updatedAt: true } });
    await tx.auditLog.create({ data: { actorId: actor.id, action, entityType: "Comment", entityId: id, metadata: { buildingId: existing.buildingId } } });
    return saved;
  });
  return NextResponse.json({ comment: updated });
}
