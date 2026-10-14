import assert from "node:assert/strict";
import { Prisma, PrismaClient } from "@prisma/client";

const LEGACY_BUILDING_ID = "legacy-building-fixture";
const prisma = new PrismaClient();

try {
  const sourceRows = await prisma.$queryRaw(Prisma.sql`
    SELECT "id", "name", "x", "y", "z", "createdAt"
    FROM "Buildings"
    WHERE "id" = ${LEGACY_BUILDING_ID}
  `);

  assert.equal(sourceRows.length, 1, "legacy source row was not preserved");
  const source = sourceRows[0];
  assert.deepEqual({
    id: source.id,
    name: source.name,
    x: source.x,
    y: source.y,
    z: source.z,
  }, {
    id: LEGACY_BUILDING_ID,
    name: "Legacy Rathaus",
    x: 123,
    y: 64,
    z: -456,
  });

  const building = await prisma.building.findUnique({
    where: { id: LEGACY_BUILDING_ID },
    select: {
      id: true,
      name: true,
      x: true,
      y: true,
      z: true,
      createdAt: true,
      updatedAt: true,
      legacyChecklist: true,
      materials: {
        select: { normalizedName: true, requiredQty: true },
        orderBy: { normalizedName: "asc" },
      },
    },
  });

  assert.ok(building, "legacy building was not copied to Building");
  assert.equal(building.id, LEGACY_BUILDING_ID);
  assert.equal(building.name, "Legacy Rathaus");
  assert.deepEqual([building.x, building.y, building.z], [123, 64, -456]);
  assert.equal(building.createdAt.getTime(), source.createdAt.getTime());
  assert.equal(building.updatedAt.getTime(), source.createdAt.getTime());
  assert.deepEqual(building.legacyChecklist, [
    { text: "Foundation", done: true },
    { text: "Roof", done: false },
  ]);
  assert.deepEqual(building.materials, [
    { normalizedName: "glass", requiredQty: 24 },
    { normalizedName: "stone bricks", requiredQty: 128 },
  ]);

} finally {
  await prisma.$disconnect();
}

console.log("Legacy building migration verified.");
