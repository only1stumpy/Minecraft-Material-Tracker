import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { parseMaterials } from "@/lib/materials";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { validateSameOrigin } from "@/lib/security";

const MAX_MATERIALS_SIZE = 2 * 1024 * 1024;
const MAX_SCREENSHOT_SIZE = 8 * 1024 * 1024;
const MAX_SCHEMATIC_SIZE = 50 * 1024 * 1024;

async function hasLitematicSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  return (bytes[0] === 0x1f && bytes[1] === 0x8b) || bytes[0] === 0x0a;
}

async function hasImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = String.fromCharCode(...bytes);
  const png = bytes[0] === 0x89 && ascii.slice(1, 4) === "PNG";
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = ascii.slice(0, 4) === "RIFF" && ascii.slice(8, 12) === "WEBP";
  return png || jpeg || webp;
}

const fileToDataUrl = async (file: File) => {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
};

export async function POST(request: Request) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый источник запроса" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Сначала смените временный пароль" }, { status: 403 });
  const formData = await request.formData();

  const name = String(formData.get("name") ?? "").trim();
  const x = Number(String(formData.get("x") ?? "").trim());
  const y = Number(String(formData.get("y") ?? "").trim());
  const z = Number(String(formData.get("z") ?? "").trim());

  const schematic = formData.get("schematic") as File | null;
  const materialsFile = formData.get("materials") as File | null;
  const screenshotFile = formData.get("screenshot") as File | null;
  const screenshot = screenshotFile instanceof File && screenshotFile.size > 0 ? screenshotFile : null;

  if (!name || name.length > 120 || !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) || !(schematic instanceof File) || !(materialsFile instanceof File)) {
    return NextResponse.json({ error: "Проверьте обязательные поля" }, { status: 400 });
  }
  if (!/\.litematic$/i.test(schematic.name) || !/\.(txt|log)$/i.test(materialsFile.name)) return NextResponse.json({ error: "Недопустимый формат файла" }, { status: 400 });
  if (schematic.size > MAX_SCHEMATIC_SIZE || materialsFile.size > MAX_MATERIALS_SIZE || (screenshot && screenshot.size > MAX_SCREENSHOT_SIZE)) return NextResponse.json({ error: "Файл превышает допустимый размер" }, { status: 413 });
  if (!(await hasLitematicSignature(schematic))) return NextResponse.json({ error: "Файл схемы не похож на корректный NBT/Litematica-файл" }, { status: 400 });
  if (screenshot && !(await hasImageSignature(screenshot))) return NextResponse.json({ error: "Поддерживаются изображения PNG, JPEG и WebP" }, { status: 400 });

  const materialsText = await materialsFile.text();
  const materials = parseMaterials(materialsText);
  if (materials.length === 0) return NextResponse.json({ error: "В файле материалов не найдено ни одной корректной позиции" }, { status: 400 });
  const screenshotDataUrl = screenshot
    ? await fileToDataUrl(screenshot)
    : null;

  const record = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const building = await tx.building.create({ data: { name, x, y, z, schematicFileName: schematic.name, materialsFileName: materialsFile.name, screenshotDataUrl, materials, ownerId: user.id } });
    await tx.auditLog.create({ data: { actorId: user.id, action: "BUILDING_CREATED", entityType: "Building", entityId: building.id } });
    return building;
  });

  return NextResponse.json({ building: record });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  const buildings = await prisma.building.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, x: true, y: true, z: true, createdAt: true, updatedAt: true, owner: { select: { minecraftNickname: true } } },
  });

  return NextResponse.json({ buildings });
}
