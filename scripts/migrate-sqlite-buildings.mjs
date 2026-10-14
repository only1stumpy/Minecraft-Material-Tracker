import { DatabaseSync } from "node:sqlite";
import { access } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const sourcePath = process.argv[2] ?? "prisma/dev.db";
await access(sourcePath);
const source = new DatabaseSync(sourcePath, { readOnly: true });
const prisma = new PrismaClient();

try {
  const rows = source.prepare(`
    SELECT id, name, x, y, z, schematicFileName, materialsFileName,
           screenshotDataUrl, materials, createdAt
    FROM Building
  `).all();

  for (const row of rows) {
    const materials = JSON.parse(String(row.materials));
    await prisma.building.upsert({
      where: { id: String(row.id) },
      update: {},
      create: {
        id: String(row.id),
        name: String(row.name),
        x: Number(row.x), y: Number(row.y), z: Number(row.z),
        schematicFileName: String(row.schematicFileName),
        materialsFileName: String(row.materialsFileName),
        screenshotDataUrl: row.screenshotDataUrl ? String(row.screenshotDataUrl) : null,
        materials,
        createdAt: new Date(String(row.createdAt)),
      },
    });
  }
  console.log(`Перенесено или уже существовало построек: ${rows.length}`);
} finally {
  source.close();
  await prisma.$disconnect();
}
