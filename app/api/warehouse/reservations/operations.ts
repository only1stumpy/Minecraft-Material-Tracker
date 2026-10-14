import type { Prisma } from "@prisma/client";

export const MAX_WAREHOUSE_QUANTITY = 2_147_483_647;

export class WarehouseReservationError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type ReservationInput = {
  stockId: string;
  userId: string;
  operationId: string;
  quantity: number;
};

/**
 * Creates a reservation while serializing all writers through the stock row.
 * The `updatedAt` write is intentional: it obtains a PostgreSQL row lock before
 * the available quantity is read, so two requests cannot reserve the same unit.
 */
export async function reserveWarehouseStock(
  tx: Prisma.TransactionClient,
  input: ReservationInput,
) {
  const duplicate = await tx.warehouseReservation.findUnique({
    where: { operationId: input.operationId },
    select: { id: true, operationId: true, stockId: true, quantity: true, releasedAt: true, createdAt: true },
  });
  if (duplicate) return { duplicate: true as const, reservation: duplicate };

  const stock = await tx.warehouseStock.update({
    where: { id: input.stockId },
    data: { updatedAt: new Date() },
    select: { id: true, itemName: true, normalizedName: true, quantity: true, reserved: true },
  }).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && String(error.code) === "P2025") {
      throw new WarehouseReservationError("Материал отсутствует на складе", 404);
    }
    throw error;
  });

  const available = stock.quantity - stock.reserved;
  if (input.quantity > available) {
    throw new WarehouseReservationError(`Свободно только ${Math.max(0, available)}`, 409);
  }
  if (stock.reserved > MAX_WAREHOUSE_QUANTITY - input.quantity) {
    throw new WarehouseReservationError("Сумма резерваций превышает предел хранения", 409);
  }

  const reservation = await tx.warehouseReservation.create({
    data: {
      operationId: input.operationId,
      stockId: stock.id,
      userId: input.userId,
      quantity: input.quantity,
    },
    select: { id: true, operationId: true, stockId: true, quantity: true, releasedAt: true, createdAt: true },
  });
  await tx.warehouseStock.update({
    where: { id: stock.id },
    data: { reserved: { increment: input.quantity } },
  });

  return { duplicate: false as const, reservation, stock: { ...stock, reserved: stock.reserved + input.quantity } };
}

export async function releaseWarehouseReservation(
  tx: Prisma.TransactionClient,
  reservationId: string,
  userId: string,
) {
  const reservation = await tx.warehouseReservation.findFirst({
    where: { id: reservationId, userId, releasedAt: null },
    select: { id: true, operationId: true, stockId: true, quantity: true, releasedAt: true, createdAt: true },
  });
  if (!reservation) throw new WarehouseReservationError("Активная резервация не найдена", 404);

  const stock = await tx.warehouseStock.update({
    where: { id: reservation.stockId },
    data: { updatedAt: new Date() },
    select: { id: true, quantity: true, reserved: true },
  });
  const releasedAt = new Date();
  const closed = await tx.warehouseReservation.updateMany({
    where: { id: reservation.id, releasedAt: null },
    data: { releasedAt },
  });
  if (closed.count !== 1) throw new WarehouseReservationError("Активная резервация не найдена", 404);
  if (reservation.quantity > stock.reserved) {
    throw new WarehouseReservationError("Счётчик резерваций склада повреждён", 409);
  }
  await tx.warehouseStock.update({
    where: { id: stock.id },
    data: { reserved: { decrement: reservation.quantity } },
  });
  return { reservation: { ...reservation, releasedAt }, stock: { ...stock, reserved: stock.reserved - reservation.quantity } };
}
