import { NextResponse } from "next/server";

import { parseMaterials } from "@/lib/materials";
import { prisma } from "@/lib/prisma";

const fileToDataUrl = async (file: File) => {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
};

export async function POST(request: Request) {
  const formData = await request.formData();

  const name = String(formData.get("name") ?? "").trim();
  const x = Number(String(formData.get("x") ?? "").trim());
  const y = Number(String(formData.get("y") ?? "").trim());
  const z = Number(String(formData.get("z") ?? "").trim());

  const schematic = formData.get("schematic") as File | null;
  const materialsFile = formData.get("materials") as File | null;
  const screenshotFile = formData.get("screenshot") as File | null;

  if (
    !name ||
    Number.isNaN(x) ||
    Number.isNaN(y) ||
    Number.isNaN(z) ||
    !schematic ||
    !materialsFile
  ) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const materialsText = await materialsFile.text();
  const materials = parseMaterials(materialsText);
  const screenshotDataUrl = screenshotFile
    ? await fileToDataUrl(screenshotFile)
    : null;

  const record = await prisma.buildings.create({
    data: {
      name,
      x,
      y,
      z,
      schematicFileName: schematic.name,
      materialsFileName: materialsFile.name,
      screenshotDataUrl,
      materials,
    },
  });

  return NextResponse.json({ building: record });
}

export async function GET() {
  const buildings = await prisma.buildings.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ buildings });
}
