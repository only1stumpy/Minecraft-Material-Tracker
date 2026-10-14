import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkMutationRateLimit, validateSameOrigin } from "@/lib/security";

import {
  MAX_WAREHOUSE_QUANTITY,
  WarehouseReservationError,
  reserveWarehouseStock,
} from "./operations";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });
const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

type ReservationBody = {
  stockId?: unknown;
  quantity?: unknown;
  operationId?: unknown;
};

export async function GET() {
  const actor = await getCurrentUser();
  if (!actor) return errorResponse("Требуется авторизация", 401);
  if (actor.mustChangePassword) return errorResponse("Сначала смените временный пароль", 403);

  const reservations = await prisma.warehouseReservation.findMany({
    where: { userId: actor.id, releasedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      operationId: true,
      stockId: true,
      quantity: true,
      createdAt: true,
      stock: { select: { itemName: true, normalizedName: true } },
    },
  });
  return NextResponse.json({ reservations });
}

export async function POST(request: Request) {
  if (!validateSameOrigin(request)) return errorResponse("Недопустимый источник запроса", 403);
  const actor = await getCurrentUser();
  if (!actor) return errorResponse("Требуется авторизация", 401);
  if (actor.mustChangePassword) return errorResponse("Сначала смените временный пароль", 403);
  const rateLimit = await checkMutationRateLimit("warehouse-reservation", actor.id, { limit: 60, windowMs: 60_000 });
  if (rateLimit) return rateLimit;

  const body = await request.json().catch(() => null) as ReservationBody | null;
  if (typeof body?.stockId !== "string" || body.stockId.length < 1 || body.stockId.length > 64) {
    return errorResponse("Некорректный материал склада", 400);
  }
  const quantity = typeof body.quantity === "number" ? body.quantity : NaN;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_WAREHOUSE_QUANTITY) {
    return errorResponse("Количество должно быть положительным целым числом", 400);
  }
  const operationId = isUuid(body.operationId) ? body.operationId : randomUUID();

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const reservation = await reserveWarehouseStock(tx, {
        stockId: body.stockId as string,
        quantity,
        operationId,
        userId: actor.id,
      });
      if (!reservation.duplicate) {
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "WAREHOUSE_RESERVED",
            entityType: "WarehouseStock",
            entityId: reservation.reservation.stockId,
            metadata: {
              reservationId: reservation.reservation.id,
              quantity: reservation.reservation.quantity,
              operationId,
            },
          },
        });
      }
      return reservation;
    }, { isolationLevel: "Serializable" });

    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      reservation: result.reservation,
      ...(result.stock ? {
        stock: {
          ...result.stock,
          available: Math.max(0, result.stock.quantity - result.stock.reserved),
        },
      } : {}),
    }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof WarehouseReservationError) return errorResponse(error.message, error.status);
    if (typeof error === "object" && error !== null && "code" in error) {
      const code = String(error.code);
      if (code === "P2002") return NextResponse.json({ ok: true, duplicate: true });
      if (code === "P2034") return errorResponse("Склад изменился параллельно. Повторите операцию.", 409);
    }
    return errorResponse("Не удалось зарезервировать материал", 500);
  }
}
