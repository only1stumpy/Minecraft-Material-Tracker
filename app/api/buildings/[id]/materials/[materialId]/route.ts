import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { isPositiveSafeInteger } from "@/lib/material-operations";
import { createUserNotifications } from "@/lib/notifications";
import { canModerateContent } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { checkMutationRateLimit, validateSameOrigin } from "@/lib/security";

type Action = "reserve" | "release" | "gather" | "deliver" | "correct";
type CorrectionDirection = "add" | "remove";
const MAX_INT = 2_147_483_647;
type RequestBody = {
  operationId?: unknown;
  action?: unknown;
  quantity?: unknown;
  reservationId?: unknown;
  targetUserId?: unknown;
  direction?: unknown;
};

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isAction = (value: unknown): value is Action =>
  value === "reserve" || value === "release" || value === "gather" || value === "deliver" || value === "correct";

const isCorrectionDirection = (value: unknown): value is CorrectionDirection => value === "add" || value === "remove";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; materialId: string }> },
) {
  if (!validateSameOrigin(request)) return errorResponse("Недопустимый источник запроса", 403);
  const actor = await getCurrentUser();
  if (!actor) return errorResponse("Требуется авторизация", 401);
  if (actor.mustChangePassword) return errorResponse("Сначала смените временный пароль", 403);
  const rateLimit = await checkMutationRateLimit("material-operation", actor.id, { limit: 120, windowMs: 60_000 });
  if (rateLimit) return rateLimit;

  const { id: buildingId, materialId } = await params;
  const body = await request.json().catch(() => null) as RequestBody | null;
  if (!body || !isAction(body.action) || !isUuid(body.operationId)) {
    return errorResponse("Некорректная операция с материалом", 400);
  }
  const action = body.action;
  if (action !== "release" && !isPositiveSafeInteger(body.quantity)) {
    return errorResponse("Количество должно быть положительным целым числом", 400);
  }
  const quantity = isPositiveSafeInteger(body.quantity) ? body.quantity : 0;
  if (["release", "gather", "correct"].includes(action) && typeof body.reservationId !== "string") {
    return errorResponse("Для этой операции нужна резервация", 400);
  }
  if (quantity > 2_147_483_647) return errorResponse("Количество превышает предел хранения", 400);
  const correctionDirection = isCorrectionDirection(body.direction) ? body.direction : undefined;
  if (action === "correct" && !correctionDirection) {
    return errorResponse("Для коррекции укажите add или remove", 400);
  }

  const previous = await prisma.materialActivity.findUnique({
    where: { operationId: body.operationId },
    select: { actorId: true },
  });
  if (previous) return NextResponse.json({ ok: true, duplicate: true });

  const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : actor.id;
  if (targetUserId !== actor.id && !canModerateContent(actor)) {
    return errorResponse("Нельзя исправлять вклад другого игрока", 403);
  }

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const material = await tx.material.findFirst({
        where: { id: materialId, buildingId, isArchived: false, building: { deletedAt: null } },
        select: {
          id: true,
          name: true,
          requiredQty: true,
          surplusLimit: true,
          building: { select: { id: true, name: true, status: true, deletedAt: true, ownerId: true, responsibleId: true } },
        },
      });
      if (!material) throw new OperationError("Материал не найден", 404);
      if (["COMPLETED", "PAUSED", "ARCHIVED"].includes(material.building.status)) {
        throw new OperationError("Сбор для этой постройки сейчас закрыт", 409);
      }

      const alreadyApplied = await tx.materialActivity.findUnique({
        where: { operationId: body.operationId as string },
        select: { actorId: true },
      });
      if (alreadyApplied) return { duplicate: true as const };

      let delta = quantity;
      let reservationId: string | null = null;
      let activityKind: "RESERVED" | "RELEASED" | "GATHERED" | "DELIVERED" | "CORRECTED";

      if (action === "reserve") {
        const [totals, activeReservations] = await Promise.all([
          tx.materialContribution.aggregate({ where: { materialId }, _sum: { gatheredQty: true } }),
          tx.materialReservation.findMany({ where: { materialId, releasedAt: null }, select: { quantity: true, gatheredQty: true } }),
        ]);
        const gatheredQty = totals._sum.gatheredQty ?? 0;
        const reservedQty = activeReservations.reduce((sum, row) => sum + row.quantity - row.gatheredQty, 0);
        if (!Number.isSafeInteger(gatheredQty) || !Number.isSafeInteger(reservedQty)) throw new OperationError("Сумма материалов превышает безопасный диапазон", 409);
        const capacity = material.requiredQty + material.surplusLimit;
        const freeQty = Math.max(0, capacity - gatheredQty - reservedQty);
        if (quantity > freeQty) throw new OperationError(`Свободно только ${freeQty}`, 409);

        const reservation = await tx.materialReservation.create({
          data: { materialId, userId: actor.id, quantity },
          select: { id: true },
        });
        reservationId = reservation.id;
        activityKind = "RESERVED";
      } else if (action === "release") {
        const reservation = await tx.materialReservation.findFirst({
          where: { id: body.reservationId as string, materialId, userId: actor.id, releasedAt: null },
          select: { id: true, quantity: true, gatheredQty: true },
        });
        if (!reservation) throw new OperationError("Активная резервация не найдена", 404);
        delta = reservation.quantity - reservation.gatheredQty;
        if (delta <= 0) throw new OperationError("Освобождать нечего", 409);
        reservationId = reservation.id;
        await tx.materialReservation.update({ where: { id: reservation.id }, data: { releasedAt: new Date() } });
        activityKind = "RELEASED";
        delta = -delta;
      } else if (action === "gather") {
        const reservation = await tx.materialReservation.findFirst({
          where: { id: body.reservationId as string, materialId, userId: actor.id, releasedAt: null },
          select: { id: true, quantity: true, gatheredQty: true },
        });
        if (!reservation) throw new OperationError("Активная резервация не найдена", 404);
        if (quantity > reservation.quantity - reservation.gatheredQty) {
          throw new OperationError("Количество больше остатка резервации", 409);
        }
        const totals = await tx.materialContribution.aggregate({ where: { materialId }, _sum: { gatheredQty: true } });
        const gatheredTotal = totals._sum.gatheredQty ?? 0;
        const nextGathered = gatheredTotal + quantity;
        const contribution = await tx.materialContribution.findUnique({
          where: { materialId_userId: { materialId, userId: actor.id } },
          select: { gatheredQty: true },
        });
        if (contribution && contribution.gatheredQty > MAX_INT - quantity) throw new OperationError("Ваш вклад превышает предел хранения", 409);
        if (reservation.gatheredQty > MAX_INT - quantity) throw new OperationError("Счётчик резервации превышает предел хранения", 409);
        if (!Number.isSafeInteger(nextGathered)) throw new OperationError("Сумма собранного превышает безопасный диапазон", 409);
        const capacity = material.requiredQty + material.surplusLimit;
        if (nextGathered > capacity) {
          throw new OperationError(`Нельзя собрать больше разрешённого количества (${capacity})`, 409);
        }
        await tx.materialReservation.update({ where: { id: reservation.id }, data: { gatheredQty: { increment: quantity } } });
        await tx.materialContribution.upsert({
          where: { materialId_userId: { materialId, userId: actor.id } },
          create: { materialId, userId: actor.id, gatheredQty: quantity },
          update: { gatheredQty: { increment: quantity } },
        });
        reservationId = reservation.id;
        activityKind = "GATHERED";
      } else if (action === "deliver") {
        const contribution = await tx.materialContribution.findUnique({
          where: { materialId_userId: { materialId, userId: actor.id } },
          select: { gatheredQty: true, deliveredQty: true },
        });
        if (!contribution || quantity > contribution.gatheredQty - contribution.deliveredQty) {
          throw new OperationError("Количество превышает собранный, но ещё не доставленный остаток", 409);
        }
        await tx.materialContribution.update({
          where: { materialId_userId: { materialId, userId: actor.id } },
          data: { deliveredQty: { increment: quantity } },
        });
        activityKind = "DELIVERED";
      } else {
        const reservation = await tx.materialReservation.findFirst({
          where: { id: body.reservationId as string, materialId, userId: targetUserId },
          select: { id: true, quantity: true, gatheredQty: true },
        });
        if (!reservation) throw new OperationError("Резервация для коррекции не найдена", 404);
        const contribution = await tx.materialContribution.findUnique({
          where: { materialId_userId: { materialId, userId: targetUserId } },
          select: { gatheredQty: true, deliveredQty: true },
        });
        if (correctionDirection === "add") {
          const currentGathered = contribution?.gatheredQty ?? 0;
          if (currentGathered > MAX_INT - quantity || reservation.gatheredQty > MAX_INT - quantity) {
            throw new OperationError("Коррекция превышает предел хранения", 409);
          }
          if (quantity > reservation.quantity - reservation.gatheredQty) {
            throw new OperationError("Коррекция превысит зарезервированное количество", 409);
          }
          const totals = await tx.materialContribution.aggregate({ where: { materialId }, _sum: { gatheredQty: true } });
          const gatheredTotal = totals._sum.gatheredQty ?? 0;
          const nextGathered = gatheredTotal + quantity;
          const capacity = material.requiredQty + material.surplusLimit;
          if (!Number.isSafeInteger(nextGathered) || nextGathered > capacity) {
            throw new OperationError(`Коррекция превысит разрешённое количество (${capacity})`, 409);
          }
          await tx.materialContribution.upsert({
            where: { materialId_userId: { materialId, userId: targetUserId } },
            create: { materialId, userId: targetUserId, gatheredQty: quantity },
            update: { gatheredQty: { increment: quantity } },
          });
          await tx.materialReservation.update({ where: { id: reservation.id }, data: { gatheredQty: { increment: quantity } } });
          delta = quantity;
        } else {
          if (!contribution || quantity > reservation.gatheredQty || quantity > contribution.gatheredQty - contribution.deliveredQty) {
            throw new OperationError("Коррекция не может убрать доставленное количество", 409);
          }
          await tx.materialContribution.update({
            where: { materialId_userId: { materialId, userId: targetUserId } },
            data: { gatheredQty: { decrement: quantity } },
          });
          await tx.materialReservation.update({ where: { id: reservation.id }, data: { gatheredQty: { decrement: quantity } } });
          delta = -quantity;
        }
        activityKind = "CORRECTED";
      }

      await tx.materialActivity.create({
        data: {
          operationId: body.operationId as string,
          materialId,
          actorId: actor.id,
          reservationId,
          kind: activityKind,
          quantityDelta: delta,
          metadata: action === "correct" && correctionDirection ? { targetUserId, direction: correctionDirection } : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: `MATERIAL_${activityKind}`,
          entityType: "Material",
          entityId: materialId,
          metadata: { buildingId, quantityDelta: delta, operationId: body.operationId as string },
        },
      });

      if (activityKind === "RESERVED") {
        const contributors = await tx.materialContribution.findMany({ where: { materialId }, select: { userId: true } });
        await createUserNotifications(tx, {
          recipientIds: [material.building.ownerId, material.building.responsibleId, ...contributors.map((entry) => entry.userId)],
          actorId: actor.id,
          kind: "MATERIAL_RESERVED",
          buildingId,
          entityId: materialId,
          payload: { buildingName: material.building.name, materialName: material.name, quantity, reservationId },
        });
      }

      if (activityKind === "GATHERED" || activityKind === "DELIVERED") {
        const totals = await tx.materialContribution.aggregate({ where: { materialId }, _sum: { gatheredQty: true, deliveredQty: true } });
        const currentTotal = activityKind === "GATHERED" ? totals._sum.gatheredQty ?? 0 : totals._sum.deliveredQty ?? 0;
        const previousTotal = currentTotal - quantity;
        if (material.requiredQty > 0 && previousTotal < material.requiredQty && currentTotal >= material.requiredQty) {
          const contributors = await tx.materialContribution.findMany({ where: { materialId }, select: { userId: true } });
          await createUserNotifications(tx, {
            recipientIds: [material.building.ownerId, material.building.responsibleId, ...contributors.map((entry) => entry.userId)],
            actorId: actor.id,
            kind: activityKind === "GATHERED" ? "MATERIAL_GATHERED" : "MATERIAL_DELIVERED",
            buildingId,
            entityId: materialId,
            payload: { buildingName: material.building.name, materialName: material.name, completed: true },
          });
        }
      }
      return { duplicate: false as const };
    }, { isolationLevel: "Serializable" });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof OperationError) return errorResponse(error.message, error.status);
    if (typeof error === "object" && error !== null && "code" in error) {
      const code = String(error.code);
      if (code === "P2002") return NextResponse.json({ ok: true, duplicate: true });
      if (code === "P2034") return errorResponse("Данные изменились параллельно. Повторите операцию.", 409);
    }
    return errorResponse("Не удалось сохранить операцию с материалом", 500);
  }
}

class OperationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
