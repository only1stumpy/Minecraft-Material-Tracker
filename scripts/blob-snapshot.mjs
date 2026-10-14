import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, lstat, readFile } from "node:fs/promises";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { relative, resolve, sep } from "node:path";

export const SNAPSHOT_VERSION = 1;

export function safeBlobPathname(pathname) {
  if (typeof pathname !== "string" || pathname.length === 0 || pathname.length > 4096) return false;
  if (pathname.startsWith("/") || pathname.includes("\\") || pathname.includes("\0")) return false;

  const parts = pathname.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}

export function assertSafeBlobPathname(pathname) {
  if (!safeBlobPathname(pathname)) {
    throw new Error(`Небезопасный pathname Blob: ${typeof pathname === "string" ? pathname : "<invalid>"}`);
  }
}

export function snapshotBlobPath(snapshotDirectory, pathname) {
  assertSafeBlobPathname(pathname);
  const blobsDirectory = resolve(snapshotDirectory, "blobs");
  const filePath = resolve(blobsDirectory, ...pathname.split("/"));
  const relativePath = relative(blobsDirectory, filePath);
  if (relativePath === "" || relativePath.startsWith(`..${sep}`) || relativePath === "..") {
    throw new Error(`Путь Blob выходит за пределы snapshot: ${pathname}`);
  }
  return filePath;
}

function isValidIsoDate(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value));
}

function assertManifestEntry(entry, index, seen) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`Некорректная запись manifest под индексом ${index}`);
  }

  const record = /** @type {Record<string, unknown>} */ (entry);
  const pathname = record.pathname;
  if (!safeBlobPathname(pathname)) {
    throw new Error(`Некорректный pathname в manifest под индексом ${index}`);
  }
  if (seen.has(pathname)) throw new Error(`Дублирующийся pathname в manifest: ${pathname}`);
  seen.add(pathname);

  if (!Number.isSafeInteger(record.size) || record.size < 0) {
    throw new Error(`Некорректный размер в manifest для ${pathname}`);
  }
  if (typeof record.contentType !== "string" || record.contentType.length === 0) {
    throw new Error(`Некорректный contentType в manifest для ${pathname}`);
  }
  if (!isValidIsoDate(record.uploadedAt)) {
    throw new Error(`Некорректная дата загрузки в manifest для ${pathname}`);
  }
  if (typeof record.etag !== "string" || record.etag.length === 0) {
    throw new Error(`Некорректный etag в manifest для ${pathname}`);
  }
  if (typeof record.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(record.sha256)) {
    throw new Error(`Некорректный sha256 в manifest для ${pathname}`);
  }
}

export function validateManifest(manifest) {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Manifest должен быть JSON-объектом");
  }

  const record = /** @type {Record<string, unknown>} */ (manifest);
  if (record.version !== SNAPSHOT_VERSION) throw new Error("Неподдерживаемая версия manifest");
  if (!isValidIsoDate(record.createdAt)) throw new Error("Некорректная дата создания manifest");
  if (!Array.isArray(record.blobs)) throw new Error("Поле blobs в manifest должно быть массивом");

  const seen = new Set();
  record.blobs.forEach((entry, index) => assertManifestEntry(entry, index, seen));
  return /** @type {{version: 1, createdAt: string, blobs: Array<{pathname: string, size: number, contentType: string, uploadedAt: string, etag: string, sha256: string}>}} */ (record);
}

export function createManifest(blobs, createdAt = new Date().toISOString()) {
  const manifest = {
    version: SNAPSHOT_VERSION,
    createdAt,
    blobs: [...blobs].sort((left, right) => left.pathname.localeCompare(right.pathname)),
  };
  validateManifest(manifest);
  return manifest;
}

export function assertMatchingBlobDigest(expected, actual) {
  if (actual.size !== expected.size || actual.sha256 !== expected.sha256) {
    throw new Error(`Существующий Blob отличается: ${expected.pathname}`);
  }
  return true;
}

function digestTransform(expectedSize) {
  let size = 0;
  const hash = createHash("sha256");
  const transform = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      hash.update(buffer);
      callback(null, buffer);
    },
    flush(callback) {
      if (expectedSize !== undefined && size !== expectedSize) {
        callback(new Error(`Размер Blob не совпал: ожидалось ${expectedSize}, получено ${size}`));
        return;
      }
      callback();
    },
  });
  return { transform, result: () => ({ size, sha256: hash.digest("hex") }) };
}

export async function digestBlobStream(stream, expectedSize) {
  const { transform, result } = digestTransform(expectedSize);
  const sink = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  await pipeline(Readable.fromWeb(stream), transform, sink);
  return result();
}

export async function writeBlobStream(stream, destination, expectedSize) {
  const { transform, result } = digestTransform(expectedSize);
  const output = createWriteStream(destination, { flags: "wx", mode: 0o600 });
  try {
    await pipeline(Readable.fromWeb(stream), transform, output);
    await chmod(destination, 0o600);
    return result();
  } finally {
    if (!output.destroyed) output.destroy();
  }
}

export async function readManifest(snapshotDirectory) {
  const manifestPath = resolve(snapshotDirectory, "manifest.json");
  const manifestStat = await lstat(manifestPath);
  if (!manifestStat.isFile() || (manifestStat.mode & 0o777) !== 0o600) {
    throw new Error("manifest.json должен быть обычным файлом с правами 0600");
  }
  let parsed;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    throw new Error("manifest.json не удалось прочитать как JSON");
  }
  return validateManifest(parsed);
}

export async function assertSnapshotFile(snapshotDirectory, pathname) {
  assertSafeBlobPathname(pathname);
  const blobsDirectory = resolve(snapshotDirectory, "blobs");
  const relativeParts = pathname.split("/");
  let directory = blobsDirectory;
  const blobsStat = await lstat(blobsDirectory);
  if (!blobsStat.isDirectory() || (blobsStat.mode & 0o777) !== 0o700) {
    throw new Error("Каталог blobs должен быть обычной закрытой папкой");
  }

  for (const part of relativeParts.slice(0, -1)) {
    directory = resolve(directory, part);
    const directoryStat = await lstat(directory);
    if (!directoryStat.isDirectory() || (directoryStat.mode & 0o777) !== 0o700) {
      throw new Error(`Небезопасный каталог snapshot для ${pathname}`);
    }
  }

  const filePath = snapshotBlobPath(snapshotDirectory, pathname);
  const fileStat = await lstat(filePath);
  if (!fileStat.isFile() || (fileStat.mode & 0o777) !== 0o600) {
    throw new Error(`Файл snapshot для ${pathname} должен иметь права 0600`);
  }
  return { filePath, size: fileStat.size };
}
