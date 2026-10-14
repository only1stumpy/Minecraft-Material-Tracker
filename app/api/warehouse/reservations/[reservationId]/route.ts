import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkMutationRateLimit, validateSameOrigin } from "@/lib/security";

import { WarehouseReservationError, releaseWarehouseReservation } from "../operations";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ reservationId: string }> },
) {
  if (!validateSameOrigin(request)) return errorResponse("Недопустимый источник запроса", 403);
  const actor = await getCurrentUser();
  if (!actor) return errorResponse("Требуется авторизация", 401);
  if (actor.mustChangePassword) return errorResponse("Сначала смените временный пароль", 403);
  const rateLimit = await checkMutationRateLimit("warehouse-release", actor.id, { limit: 60, windowMs: 60_000 });
  if (rateLimit) return rateLimit;
  const { reservationId } = await params;
  if (!reservationId || reservationId.length > 64) return errorResponse("Некорректная резервация", 400);

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const released = await releaseWarehouseReservation(tx, reservationId, actor.id);
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "WAREHOUSE_RELEASED",
          entityType: "WarehouseStock",
          entityId: released.reservation.stockId,
          metadata: {
            reservationId: released.reservation.id,
            quantity: released.reservation.quantity,
          },
        },
      });
      return released;
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({
      ok: true,
      reservation: result.reservation,
      stock: {
        ...result.stock,
        available: Math.max(0, result.stock.quantity - result.stock.reserved),
      },
    });
  } catch (error) {
    if (error instanceof WarehouseReservationError) return errorResponse(error.message, error.status);
    if (typeof error === "object" && error !== null && "code" in error && String(error.code) === "P2034") {
      return errorResponse("Склад изменился параллельно. Повторите операцию.", 409);
    }
    return errorResponse("Не удалось освободить материал", 500);
  }
}
