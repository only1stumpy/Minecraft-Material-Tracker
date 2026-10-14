import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { checkMutationRateLimit, validateSameOrigin } from "@/lib/security";
import {
  classifyUpload,
  getUploadPolicy,
  validateOwnedUploadPath,
  type UploadKind,
} from "@/lib/uploads";

type UploadAction = "blob.generate-client-token" | "blob.upload-completed";
type UploadTokenPayload = { userId: string; kind: UploadKind; pathname: string };

const isUploadAction = (value: unknown): value is UploadAction =>
  value === "blob.generate-client-token" || value === "blob.upload-completed";

const parseTokenPayload = (value: string | null | undefined): UploadTokenPayload | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<UploadTokenPayload>;
    if (typeof parsed.userId !== "string" || typeof parsed.kind !== "string" || typeof parsed.pathname !== "string") return null;
    return { userId: parsed.userId, kind: parsed.kind as UploadKind, pathname: parsed.pathname };
  } catch {
    return null;
  }
};

const parseClientKind = (value: string | null): UploadKind | null => {
  if (value === null) return null;
  if (value === "schematic" || value === "screenshot" || value === "materials") return value;
  try {
    const parsed = JSON.parse(value) as { kind?: unknown };
    return parsed && (parsed.kind === "schematic" || parsed.kind === "screenshot" || parsed.kind === "materials")
      ? parsed.kind
      : null;
  } catch {
    return null;
  }
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as (HandleUploadBody & { type?: unknown }) | null;
  const action = body?.type;
  if (!isUploadAction(action)) {
    return NextResponse.json({ error: "Некорректный запрос загрузки" }, { status: 400 });
  }

  let userId: string | null = null;
  if (action === "blob.generate-client-token") {
    if (!validateSameOrigin(request)) {
      return NextResponse.json({ error: "Недопустимый источник запроса" }, { status: 403 });
    }
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    if (user.mustChangePassword) return NextResponse.json({ error: "Сначала смените временный пароль" }, { status: 403 });
    const rateLimit = await checkMutationRateLimit("upload-token", user.id, { limit: 120, windowMs: 60 * 60_000 });
    if (rateLimit) return rateLimit;
    userId = user.id;
  }

  try {
    const jsonResponse = await handleUpload({
      body: body as HandleUploadBody,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!userId) throw new Error("Требуется авторизация");
        const ownedPath = validateOwnedUploadPath(pathname, userId);
        if (!ownedPath) throw new Error("Недопустимый путь файла");
        if (clientPayload !== null && parseClientKind(clientPayload) !== ownedPath.kind) {
          throw new Error("Недопустимый тип загрузки");
        }

        const policy = getUploadPolicy(ownedPath.kind);
        return {
          allowedContentTypes: [...policy.contentTypes],
          maximumSizeInBytes: policy.maxBytes,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ userId, kind: ownedPath.kind, pathname: ownedPath.pathname }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = parseTokenPayload(tokenPayload);
        const ownedPath = payload && validateOwnedUploadPath(blob.pathname, payload.userId);
        // PutBlobResult does not expose the object size. The signed token already
        // enforces maximumSizeInBytes; use an optional runtime size when a newer
        // SDK supplies it, while always rechecking the signed path and MIME type.
        const blobSize = (blob as typeof blob & { size?: unknown }).size;
        const classification = ownedPath && classifyUpload(
          blob.pathname,
          blob.contentType,
          typeof blobSize === "number" ? blobSize : 0,
        );
        if (!payload || !ownedPath || !classification || payload.kind !== ownedPath.kind || payload.pathname !== blob.pathname) {
          throw new Error("Недопустимые параметры завершённой загрузки");
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка загрузки" },
      { status: 400 },
    );
  }
}
