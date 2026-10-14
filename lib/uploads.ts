export const MAX_SCHEMATIC_SIZE = 50 * 1024 * 1024;
export const MAX_SCREENSHOT_SIZE = 8 * 1024 * 1024;
export const MAX_MATERIALS_SIZE = 2 * 1024 * 1024;

export type UploadKind = "schematic" | "screenshot" | "materials";

export type UploadPolicy = {
  maxBytes: number;
  extensions: readonly string[];
  contentTypes: readonly string[];
};

export const UPLOAD_POLICIES: Record<UploadKind, UploadPolicy> = {
  schematic: {
    maxBytes: MAX_SCHEMATIC_SIZE,
    extensions: ["litematic", "schem"],
    contentTypes: ["application/octet-stream", "application/x-litematic", "application/x-schem"],
  },
  screenshot: {
    maxBytes: MAX_SCREENSHOT_SIZE,
    extensions: ["png", "jpg", "jpeg", "webp"],
    contentTypes: ["image/png", "image/jpeg", "image/webp"],
  },
  materials: {
    maxBytes: MAX_MATERIALS_SIZE,
    extensions: ["txt", "log"],
    contentTypes: ["text/plain"],
  },
};

export type OwnedUploadPath = {
  pathname: string;
  userId: string;
  kind: UploadKind;
  uuid: string;
  extension: string;
};

export type UploadClassification = OwnedUploadPath & {
  contentType: string;
  size: number;
  maxBytes: number;
};

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH_PATTERN = new RegExp(`^building-assets/([^/]+)/(${Object.keys(UPLOAD_POLICIES).join("|")})-(${UUID_PATTERN})\\.([a-z0-9]+)$`);

const isUploadKind = (value: string): value is UploadKind =>
  value === "schematic" || value === "screenshot" || value === "materials";

const normalizeContentType = (contentType: string) => contentType.split(";", 1)[0].trim().toLowerCase();

const policyFor = (kind: UploadKind) => UPLOAD_POLICIES[kind];

const parseUploadPath = (pathname: string): OwnedUploadPath | null => {
  if (typeof pathname !== "string" || pathname.length > 300) return null;
  const match = PATH_PATTERN.exec(pathname);
  if (!match) return null;

  const [, userId, rawKind, uuid, extension] = match;
  if (!isUploadKind(rawKind)) return null;
  const kind = rawKind;
  if (!policyFor(kind).extensions.includes(extension)) return null;
  return { pathname, userId, kind, uuid, extension };
};

export function validateOwnedUploadPath(pathname: string, userId: string): OwnedUploadPath | null {
  if (!userId || userId.includes("/")) return null;
  const parsed = parseUploadPath(pathname);
  return parsed?.userId === userId ? parsed : null;
}

export function classifyUpload(pathname: string, contentType: string, size: number): UploadClassification | null {
  const parsed = parseUploadPath(pathname);
  if (!parsed || typeof contentType !== "string" || !Number.isSafeInteger(size) || size < 0) return null;

  const normalizedContentType = normalizeContentType(contentType);
  const policy = policyFor(parsed.kind);
  if (size > policy.maxBytes || !policy.contentTypes.includes(normalizedContentType)) return null;

  return {
    ...parsed,
    contentType: normalizedContentType,
    size,
    maxBytes: policy.maxBytes,
  };
}

export function getUploadPolicy(kind: UploadKind): UploadPolicy {
  return policyFor(kind);
}
