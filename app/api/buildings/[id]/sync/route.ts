import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getBuildingSyncCursor, parseBuildingSyncCursor } from "@/lib/building-sync";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (actor.mustChangePassword) return NextResponse.json({ error: "Сначала смените временный пароль" }, { status: 403 });

  const sinceValue = new URL(request.url).searchParams.get("since");
  const since = parseBuildingSyncCursor(sinceValue);
  if (!since) {
    return NextResponse.json({ error: "Некорректный курсор синхронизации" }, { status: 400 });
  }
  const { id } = await params;
  const cursor = await getBuildingSyncCursor(id);
  if (!cursor) return NextResponse.json({ error: "Постройка не найдена" }, { status: 404 });
  const changed = cursor > since;
  return NextResponse.json({ cursor: cursor.toISOString(), changed });
}
