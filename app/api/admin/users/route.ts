import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { generateTemporaryPassword, hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { validateSameOrigin } from "@/lib/security";

export async function POST(request: Request) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый запрос" }, { status: 403 });
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "ADMIN" || actor.mustChangePassword) return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  const body = await request.json().catch(() => null) as { nickname?: unknown; role?: unknown } | null;
  const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";
  const role = body?.role === undefined ? "PLAYER" : body.role;
  if (role !== "ADMIN" && role !== "MODERATOR" && role !== "PLAYER") return NextResponse.json({ error: "Некорректная роль" }, { status: 400 });
  if (!/^[A-Za-z0-9_]{3,16}$/.test(nickname)) return NextResponse.json({ error: "Minecraft-ник должен содержать 3–16 латинских букв, цифр или _" }, { status: 400 });
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  try {
    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.user.create({ data: { minecraftNickname: nickname, normalizedNickname: nickname.toLowerCase(), role, passwordHash } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "USER_CREATED", entityType: "User", entityId: created.id, metadata: { nickname, role } } });
      return created;
    });
    return NextResponse.json({ user: { id: user.id, minecraftNickname: user.minecraftNickname, role: user.role }, temporaryPassword }, { status: 201 });
  } catch { return NextResponse.json({ error: "Пользователь с таким ником уже существует" }, { status: 409 }); }
}
