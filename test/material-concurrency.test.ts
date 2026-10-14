import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("serializable reservations cannot allocate the same final unit twice", async (t) => {
  if (!testDatabaseUrl) {
    t.skip("TEST_DATABASE_URL is not set");
    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = randomUUID();
  let buildingId: string | undefined;
  const userIds: string[] = [];

  try {
    const users = await Promise.all(["a", "b"].map((letter) => prisma.user.create({
      data: {
        minecraftNickname: "Test" + letter + suffix.slice(0, 8),
        normalizedNickname: ("test" + letter + suffix.slice(0, 8)).toLowerCase(),
        passwordHash: "test-only",
        role: "PLAYER",
        mustChangePassword: false,
      },
      select: { id: true },
    })));
    userIds.push(...users.map((user) => user.id));
    const building = await prisma.building.create({
      data: {
        name: "Concurrency " + suffix,
        status: "COLLECTING",
        ownerId: users[0]!.id,
        materials: { create: { name: "Test Block", normalizedName: "test-block-" + suffix, requiredQty: 1 } },
      },
      select: { id: true, materials: { select: { id: true } } },
    });
    buildingId = building.id;
    const materialId = building.materials[0]!.id;

    const reserve = (userId: string) => prisma.$transaction(async (tx) => {
      const material = await tx.material.findUniqueOrThrow({ where: { id: materialId }, select: { requiredQty: true } });
      const contributions = await tx.materialContribution.aggregate({ where: { materialId }, _sum: { gatheredQty: true } });
      const reservations = await tx.materialReservation.findMany({ where: { materialId, releasedAt: null }, select: { quantity: true, gatheredQty: true } });
      const reserved = reservations.reduce((sum, reservation) => sum + reservation.quantity - reservation.gatheredQty, 0);
      const gathered = contributions._sum.gatheredQty ?? 0;
      if (material.requiredQty - gathered - reserved < 1) throw new Error("NO_CAPACITY");
      return tx.materialReservation.create({ data: { materialId, userId, quantity: 1 }, select: { id: true } });
    }, { isolationLevel: "Serializable" });

    const results = await Promise.allSettled(userIds.map((userId) => reserve(userId)));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const active = await prisma.materialReservation.aggregate({
      where: { materialId, releasedAt: null },
      _sum: { quantity: true, gatheredQty: true },
    });
    assert.equal((active._sum.quantity ?? 0) - (active._sum.gatheredQty ?? 0), 1);
  } finally {
    if (buildingId) await prisma.building.delete({ where: { id: buildingId } }).catch(() => undefined);
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
});

test("резервации не выходят за требуемое количество плюс лимит избытка", async (t) => {
  if (!testDatabaseUrl) {
    t.skip("TEST_DATABASE_URL is not set");
    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = randomUUID();
  let buildingId: string | undefined;
  const userIds: string[] = [];

  try {
    const users = await Promise.all(["a", "b"].map((letter) => prisma.user.create({
      data: {
        minecraftNickname: "Cap" + letter + suffix.slice(0, 8),
        normalizedNickname: ("cap" + letter + suffix.slice(0, 8)).toLowerCase(),
        passwordHash: "test-only",
        role: "PLAYER",
        mustChangePassword: false,
      },
      select: { id: true },
    })));
    userIds.push(...users.map((user) => user.id));
    const building = await prisma.building.create({
      data: {
        name: "Surplus cap " + suffix,
        status: "COLLECTING",
        ownerId: users[0]!.id,
        materials: { create: { name: "Capped Block", normalizedName: "capped-block-" + suffix, requiredQty: 2, surplusLimit: 1 } },
      },
      select: { id: true, materials: { select: { id: true } } },
    });
    buildingId = building.id;
    const materialId = building.materials[0]!.id;

    const reserve = (userId: string) => prisma.$transaction(async (tx) => {
      const material = await tx.material.findUniqueOrThrow({ where: { id: materialId }, select: { requiredQty: true, surplusLimit: true } });
      const contributions = await tx.materialContribution.aggregate({ where: { materialId }, _sum: { gatheredQty: true } });
      const reservations = await tx.materialReservation.findMany({ where: { materialId, releasedAt: null }, select: { quantity: true, gatheredQty: true } });
      const reserved = reservations.reduce((sum, reservation) => sum + reservation.quantity - reservation.gatheredQty, 0);
      const gathered = contributions._sum.gatheredQty ?? 0;
      if (material.requiredQty + material.surplusLimit - gathered - reserved < 2) throw new Error("NO_CAPACITY");
      return tx.materialReservation.create({ data: { materialId, userId, quantity: 2 }, select: { id: true } });
    }, { isolationLevel: "Serializable" });

    const results = await Promise.allSettled(userIds.map((userId) => reserve(userId)));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const active = await prisma.materialReservation.aggregate({
      where: { materialId, releasedAt: null },
      _sum: { quantity: true, gatheredQty: true },
    });
    assert.equal((active._sum.quantity ?? 0) - (active._sum.gatheredQty ?? 0), 2);
    assert.ok((active._sum.quantity ?? 0) <= 3);
  } finally {
    if (buildingId) await prisma.building.delete({ where: { id: buildingId } }).catch(() => undefined);
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
});
