import { NextResponse } from "next/server";
import type { BuildingStatus, Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { parseMaterialDrafts } from "@/lib/building-input";
import { createUserNotifications } from "@/lib/notifications";
import { validateSchematic } from "@/lib/nbt";
import { getVerifiedOwnedUpload } from "@/lib/private-uploads";
import { prisma } from "@/lib/prisma";
import { validateSameOrigin } from "@/lib/security";

const BUILDING_STATUSES = ["DRAFT", "PLANNED", "COLLECTING", "READY", "BUILDING", "COMPLETED", "PAUSED", "ARCHIVED"] as const;
const isBuildingStatus = (value: unknown): value is BuildingStatus =>
  typeof value === "string" && (BUILDING_STATUSES as readonly string[]).includes(value);

type BuildingBody = {
  name?: unknown;
  description?: unknown;
  x?: unknown;
  y?: unknown;
  z?: unknown;
  status?: unknown;
  materials?: unknown;
  mergeDuplicates?: unknown;
  confirmDuplicateBuilding?: unknown;
  schematicPath?: unknown;
  schematicFileName?: unknown;
  screenshotPath?: unknown;
  materialsFileName?: unknown;
  expectedVersion?: unknown;
  responsibleId?: unknown;
  ownerId?: unknown;
};

class InputError extends Error {
  constructor(message: string, readonly status = 400, readonly data?: Record<string, unknown>) { super(message); }
}

const jsonError = (message: string, status: number, extra?: Record<string, unknown>) =>
  NextResponse.json({ error: message, ...extra }, { status });

function parseOptionalCoordinate(value: unknown, label: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < -2_147_483_648 || number > 2_147_483_647) {
    throw new InputError(`${label}: укажите целое число координаты`);
  }
  return number;
}

const matchesImageSignature = (bytes: Uint8Array) => {
  const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return png || jpeg || webp;
};

async function verifyAsset(pathname: unknown, userId: string, kind: "schematic" | "screenshot") {
  if (typeof pathname !== "string") throw new InputError("Указан некорректный путь файла");
  const upload = await getVerifiedOwnedUpload(pathname, userId);
  if (!upload || upload.kind !== kind) throw new InputError("Файл не найден, повреждён или принадлежит другому пользователю", 400);
  if (kind === "schematic") {
    try { validateSchematic(upload.bytes, `.${upload.extension}`); }
    catch { throw new InputError("Схема не прошла проверку структуры NBT", 400); }
  } else if (!matchesImageSignature(upload.bytes)) {
    throw new InputError("Файл не похож на изображение PNG, JPEG или WebP", 400);
  }
  return upload;
}

function parseBuildingFields(body: BuildingBody, isCreate: boolean) {
  const name = typeof body.name === "string" ? body.name.normalize("NFKC").trim() : "";
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) throw new InputError("Название должно содержать от 1 до 120 символов");
  const description = body.description === undefined ? undefined : body.description === null || body.description === "" ? null : body.description;
  if (description !== undefined && description !== null && (typeof description !== "string" || description.length > 10_000)) {
    throw new InputError("Описание не должно превышать 10 000 символов");
  }
  const x = parseOptionalCoordinate(body.x, "X");
  const y = parseOptionalCoordinate(body.y, "Y");
  const z = parseOptionalCoordinate(body.z, "Z");
  if (body.status !== undefined && !isBuildingStatus(body.status)) throw new InputError("Некорректный статус постройки");
  if (isCreate && body.status !== undefined && body.status !== "DRAFT" && body.status !== "PLANNED") {
    throw new InputError("Новая постройка может быть черновиком или запланированной");
  }
  const materials = body.materials === undefined && !isCreate
    ? undefined
    : parseMaterialDrafts(body.materials, body.mergeDuplicates === true);
  if (materials && materials.errors.length > 0) throw new InputError("Исправьте ошибки в материалах", 400, { materialErrors: materials.errors });
  if (materials && materials.duplicates.length > 0 && body.mergeDuplicates !== true) {
    throw new InputError("Повторяющиеся материалы требуют подтверждения объединения", 409, { duplicates: materials.duplicates });
  }
  if (typeof body.materialsFileName === "string" && body.materialsFileName.length > 255) throw new InputError("Имя файла материалов слишком длинное");
  if (body.schematicFileName !== undefined && body.schematicFileName !== null && (typeof body.schematicFileName !== "string" || body.schematicFileName.length > 255)) {
    throw new InputError("Имя файла схемы некорректно");
  }
  return { name, description, x, y, z, status: body.status as BuildingStatus | undefined, materials };
}

export async function POST(request: Request) {
  if (!validateSameOrigin(request)) return jsonError("Недопустимый источник запроса", 403);
  const actor = await getCurrentUser();
  if (!actor) return jsonError("Требуется авторизация", 401);
  if (actor.mustChangePassword) return jsonError("Сначала смените временный пароль", 403);

  const body = await request.json().catch(() => null) as BuildingBody | null;
  if (!body) return jsonError("Некорректное тело запроса", 400);

  try {
    const fields = parseBuildingFields(body, true);
    const schematic = body.schematicPath == null ? null : await verifyAsset(body.schematicPath, actor.id, "schematic");
    const screenshot = body.screenshotPath == null ? null : await verifyAsset(body.screenshotPath, actor.id, "screenshot");
    if (body.schematicPath != null && typeof body.schematicPath !== "string") throw new InputError("Некорректный файл схемы");
    if (body.screenshotPath != null && typeof body.screenshotPath !== "string") throw new InputError("Некорректный скриншот");

    let responsibleId: string | null = null;
    if (body.responsibleId !== undefined && body.responsibleId !== null && body.responsibleId !== "") {
      if (typeof body.responsibleId !== "string") throw new InputError("Некорректный ответственный");
      const responsible = await prisma.user.findFirst({ where: { id: body.responsibleId, isBlocked: false }, select: { id: true } });
      if (!responsible) throw new InputError("Ответственный не найден или заблокирован", 404);
      responsibleId = responsible.id;
    }

    const duplicates = await prisma.building.findMany({
      where: { deletedAt: null, name: { equals: fields.name, mode: "insensitive" } },
      take: 5,
      select: { id: true, name: true },
    });
    if (duplicates.length > 0 && body.confirmDuplicateBuilding !== true) {
      return jsonError("Уже есть постройка с таким названием. Подтвердите создание дубля.", 409, { duplicates });
    }

    const building = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.building.create({
        data: {
          name: fields.name,
          description: fields.description ?? null,
          x: fields.x ?? null,
          y: fields.y ?? null,
          z: fields.z ?? null,
          status: fields.status ?? "DRAFT",
          ownerId: actor.id,
          responsibleId,
          schematicPath: schematic?.pathname ?? null,
          schematicFileName: typeof body.schematicFileName === "string" ? body.schematicFileName.slice(0, 255) : null,
          schematicSize: schematic?.size ?? null,
          schematicContentType: schematic?.contentType ?? null,
          screenshotPath: screenshot?.pathname ?? null,
          screenshotSize: screenshot?.size ?? null,
          materialsFileName: typeof body.materialsFileName === "string" ? body.materialsFileName.slice(0, 255) : null,
          materials: fields.materials ? { create: fields.materials.rows.map((row, sortOrder) => ({ ...row, sortOrder })) } : undefined,
        },
        select: { id: true, name: true, status: true },
      });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "BUILDING_CREATED", entityType: "Building", entityId: created.id } });
      await createUserNotifications(tx, {
        recipientIds: [responsibleId],
        actorId: actor.id,
        kind: "BUILDING_ASSIGNED",
        buildingId: created.id,
        payload: { buildingName: created.name },
      });
      return created;
    });
    return NextResponse.json({ building }, { status: 201 });
  } catch (error) {
    if (error instanceof InputError) return jsonError(error.message, error.status, error.data);
    return jsonError("Не удалось создать постройку", 500);
  }
}

export async function GET() {
  const actor = await getCurrentUser();
  if (!actor) return jsonError("Требуется авторизация", 401);
  const buildings = await prisma.building.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, name: true, status: true, x: true, y: true, z: true, createdAt: true, updatedAt: true, owner: { select: { minecraftNickname: true } } },
  });
  return NextResponse.json({ buildings });
}
