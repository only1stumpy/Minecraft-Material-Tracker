import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSameOrigin } from "@/lib/security";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validateSameOrigin(request)) {
    return NextResponse.json({ error: "Недопустимый запрос" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Сначала смените временный пароль" }, { status: 403 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Уведомление не найдено" }, { status: 404 });

  const readAt = new Date();
  const updated = await prisma.notification.updateMany({
    where: { id, recipientId: user.id, readAt: null },
    data: { readAt },
  });

  if (updated.count === 1) {
    return NextResponse.json({ ok: true, notification: { id, readAt } });
  }

  const existing = await prisma.notification.findFirst({
    where: { id, recipientId: user.id },
    select: { id: true, readAt: true },
  });
  if (!existing) return NextResponse.json({ error: "Уведомление не найдено" }, { status: 404 });

  return NextResponse.json({ ok: true, notification: existing });
}
