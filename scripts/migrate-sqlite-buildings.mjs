import { DatabaseSync } from "node:sqlite";
import { access } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const sourcePath = process.argv[2] ?? "prisma/dev.db";
const MAX_ROWS = 10_000;
const MAX_QUANTITY = 2_147_483_647;
await access(sourcePath);
const source = new DatabaseSync(sourcePath, { readOnly: true });
const prisma = new PrismaClient();

const tables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => String(row.name)));
const tableName = tables.has("Building") ? "Building" : tables.has("Buildings") ? "Buildings" : null;
if (!tableName) {
  source.close();
  await prisma.$disconnect();
  throw new Error("В SQLite не найдена таблица Building или Buildings");
}

const rowCount = Number(source.prepare(`SELECT COUNT(*) AS count FROM "${tableName}"`).get().count);
if (!Number.isSafeInteger(rowCount) || rowCount > MAX_ROWS) {
  source.close();
  await prisma.$disconnect();
  throw new Error(`Найдено ${rowCount} записей; безопасный предел одного импорта — ${MAX_ROWS}. Разделите базу или увеличьте лимит после проверки backup.`);
}
const rows = source.prepare(`SELECT * FROM "${tableName}" ORDER BY "createdAt" ASC`).all();

const normalizeName = (value) => value.normalize("NFKC").toLocaleLowerCase("ru-RU").replaceAll("ё", "е").trim().replace(/\s+/g, " ");
const jsonValue = (value, fallback) => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
};
const intOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= -2_147_483_648 && number <= 2_147_483_647 ? number : null;
};

let imported = 0;
let skipped = 0;
let failed = 0;

try {
  for (const row of rows) {
    const sourceId = typeof row.id === "string" ? row.id : "";
    const rawMaterials = jsonValue(row.materials, []);
    const rawChecklist = jsonValue(row.checklist, null);
    const importIssues = [];
    let validMaterials = [];

    if (Array.isArray(rawMaterials)) {
      const grouped = new Map();
      rawMaterials.forEach((material, index) => {
        if (!material || typeof material !== "object" || Array.isArray(material)) {
          importIssues.push(`Строка материалов ${index + 1} имеет неверный формат`);
          return;
        }
        const name = typeof material.item === "string" ? material.item.normalize("NFKC").trim() : typeof material.name === "string" ? material.name.normalize("NFKC").trim() : "";
        const key = normalizeName(name);
        const quantityValue = material.total ?? material.requiredQty;
        const quantity = typeof quantityValue === "number" || typeof quantityValue === "string" ? Number(quantityValue) : Number.NaN;
        const stackValue = material.stackSize === undefined ? 64 : Number(material.stackSize);
        if (!name || name.length > 120 || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY
          || !Number.isSafeInteger(stackValue) || stackValue < 1 || stackValue > MAX_QUANTITY) {
          importIssues.push(`Строка материалов ${index + 1} не перенесена в рабочий список; исходное значение сохранено`);
          return;
        }
        const existing = grouped.get(key);
        if (existing) {
          const sum = existing.requiredQty + quantity;
          if (sum > MAX_QUANTITY) {
            importIssues.push(`Сумма для материала «${name}» превышает предел PostgreSQL INT; значения сохранены только в снимке`);
            return;
          }
          existing.requiredQty = sum;
          existing.legacySnapshot.push(material);
        } else {
          grouped.set(key, { name, normalizedName: key, requiredQty: quantity, stackSize: stackValue, surplusLimit: 0, legacySnapshot: [material] });
        }
      });
      validMaterials = Array.from(grouped.values());
    } else {
      importIssues.push("Исходный список материалов не является JSON-массивом; исходное значение сохранено");
    }

    try {
      if (!sourceId || typeof row.name !== "string" || !row.name.trim()) throw new Error("Нет устойчивого ID или названия постройки");
      const createdAt = row.createdAt ? new Date(String(row.createdAt)) : new Date();
      if (!Number.isFinite(createdAt.getTime())) throw new Error("Некорректная дата создания");
      const legacyMaterials = Array.isArray(rawMaterials) ? rawMaterials : { raw: rawMaterials };
      const legacyChecklist = rawChecklist === null ? undefined : Array.isArray(rawChecklist) || (rawChecklist && typeof rawChecklist === "object") ? rawChecklist : { raw: rawChecklist };
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.building.findUnique({ where: { id: sourceId }, select: { id: true } });
        if (existing) return "existing";
        await tx.building.create({
          data: {
            id: sourceId,
            name: row.name.normalize("NFKC").trim().slice(0, 120),
            x: intOrNull(row.x),
            y: intOrNull(row.y),
            z: intOrNull(row.z),
            schematicFileName: typeof row.schematicFileName === "string" ? row.schematicFileName.slice(0, 255) : null,
            materialsFileName: typeof row.materialsFileName === "string" ? row.materialsFileName.slice(0, 255) : null,
            legacyScreenshotDataUrl: typeof row.screenshotDataUrl === "string" ? row.screenshotDataUrl : null,
            legacyMaterials,
            ...(legacyChecklist !== undefined ? { legacyChecklist } : {}),
            status: "DRAFT",
            createdAt,
            materials: {
              create: validMaterials.map(({ legacySnapshot, ...material }, sortOrder) => ({ ...material, sortOrder, legacySnapshot })),
            },
          },
        });
        await tx.importLog.create({
          data: {
            fileName: sourcePath.split(/[\\/]/).at(-1),
            success: importIssues.length === 0,
            error: importIssues.length ? importIssues.slice(0, 30).join("; ").slice(0, 4000) : null,
            details: { sourceTable: tableName, sourceId, importedMaterials: validMaterials.length, materialIssues: importIssues.length },
          },
        });
        return "created";
      });
      if (result === "existing") skipped += 1;
      else {
        imported += 1;
        if (importIssues.length) failed += 1;
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Неизвестная ошибка импорта";
      await prisma.importLog.create({
        data: {
          fileName: sourcePath.split(/[\\/]/).at(-1),
          success: false,
          error: message.slice(0, 4000),
          details: { sourceTable: tableName, sourceId: sourceId || null },
        },
      }).catch(() => undefined);
      console.error(`Не удалось перенести запись ${sourceId || "без ID"}: ${message}`);
    }
  }
  console.log(`Новых построек: ${imported}; уже существовали: ${skipped}; с ошибками/предупреждениями: ${failed}; всего в источнике: ${rows.length}`);
  if (failed > 0) process.exitCode = 2;
} finally {
  source.close();
  await prisma.$disconnect();
}
