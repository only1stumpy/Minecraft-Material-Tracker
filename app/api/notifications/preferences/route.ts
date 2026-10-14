import { NextResponse } from "next/server";
import type { NotificationKind as PrismaNotificationKind } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSameOrigin } from "@/lib/security";

const NOTIFICATION_KINDS = [
  "BUILDING_ASSIGNED",
  "BUILDING_STATUS_CHANGED",
  "MATERIAL_RESERVED",
  "MATERIAL_GATHERED",
  "MATERIAL_DELIVERED",
  "COMMENT_ADDED",
  "ROLE_CHANGED",
] as const;

type NotificationKindValue = (typeof NOTIFICATION_KINDS)[number];

const isNotificationKind = (value: unknown): value is NotificationKindValue =>
  typeof value === "string" && (NOTIFICATION_KINDS as readonly string[]).includes(value);

const asPrismaKind = (kind: NotificationKindValue) => kind as PrismaNotificationKind;

const withDefaults = (
  rows: Array<{ kind: PrismaNotificationKind; enabled: boolean }>,
) => {
  const enabledByKind = new Map(rows.map((row) => [String(row.kind), row.enabled]));
  return NOTIFICATION_KINDS.map((kind) => ({ kind, enabled: enabledByKind.get(kind) ?? true }));
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Сначала смените временный пароль" }, { status: 403 });

  const rows = await prisma.notificationPreference.findMany({
    where: { userId: user.id },
    select: { kind: true, enabled: true },
  });
  return NextResponse.json({ preferences: withDefaults(rows) });
}

export async function PATCH(request: Request) {
  if (!validateSameOrigin(request)) {
    return NextResponse.json({ error: "Недопустимый запрос" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Сначала смените временный пароль" }, { status: 403 });

  const body = await request.json().catch(() => null) as { kind?: unknown; enabled?: unknown } | null;
  if (!isNotificationKind(body?.kind) || typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "Некорректная настройка уведомлений" }, { status: 400 });
  }

  const kind = asPrismaKind(body.kind);
  const preference = await prisma.notificationPreference.upsert({
    where: { userId_kind: { userId: user.id, kind } },
    create: { userId: user.id, kind, enabled: body.enabled },
    update: { enabled: body.enabled },
    select: { kind: true, enabled: true },
  });

  return NextResponse.json({ preference });
}
