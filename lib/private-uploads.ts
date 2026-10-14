import { get } from "@vercel/blob";

import { classifyUpload, getUploadPolicy, validateOwnedUploadPath } from "@/lib/uploads";

export type VerifiedUpload = {
  pathname: string;
  kind: "schematic" | "screenshot" | "materials";
  extension: string;
  contentType: string;
  size: number;
  bytes: Uint8Array;
};

export async function getVerifiedOwnedUpload(pathname: string, userId: string): Promise<VerifiedUpload | null> {
  const owned = validateOwnedUploadPath(pathname, userId);
  if (!owned) return null;

  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const policy = getUploadPolicy(owned.kind);
  if (result.blob.size !== null && result.blob.size > policy.maxBytes) return null;
  const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  const classification = classifyUpload(pathname, result.blob.contentType ?? "", bytes.byteLength);
  if (!classification) return null;

  return {
    pathname,
    kind: owned.kind,
    extension: owned.extension,
    contentType: classification.contentType,
    size: bytes.byteLength,
    bytes,
  };
}

/** Verify a file already referenced by a building revision, regardless of who uploaded it. */
export async function getVerifiedStoredUpload(pathname: string, expectedKind: "schematic" | "screenshot"): Promise<VerifiedUpload | null> {
  if (typeof pathname !== "string" || pathname.length > 300) return null;
  const match = /^building-assets\/[^/]+\/(schematic|screenshot)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.([a-z0-9]+)$/.exec(pathname);
  if (!match || match[1] !== expectedKind) return null;
  const extension = match[2];
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  if (result.blob.size !== null && result.blob.size > getUploadPolicy(expectedKind).maxBytes) return null;
  const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  const classification = classifyUpload(pathname, result.blob.contentType ?? "", bytes.byteLength);
  if (!classification || classification.kind !== expectedKind) return null;
  return {
    pathname,
    kind: expectedKind,
    extension,
    contentType: classification.contentType,
    size: bytes.byteLength,
    bytes,
  };
}
