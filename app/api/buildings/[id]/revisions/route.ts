import { NextResponse } from "next/server";
import type { BuildingStatus, Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { parseMaterialDrafts } from "@/lib/building-input";
import { canManageBuilding } from "@/lib/permissions";
import { getVerifiedStoredUpload } from "@/lib/private-uploads";
import { prisma } from "@/lib/prisma";
import { validateSchematic } from "@/lib/nbt";
import { checkMutationRateLimit, validateSameOrigin } from "@/lib/security";

const STATUSES = ["DRAFT", "PLANNED", "COLLECTING", "READY", "BUILDING", "COMPLETED", "PAUSED", "ARCHIVED"] as const;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

function storedSnapshot(value: Prisma.JsonValue): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const coordinates = isRecord(value.coordinates) ? value.coordinates : {};
  const materials = Array.isArray(value.materials) ? value.materials : null;
  if (typeof value.name !== "string" || value.name.length < 1 || value.name.length > 120
    || typeof value.status !== "string" || !(STATUSES as readonly string[]).includes(value.status)
    || !materials || materials.length > 2000) return null;
  const drafts = materials.map((row) => {
    if (!isRecord(row)) return row;
    const surplusLimit = row.surplusLimit !== undefined
      ? row.surplusLimit
      : row.allowSurplus === undefined
        ? 0
        : row.allowSurplus === true && typeof row.stackSize === "number"
          ? row.stackSize
          : Number.NaN;
    return {
      name: row.name,
      requiredQty: row.requiredQty,
      stackSize: row.stackSize,
      surplusLimit,
    };
  });
  const parsed = parseMaterialDrafts(drafts);
  if (parsed.errors.length || parsed.duplicates.length) return null;
  const materialDetails = materials.map((row, index) => {
    if (!isRecord(row)) return null;
    const archived = row.isArchived === undefined ? false : row.isArchived;
    const sortOrder = row.sortOrder === undefined ? index : row.sortOrder;
    if (typeof archived !== "boolean" || typeof sortOrder !== "number" || !Number.isSafeInteger(sortOrder) || sortOrder < 0) return null;
    return { ...parsed.rows[index], isArchived: archived, sortOrder };
  });
  if (materialDetails.some((row) => row === null)) return null;

  for (const field of ["x", "y", "z"] as const) {
    const coordinate = coordinates[field];
    if (coordinate !== null && coordinate !== undefined && (typeof coordinate !== "number" || !Number.isSafeInteger(coordinate))) return null;
  }
  if (value.description !== null && value.description !== undefined && typeof value.description !== "string") return null;
  for (const field of ["schematicFileName", "schematicPath", "screenshotPath"] as const) {
    if (value[field] !== null && value[field] !== undefined && typeof value[field] !== "string") return null;
  }
  for (const field of ["ownerId", "responsibleId"] as const) {
    if (value[field] !== null && value[field] !== undefined && typeof value[field] !== "string") return null;
  }
  return {
    ...value,
    coordinates,
    materials: materialDetails,
    status: value.status as BuildingStatus,
  };
}

function imageSignature(bytes: Uint8Array) {
  return (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a)
    || (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    || (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validateSameOrigin(request)) return fail("Недопустимый источник запроса", 403);
  const actor = await getCurrentUser();
  if (!actor) return fail("Требуется авторизация", 401);
  if (actor.mustChangePassword) return fail("Сначала смените временный пароль", 403);
  const rateLimit = await checkMutationRateLimit("building-revision", actor.id, { limit: 10, windowMs: 60_000 });
  if (rateLimit) return rateLimit;

  const { id } = await params;
  const body = await request.json().catch(() => null) as { revisionId?: unknown; expectedVersion?: unknown } | null;
  if (typeof body?.revisionId !== "string" || typeof body.expectedVersion !== "number"
    || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1) return fail("Некорректные параметры восстановления", 400);

  try {
    const building = await prisma.building.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, ownerId: true, version: true },
    });
    if (!building) return fail("Постройка не найдена", 404);
    if (!canManageBuilding(actor, { ownerId: building.ownerId })) return fail("Недостаточно прав", 403);
    if (building.version !== body.expectedVersion) return fail("Карточку уже изменили. Обновите страницу и повторите действие.", 409);

    const revision = await prisma.buildingRevision.findFirst({
      where: { id: body.revisionId, buildingId: id },
      select: { id: true, version: true, snapshot: true },
    });
    if (!revision) return fail("Ревизия не найдена", 404);
    const snapshot = storedSnapshot(revision.snapshot);
    if (!snapshot) return fail("Сохранённая ревизия повреждена и не может быть восстановлена", 422);

    const schematicPath = typeof snapshot.schematicPath === "string" ? snapshot.schematicPath : null;
    const screenshotPath = typeof snapshot.screenshotPath === "string" ? snapshot.screenshotPath : null;
    const schematic = schematicPath ? await getVerifiedStoredUpload(schematicPath, "schematic") : null;
    const screenshot = screenshotPath ? await getVerifiedStoredUpload(screenshotPath, "screenshot") : null;
    if (schematicPath && (!schematic || !["litematic", "schem"].includes(schematic.extension))) return fail("Файл схемы из этой ревизии недоступен или повреждён", 409);
    if (screenshotPath && (!screenshot || !imageSignature(screenshot.bytes))) return fail("Скриншот из этой ревизии недоступен или повреждён", 409);
    if (schematic) {
      try { validateSchematic(schematic.bytes, `.${schematic.extension}`); }
      catch { return fail("Схема из этой ревизии не прошла проверку NBT", 409); }
    }

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.building.findUnique({ where: { id }, include: { materials: { orderBy: { sortOrder: "asc" } } } });
      if (!current || current.deletedAt) throw new Error("BUILDING_NOT_FOUND");
      if (current.version !== body.expectedVersion) throw new Error("VERSION_CONFLICT");

      await tx.buildingRevision.create({
        data: {
          buildingId: id,
          version: current.version,
          actorId: actor.id,
          snapshot: {
            name: current.name,
            description: current.description,
            coordinates: { x: current.x, y: current.y, z: current.z },
            status: current.status,
            schematicFileName: current.schematicFileName,
            schematicPath: current.schematicPath,
            screenshotPath: current.screenshotPath,
            ownerId: current.ownerId,
            responsibleId: current.responsibleId,
            materials: current.materials.map(({ name, normalizedName, requiredQty, stackSize, surplusLimit, isArchived, sortOrder }) => ({ name, normalizedName, requiredQty, stackSize, surplusLimit, isArchived, sortOrder })),
          },
        },
      });

      const materials = snapshot.materials as Array<ReturnType<typeof parseMaterialDrafts>["rows"][number] & { isArchived: boolean; sortOrder: number }>;
      const activeNames = new Set(materials.filter((row) => !row.isArchived).map((row) => row.normalizedName));
      await tx.material.updateMany({
        where: { buildingId: id, isArchived: false, ...(activeNames.size ? { normalizedName: { notIn: [...activeNames] } } : {}) },
        data: { isArchived: true },
      });
      for (const material of materials) {
        await tx.material.upsert({
          where: { buildingId_normalizedName: { buildingId: id, normalizedName: material.normalizedName } },
          create: { buildingId: id, ...material },
          update: { name: material.name, requiredQty: material.requiredQty, stackSize: material.stackSize, surplusLimit: material.surplusLimit, sortOrder: material.sortOrder, isArchived: material.isArchived },
        });
      }

      const ownerId = typeof snapshot.ownerId === "string" && await tx.user.findUnique({ where: { id: snapshot.ownerId }, select: { id: true } }) ? snapshot.ownerId : null;
      const responsibleId = typeof snapshot.responsibleId === "string" && await tx.user.findUnique({ where: { id: snapshot.responsibleId }, select: { id: true } }) ? snapshot.responsibleId : null;
      const coordinates = snapshot.coordinates as Record<string, number | null | undefined>;
      const updated = await tx.building.update({
        where: { id },
        data: {
          name: snapshot.name as string,
          description: typeof snapshot.description === "string" ? snapshot.description : null,
          x: coordinates.x ?? null,
          y: coordinates.y ?? null,
          z: coordinates.z ?? null,
          status: snapshot.status as BuildingStatus,
          schematicFileName: typeof snapshot.schematicFileName === "string" ? snapshot.schematicFileName : null,
          schematicPath,
          schematicSize: schematic?.size ?? null,
          schematicContentType: schematic?.contentType ?? null,
          screenshotPath,
          screenshotSize: screenshot?.size ?? null,
          ownerId,
          responsibleId,
          version: { increment: 1 },
        },
        select: { id: true, name: true, status: true, version: true },
      });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "BUILDING_REVISION_RESTORED", entityType: "Building", entityId: id, metadata: { revisionId: revision.id, restoredVersion: revision.version, version: updated.version } } });
      return updated;
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ building: result });
  } catch (error) {
    if (error instanceof Error && error.message === "BUILDING_NOT_FOUND") return fail("Постройка не найдена", 404);
    if (error instanceof Error && error.message === "VERSION_CONFLICT") return fail("Карточку изменили параллельно. Обновите её и повторите действие.", 409);
    if (typeof error === "object" && error !== null && "code" in error && String(error.code) === "P2034") return fail("Карточку изменили параллельно. Обновите её и повторите действие.", 409);
    return fail("Не удалось восстановить ревизию", 500);
  }
}
