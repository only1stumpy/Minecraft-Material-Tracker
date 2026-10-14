import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkMutationRateLimit, validateSameOrigin } from "@/lib/security";

export async function PATCH(request: Request) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый источник запроса" }, { status: 403 });
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (actor.mustChangePassword) return NextResponse.json({ error: "Сначала смените временный пароль" }, { status: 403 });
  const rateLimit = await checkMutationRateLimit("profile-update", actor.id, { limit: 10, windowMs: 60_000 });
  if (rateLimit) return rateLimit;

  const body = await request.json().catch(() => null) as { nickname?: unknown } | null;
  const nickname = typeof body?.nickname === "string" ? body.nickname.normalize("NFKC").trim() : "";
  if (!/^[A-Za-z0-9_]{3,16}$/.test(nickname)) return NextResponse.json({ error: "Minecraft-ник должен содержать 3–16 латинских букв, цифр или _" }, { status: 400 });
  const normalizedNickname = nickname.toLowerCase();

  try {
    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const saved = await tx.user.update({
        where: { id: actor.id },
        data: { minecraftNickname: nickname, normalizedNickname },
        select: { id: true, minecraftNickname: true },
      });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "PROFILE_NICKNAME_CHANGED", entityType: "User", entityId: actor.id, metadata: { nickname: saved.minecraftNickname } } });
      return saved;
    });
    return NextResponse.json({ user: updated });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && String(error.code) === "P2002") return NextResponse.json({ error: "Этот Minecraft-ник уже занят" }, { status: 409 });
    return NextResponse.json({ error: "Не удалось изменить ник" }, { status: 500 });
  }
}
