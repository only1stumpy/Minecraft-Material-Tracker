import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { normalizeMaterialName } from "@/lib/materials";
import { canModerateContent } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { validateSameOrigin } from "@/lib/security";

const MAX_INT = 2_147_483_647;
const MAX_ITEM_NAME_LENGTH = 160;
const MAX_NOTE_LENGTH = 500;
const MAX_STOCK_ROWS = 500;

type MovementKind = "RECEIVED" | "USED" | "ADJUSTED";

type WarehouseBody = {
  itemName?: unknown;
  kind?: unknown;
  quantity?: unknown;
  note?: unknown;
};

const isMovementKind = (value: unknown): value is MovementKind =>
  value === "RECEIVED" || value === "USED" || value === "ADJUSTED";

const isSafeQuantity = (value: unknown, allowZero = false): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= (allowZero ? 0 : 1) &&
  value <= MAX_INT;

const errorResponse = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status });

const serializeStock = (stock: {
  id: string;
  itemName: string;
  normalizedName: string;
  stackSize: number;
  quantity: number;
  updatedAt: Date;
}) => ({
  id: stock.id,
  itemName: stock.itemName,
  normalizedName: stock.normalizedName,
  stackSize: stock.stackSize,
  quantity: stock.quantity,
  updatedAt: stock.updatedAt,
});

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return errorResponse("Требуется авторизация", 401);
  if (actor.mustChangePassword) {
    return errorResponse("Сначала смените временный пароль", 403);
  }

  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q") ?? "";
  const query = normalizeMaterialName(rawQuery);
  if (query.length > MAX_ITEM_NAME_LENGTH) {
    return errorResponse("Поисковый запрос слишком длинный", 400);
  }

  const stocks = await prisma.warehouseStock.findMany({
    where: query ? { normalizedName: { contains: query } } : undefined,
    orderBy: { itemName: "asc" },
    take: MAX_STOCK_ROWS,
    select: {
      id: true,
      itemName: true,
      normalizedName: true,
      stackSize: true,
      quantity: true,
      updatedAt: true,
      movements: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          kind: true,
          delta: true,
          note: true,
          createdAt: true,
          actor: { select: { minecraftNickname: true } },
        },
      },
    },
  });

  return NextResponse.json({
    stocks: stocks.map((stock) => ({
      ...serializeStock(stock),
      movements: stock.movements.map((movement) => ({
        id: movement.id,
        kind: movement.kind,
        delta: movement.delta,
        note: movement.note,
        createdAt: movement.createdAt,
        actorName: movement.actor.minecraftNickname,
      })),
    })),
  });
}

export async function POST(request: Request) {
  if (!validateSameOrigin(request)) {
    return errorResponse("Недопустимый источник запроса", 403);
  }

  const actor = await getCurrentUser();
  if (!actor) return errorResponse("Требуется авторизация", 401);
  if (actor.mustChangePassword) {
    return errorResponse("Сначала смените временный пароль", 403);
  }
  if (!canModerateContent(actor)) {
    return errorResponse("Недостаточно прав для управления складом", 403);
  }

  const body = await request.json().catch(() => null) as WarehouseBody | null;
  const rawItemName = typeof body?.itemName === "string" ? body.itemName.normalize("NFKC").trim() : "";
  const kind = body?.kind;
  const quantity = body?.quantity;
  const note = body?.note;

  if (
    !rawItemName ||
    rawItemName.length > MAX_ITEM_NAME_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(rawItemName)
  ) {
    return errorResponse("Название материала должно содержать от 1 до 160 символов", 400);
  }
  if (!isMovementKind(kind)) {
    return errorResponse("Некорректный тип движения склада", 400);
  }
  if (!isSafeQuantity(quantity, kind === "ADJUSTED")) {
    return errorResponse(
      kind === "ADJUSTED"
        ? "Новое количество должно быть целым числом от 0 до 2 147 483 647"
        : "Количество должно быть положительным целым числом",
      400,
    );
  }
  if (note !== undefined && note !== null && typeof note !== "string") {
    return errorResponse("Примечание должно быть текстом", 400);
  }
  const cleanNote = typeof note === "string" ? note.normalize("NFKC").trim() : null;
  if (cleanNote && (cleanNote.length > MAX_NOTE_LENGTH || /[\u0000\u007f]/.test(cleanNote))) {
    return errorResponse("Примечание слишком длинное или содержит недопустимые символы", 400);
  }

  const normalizedName = normalizeMaterialName(rawItemName);
  if (!normalizedName || normalizedName.length > MAX_ITEM_NAME_LENGTH) {
    return errorResponse("Название материала некорректно", 400);
  }

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.warehouseStock.findUnique({
        where: { normalizedName },
        select: { id: true, itemName: true, normalizedName: true, stackSize: true, quantity: true },
      });

      if (kind === "USED" && !current) {
        throw new WarehouseOperationError("Материал отсутствует на складе", 404);
      }

      const currentQuantity = current?.quantity ?? 0;
      let nextQuantity = currentQuantity;
      let delta = 0;

      if (kind === "RECEIVED") {
        nextQuantity = currentQuantity + quantity;
        delta = quantity;
      } else if (kind === "USED") {
        if (quantity > currentQuantity) {
          throw new WarehouseOperationError("Нельзя списать больше остатка на складе", 409);
        }
        nextQuantity = currentQuantity - quantity;
        delta = -quantity;
      } else {
        nextQuantity = quantity;
        delta = nextQuantity - currentQuantity;
      }

      if (!Number.isSafeInteger(nextQuantity) || nextQuantity < 0 || nextQuantity > MAX_INT) {
        throw new WarehouseOperationError("Остаток превышает допустимый предел", 409);
      }

      const stock = current
        ? await tx.warehouseStock.update({
            where: { id: current.id },
            data: { quantity: nextQuantity },
            select: { id: true, itemName: true, normalizedName: true, stackSize: true, quantity: true, updatedAt: true },
          })
        : await tx.warehouseStock.create({
            data: { itemName: rawItemName, normalizedName, quantity: nextQuantity },
            select: { id: true, itemName: true, normalizedName: true, stackSize: true, quantity: true, updatedAt: true },
          });

      const movement = await tx.warehouseMovement.create({
        data: {
          stockId: stock.id,
          actorId: actor.id,
          kind,
          delta,
          note: cleanNote,
        },
        select: { id: true, kind: true, delta: true, note: true, createdAt: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: `WAREHOUSE_${kind}`,
          entityType: "WarehouseStock",
          entityId: stock.id,
          metadata: {
            itemName: stock.itemName,
            normalizedName,
            quantity: nextQuantity,
            delta,
            note: cleanNote,
            movementId: movement.id,
          },
        },
      });

      return { stock, movement };
    }, { isolationLevel: "Serializable" });

    return NextResponse.json({
      stock: {
        ...serializeStock(result.stock),
        movements: [{
          id: result.movement.id,
          kind: result.movement.kind,
          delta: result.movement.delta,
          note: result.movement.note,
          createdAt: result.movement.createdAt,
          actorName: actor.minecraftNickname,
        }],
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof WarehouseOperationError) {
      return errorResponse(error.message, error.status);
    }
    if (typeof error === "object" && error !== null && "code" in error) {
      const code = String(error.code);
      if (code === "P2002" || code === "P2034") {
        return errorResponse("Склад изменился параллельно. Повторите операцию.", 409);
      }
    }
    return errorResponse("Не удалось сохранить движение склада", 500);
  }
}

class WarehouseOperationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
