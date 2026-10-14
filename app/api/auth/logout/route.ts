import { NextResponse } from "next/server";
import { destroyCurrentSession } from "@/lib/auth";
import { validateSameOrigin } from "@/lib/security";

export async function POST(request: Request) {
  if (!validateSameOrigin(request)) return NextResponse.json({ error: "Недопустимый запрос" }, { status: 403 });
  await destroyCurrentSession();
  return NextResponse.json({ ok: true });
}
