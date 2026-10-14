import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { reserveWarehouseStock, WarehouseReservationError } from "../app/api/warehouse/reservations/operations.ts";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("warehouse reservations serialize concurrent requests and never exceed available stock", async (t) => {
  if (!testDatabaseUrl) {
    t.skip("TEST_DATABASE_URL is not set");
    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = randomUUID();
  const userIds: string[] = [];
  let stockId: string | undefined;

  try {
    const users = await Promise.all(["a", "b"].map((letter) => prisma.user.create({
      data: {
        minecraftNickname: `Warehouse${letter}${suffix.slice(0, 8)}`,
        normalizedNickname: `warehouse${letter}${suffix.slice(0, 8)}`,
        passwordHash: "test-only",
        role: "PLAYER",
        mustChangePassword: false,
      },
      select: { id: true },
    })));
    userIds.push(...users.map((user) => user.id));
    const stock = await prisma.warehouseStock.create({
      data: { itemName: `Concurrency ${suffix}`, normalizedName: `warehouse-${suffix}`, quantity: 1 },
      select: { id: true },
    });
    stockId = stock.id;

    const reserve = (userId: string) => prisma.$transaction((tx) => reserveWarehouseStock(tx, {
      stockId: stock.id,
      userId,
      quantity: 1,
      operationId: randomUUID(),
    }), { isolationLevel: "Serializable" });
    const results = await Promise.allSettled(users.map((user) => reserve(user.id)));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);

    const current = await prisma.warehouseStock.findUniqueOrThrow({ where: { id: stock.id } });
    assert.equal(current.quantity - current.reserved, 0);
    assert.equal(current.reserved, 1);
    await assert.rejects(
      () => prisma.$transaction((tx) => reserveWarehouseStock(tx, {
        stockId: stock.id,
        userId: users[0]!.id,
        quantity: 1,
        operationId: randomUUID(),
      })),
      (error: unknown) => error instanceof WarehouseReservationError && error.status === 409,
    );
  } finally {
    if (stockId) await prisma.warehouseStock.delete({ where: { id: stockId } }).catch(() => undefined);
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
});

test("active reservations for one warehouse user can be merged by stock", async (t) => {
  if (!testDatabaseUrl) {
    t.skip("TEST_DATABASE_URL is not set");
    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = randomUUID();
  let stockId: string | undefined;
  let userId: string | undefined;

  try {
    const user = await prisma.user.create({
      data: {
        minecraftNickname: `WarehouseMerge${suffix.slice(0, 8)}`,
        normalizedNickname: `warehousemerge${suffix.slice(0, 8)}`,
        passwordHash: "test-only",
        role: "PLAYER",
        mustChangePassword: false,
      },
      select: { id: true },
    });
    userId = user.id;
    const stock = await prisma.warehouseStock.create({
      data: { itemName: `Merge ${suffix}`, normalizedName: `warehouse-merge-${suffix}`, quantity: 10 },
      select: { id: true },
    });
    stockId = stock.id;

    await prisma.$transaction((tx) => reserveWarehouseStock(tx, {
      stockId: stock.id, userId: user.id, quantity: 2, operationId: randomUUID(),
    }));
    await prisma.$transaction((tx) => reserveWarehouseStock(tx, {
      stockId: stock.id, userId: user.id, quantity: 3, operationId: randomUUID(),
    }));

    const rows = await prisma.warehouseReservation.findMany({
      where: { stockId: stock.id, userId: user.id, releasedAt: null },
      select: { quantity: true },
    });
    assert.equal(rows.reduce((sum, row) => sum + row.quantity, 0), 5);
    assert.equal((await prisma.warehouseStock.findUniqueOrThrow({ where: { id: stock.id } })).reserved, 5);
  } catch (error) {
    if (error instanceof WarehouseReservationError) throw error;
    throw error;
  } finally {
    if (stockId) await prisma.warehouseStock.delete({ where: { id: stockId } }).catch(() => undefined);
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});
