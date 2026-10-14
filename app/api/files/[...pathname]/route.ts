import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ pathname: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Сначала смените временный пароль" }, { status: 403 });

  const { pathname: segments } = await params;
  const pathname = segments.join("/");
  if (!pathname || pathname.length > 300) return new NextResponse("Not found", { status: 404 });

  const building = await prisma.building.findFirst({
    where: { deletedAt: null, screenshotPath: pathname },
    select: { id: true },
  });
  if (!building) return new NextResponse("Not found", { status: 404 });

  try {
    const blob = await get(pathname, { access: "private" });
    if (!blob || blob.statusCode !== 200 || !blob.stream) return new NextResponse("Not found", { status: 404 });
    if (!blob.blob.contentType?.startsWith("image/")) return new NextResponse("Not found", { status: 404 });
    return new Response(blob.stream, {
      headers: {
        "Content-Type": blob.blob.contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache",
        ETag: blob.blob.etag,
      },
    });
  } catch {
    return new NextResponse("File service unavailable", { status: 503 });
  }
}
