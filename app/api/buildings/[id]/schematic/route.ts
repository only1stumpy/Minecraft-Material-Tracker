import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Сначала смените временный пароль" }, { status: 403 });
  const { id } = await params;
  const building = await prisma.building.findFirst({
    where: { id, deletedAt: null },
    select: { schematicPath: true, schematicFileName: true },
  });
  if (!building?.schematicPath) return new NextResponse("Not found", { status: 404 });

  try {
    const blob = await get(building.schematicPath, { access: "private" });
    if (!blob || blob.statusCode !== 200 || !blob.stream) return new NextResponse("Not found", { status: 404 });
    const safeName = (building.schematicFileName ?? "schematic.litematic").replace(/[\r\n"\\]/g, "_");
    return new Response(blob.stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache",
        ETag: blob.blob.etag,
      },
    });
  } catch {
    return new NextResponse("File service unavailable", { status: 503 });
  }
}
