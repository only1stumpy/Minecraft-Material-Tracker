import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_PAGE = 1000;

const parsePageParam = (value: string | null, fallback: number, maximum: number) => {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Сначала смените временный пароль" }, { status: 403 });

  const url = new URL(request.url);
  const page = parsePageParam(url.searchParams.get("page"), 1, MAX_PAGE);
  const limit = parsePageParam(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
  if (page === null || limit === null) {
    return NextResponse.json({ error: "Некорректные параметры страницы" }, { status: 400 });
  }

  const [notificationRows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientId: user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit + 1,
      select: {
        id: true,
        kind: true,
        buildingId: true,
        entityId: true,
        payload: true,
        readAt: true,
        createdAt: true,
        actor: { select: { minecraftNickname: true } },
      },
    }),
    prisma.notification.count({ where: { recipientId: user.id, readAt: null } }),
  ]);

  return NextResponse.json({
    notifications: notificationRows.slice(0, limit),
    unreadCount,
    page,
    limit,
    hasMore: notificationRows.length > limit,
  });
}
