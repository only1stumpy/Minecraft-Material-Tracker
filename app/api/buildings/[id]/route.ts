import { NextResponse } from "next/server";
import type { BuildingStatus, Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { parseMaterialDrafts } from "@/lib/building-input";
import { createUserNotifications } from "@/lib/notifications";
import { validateSchematic } from "@/lib/nbt";
import { canManageBuilding, canModerateContent } from "@/lib/permissions";
import { getVerifiedOwnedUpload } from "@/lib/private-uploads";
import { prisma } from "@/lib/prisma";
import { validateSameOrigin } from "@/lib/security";

const STATUSES = ["DRAFT", "PLANNED", "COLLECTING", "READY", "BUILDING", "COMPLETED", "PAUSED", "ARCHIVED"] as const;
type RequestBody = Record<string, unknown> & {
  expectedVersion?: unknown;
  materials?: unknown;
  mergeDuplicates?: unknown;
  schematicPath?: unknown;
  screenshotPath?: unknown;
  ownerId?: unknown;
  responsibleId?: unknown;
};

class UpdateError extends Error {
  constructor(message: string, readonly status = 400, readonly details?: Record<string, unknown>) { super(message); }
}

const fail = (message: string, status: number, details?: Record<string, unknown>) => NextResponse.json({ error: message, ...details }, { status });
const own = (body: object, key: string) => Object.prototype.hasOwnProperty.call(body, key);
const isStatus = (value: unknown): value is BuildingStatus => typeof value === "string" && (STATUSES as readonly string[]).includes(value);

function optionalInt(body: RequestBody, field: "x" | "y" | "z") {
  if (!own(body, field)) return undefined;
  const value = body[field];
  if (value === null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < -2_147_483_648 || number > 2_147_483_647) throw new UpdateError(`Координата ${field.toUpperCase()} должна быть целым числом`);
  return number;
}

function imageSignature(bytes: Uint8Array) {
  return (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a)
    || (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    || (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP");
}

async function verifyAsset(pathname: unknown, userId: string, kind: "schematic" | "screenshot") {
  if (typeof pathname !== "string") throw new UpdateError("Путь файла некорректен");
  const upload = await getVerifiedOwnedUpload(pathname, userId);
  if (!upload || upload.kind !== kind) throw new UpdateError("Файл не найден, повреждён или принадлежит другому пользователю");
  if (kind === "schematic") {
    try { validateSchematic(upload.bytes, `.${upload.extension}`); }
    catch { throw new UpdateError("Схема не прошла проверку структуры NBT"); }
  } else if (!imageSignature(upload.bytes)) throw new UpdateError("Файл не похож на PNG, JPEG или WebP");
  return upload;
}

function snapshotOf(building: {
  name: string; description: string | null; x: number | null; y: number | null; z: number | null;
  status: BuildingStatus; schematicFileName: string | null; schematicPath: string | null; screenshotPath: string | null;
  ownerId: string | null; responsibleId: string | null; materials: Array<{ name: string; normalizedName: string; requiredQty: number; stackSize: number; allowSurplus: boolean; isArchived: boolean; sortOrder: number }>;
}): Prisma.InputJsonObject {
  return {
    name: building.name,
    description: building.description,
    coordinates: { x: building.x, y: building.y, z: building.z },
    status: building.status,
    schematicFileName: building.schematicFileName,
    schematicPath: building.schematicPath,
    screenshotPath: building.screenshotPath,
    ownerId: building.ownerId,
    responsibleId: building.responsibleId,
    materials: building.materials.map(({ name, normalizedName, requiredQty, stackSize, allowSurplus, isArchived, sortOrder }) => ({ name, normalizedName, requiredQty, stackSize, allowSurplus, isArchived, sortOrder })),
  };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validateSameOrigin(request)) return fail("Недопустимый источник запроса", 403);
  const actor = await getCurrentUser();
  if (!actor) return fail("Требуется авторизация", 401);
  if (actor.mustChangePassword) return fail("Сначала смените временный пароль", 403);

  const { id } = await params;
  const body = await request.json().catch(() => null) as RequestBody | null;
  if (!body || typeof body.expectedVersion !== "number" || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1) return fail("Не указана версия карточки для безопасного сохранения", 400);

  const existing = await prisma.building.findFirst({
    where: { id, deletedAt: null },
    include: { materials: { orderBy: { sortOrder: "asc" } } },
  });
  if (!existing) return fail("Постройка не найдена", 404);
  if (!canManageBuilding(actor, { ownerId: existing.ownerId })) return fail("Недостаточно прав", 403);
  if (existing.version !== body.expectedVersion) return fail("Карточку уже изменили. Обновите страницу и повторите правки.", 409, { currentVersion: existing.version });

  try {
    const name = own(body, "name") ? (typeof body.name === "string" ? body.name.normalize("NFKC").trim() : "") : existing.name;
    if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) throw new UpdateError("Название должно содержать от 1 до 120 символов");
    const description = !own(body, "description") ? existing.description : body.description === null || body.description === "" ? null : body.description;
    if (description !== null && (typeof description !== "string" || description.length > 10_000)) throw new UpdateError("Описание не должно превышать 10 000 символов");
    const status = own(body, "status") ? body.status : existing.status;
    if (!isStatus(status)) throw new UpdateError("Некорректный статус постройки");
    const x = optionalInt(body, "x");
    const y = optionalInt(body, "y");
    const z = optionalInt(body, "z");

    const materials = own(body, "materials") ? parseMaterialDrafts(body.materials, body.mergeDuplicates === true) : undefined;
    if (materials?.errors.length) throw new UpdateError("Исправьте ошибки в материалах", 400, { materialErrors: materials.errors });
    if (materials?.duplicates.length && body.mergeDuplicates !== true) throw new UpdateError("Повторяющиеся материалы требуют подтверждения объединения", 409, { duplicates: materials.duplicates });

    let schematic = undefined as Awaited<ReturnType<typeof verifyAsset>> | null | undefined;
    let screenshot = undefined as Awaited<ReturnType<typeof verifyAsset>> | null | undefined;
    if (own(body, "schematicPath")) schematic = body.schematicPath === null || body.schematicPath === "" ? null : await verifyAsset(body.schematicPath, actor.id, "schematic");
    if (own(body, "screenshotPath")) screenshot = body.screenshotPath === null || body.screenshotPath === "" ? null : await verifyAsset(body.screenshotPath, actor.id, "screenshot");

    let ownerId: string | null | undefined;
    if (own(body, "ownerId")) {
      if (!canModerateContent(actor)) throw new UpdateError("Передавать постройку может только модератор или администратор", 403);
      if (body.ownerId !== null && typeof body.ownerId !== "string") throw new UpdateError("Некорректный владелец");
      ownerId = body.ownerId as string | null;
      if (ownerId) {
        const owner = await prisma.user.findFirst({ where: { id: ownerId, isBlocked: false }, select: { id: true } });
        if (!owner) throw new UpdateError("Новый владелец не найден или заблокирован", 404);
      }
    }
    let responsibleId: string | null | undefined;
    if (own(body, "responsibleId")) {
      if (body.responsibleId !== null && typeof body.responsibleId !== "string") throw new UpdateError("Некорректный ответственный");
      responsibleId = body.responsibleId as string | null;
      if (responsibleId) {
        const responsible = await prisma.user.findFirst({ where: { id: responsibleId, isBlocked: false }, select: { id: true } });
        if (!responsible) throw new UpdateError("Ответственный не найден или заблокирован", 404);
      }
    }

    const duplicate = name.toLocaleLowerCase("ru-RU") === existing.name.toLocaleLowerCase("ru-RU") ? null : await prisma.building.findFirst({
      where: { id: { not: id }, deletedAt: null, name: { equals: name, mode: "insensitive" } }, select: { id: true, name: true },
    });
    if (duplicate && body.confirmDuplicateBuilding !== true) throw new UpdateError("Уже есть постройка с таким названием. Подтвердите дубликат.", 409, { duplicates: [duplicate] });

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.building.findUnique({ where: { id }, include: { materials: { orderBy: { sortOrder: "asc" } } } });
      if (!current || current.deletedAt) throw new UpdateError("Постройка не найдена", 404);
      if (current.version !== body.expectedVersion) throw new UpdateError("Карточку уже изменили. Обновите страницу и повторите правки.", 409, { currentVersion: current.version });
      await tx.buildingRevision.create({ data: { buildingId: id, version: current.version, actorId: actor.id, snapshot: snapshotOf(current) } });

      if (materials) {
        const nextNames = new Set(materials.rows.map((row) => row.normalizedName));
        await tx.material.updateMany({
          where: { buildingId: id, isArchived: false, ...(nextNames.size > 0 ? { normalizedName: { notIn: [...nextNames] } } : {}) },
          data: { isArchived: true },
        });
        for (const [sortOrder, row] of materials.rows.entries()) {
          await tx.material.upsert({
            where: { buildingId_normalizedName: { buildingId: id, normalizedName: row.normalizedName } },
            create: { buildingId: id, ...row, sortOrder, isArchived: false },
            update: { name: row.name, requiredQty: row.requiredQty, stackSize: row.stackSize, allowSurplus: row.allowSurplus, sortOrder, isArchived: false },
          });
        }
      }

      const next = await tx.building.update({
        where: { id },
        data: {
          name,
          description,
          ...(x !== undefined ? { x } : {}),
          ...(y !== undefined ? { y } : {}),
          ...(z !== undefined ? { z } : {}),
          status,
          ...(schematic !== undefined ? { schematicPath: schematic?.pathname ?? null, schematicSize: schematic?.size ?? null, schematicContentType: schematic?.contentType ?? null } : {}),
          ...(own(body, "schematicFileName") ? { schematicFileName: typeof body.schematicFileName === "string" ? body.schematicFileName.slice(0, 255) : null } : {}),
          ...(screenshot !== undefined ? { screenshotPath: screenshot?.pathname ?? null, screenshotSize: screenshot?.size ?? null, legacyScreenshotDataUrl: null } : {}),
          ...(own(body, "materialsFileName") ? { materialsFileName: typeof body.materialsFileName === "string" ? body.materialsFileName.slice(0, 255) : null } : {}),
          ...(ownerId !== undefined ? { ownerId } : {}),
          ...(responsibleId !== undefined ? { responsibleId } : {}),
          version: { increment: 1 },
        },
        select: { id: true, name: true, status: true, version: true, responsibleId: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "BUILDING_UPDATED",
          entityType: "Building",
          entityId: id,
          metadata: { version: next.version, materialsChanged: Boolean(materials) },
        },
      });
      if (current.responsibleId !== next.responsibleId && next.responsibleId) {
        await createUserNotifications(tx, {
          recipientIds: [next.responsibleId],
          actorId: actor.id,
          kind: "BUILDING_ASSIGNED",
          buildingId: id,
          payload: { buildingName: next.name },
        });
      }
      if (current.status !== next.status) {
        const contributions = await tx.materialContribution.findMany({ where: { material: { buildingId: id } }, select: { userId: true } });
        await createUserNotifications(tx, {
          recipientIds: [current.ownerId, current.responsibleId, ...contributions.map((entry) => entry.userId)],
          actorId: actor.id,
          kind: "BUILDING_STATUS_CHANGED",
          buildingId: id,
          payload: { buildingName: next.name, previousStatus: current.status, status: next.status },
        });
      }
      return next;
    }, { isolationLevel: "Serializable" });

    return NextResponse.json({ building: updated });
  } catch (error) {
    if (error instanceof UpdateError) return fail(error.message, error.status, error.details);
    if (typeof error === "object" && error !== null && "code" in error && String(error.code) === "P2034") return fail("Карточку изменили параллельно. Обновите её и повторите правку.", 409);
    return fail("Не удалось сохранить постройку", 500);
  }
}
