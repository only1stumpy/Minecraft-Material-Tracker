import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { get, list } from "@vercel/blob";
import {
  assertSafeBlobPathname,
  createManifest,
  writeBlobStream,
} from "./blob-snapshot.mjs";

function tokenFromEnvironment() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN обязателен");
  return token;
}

async function pathExists(pathname) {
  try {
    await lstat(pathname);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function listAllPrivateBlobs(token) {
  const blobs = [];
  const seen = new Set();
  let cursor;

  while (true) {
    const page = await list({ limit: 1000, ...(cursor ? { cursor } : {}), token });
    if (!page || !Array.isArray(page.blobs)) throw new Error("Vercel Blob вернул некорректный список");
    for (const blob of page.blobs) {
      assertSafeBlobPathname(blob?.pathname);
      if (seen.has(blob.pathname)) throw new Error(`Дублирующийся pathname Blob: ${blob.pathname}`);
      if (!Number.isSafeInteger(blob.size) || blob.size < 0) {
        throw new Error(`Некорректный размер Blob: ${blob.pathname}`);
      }
      seen.add(blob.pathname);
      blobs.push(blob);
    }
    if (!page.hasMore) return blobs;
    if (typeof page.cursor !== "string" || page.cursor.length === 0) {
      throw new Error("Vercel Blob сообщил о следующей странице без cursor");
    }
    cursor = page.cursor;
  }
}

async function backupBlob(blob, token, temporaryDirectory) {
  const result = await get(blob.pathname, { access: "private", token, useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Blob недоступен: ${blob.pathname}`);
  }
  if (result.blob.pathname !== blob.pathname || result.blob.size !== blob.size) {
    throw new Error(`Blob изменился во время backup: ${blob.pathname}`);
  }

  const destination = resolve(temporaryDirectory, "blobs", ...blob.pathname.split("/"));
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const digest = await writeBlobStream(result.stream, destination, blob.size);
  const uploadedAt = new Date(result.blob.uploadedAt);
  if (!Number.isFinite(uploadedAt.getTime()) || typeof result.blob.contentType !== "string" || !result.blob.contentType) {
    throw new Error(`Vercel Blob вернул некорректные metadata: ${blob.pathname}`);
  }
  return {
    pathname: blob.pathname,
    size: digest.size,
    contentType: result.blob.contentType,
    uploadedAt: uploadedAt.toISOString(),
    etag: result.blob.etag,
    sha256: digest.sha256,
  };
}

export async function backupBlobs(snapshotArgument) {
  if (typeof snapshotArgument !== "string" || snapshotArgument.trim() === "") {
    throw new Error("Укажите путь snapshot");
  }
  const token = tokenFromEnvironment();
  const snapshotDirectory = resolve(snapshotArgument);
  const temporaryDirectory = `${snapshotDirectory}.tmp-${randomUUID()}`;
  if (await pathExists(snapshotDirectory)) throw new Error("Snapshot уже существует");
  if (await pathExists(temporaryDirectory)) throw new Error("Временный каталог snapshot уже существует");

  await mkdir(dirname(snapshotDirectory), { recursive: true, mode: 0o700 });
  await mkdir(resolve(temporaryDirectory, "blobs"), { recursive: true, mode: 0o700 });
  try {
    const listedBlobs = await listAllPrivateBlobs(token);
    const entries = [];
    for (const blob of listedBlobs) entries.push(await backupBlob(blob, token, temporaryDirectory));
    const manifest = createManifest(entries);
    const manifestPath = resolve(temporaryDirectory, "manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await chmod(manifestPath, 0o600);
    await chmod(resolve(temporaryDirectory, "blobs"), 0o700);
    await chmod(temporaryDirectory, 0o700);
    await rename(temporaryDirectory, snapshotDirectory);
    return { snapshotDirectory, count: entries.length };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const snapshotArgument = process.argv[2];
  backupBlobs(snapshotArgument)
    .then(({ snapshotDirectory, count }) => console.log(`Создан snapshot Blob: ${snapshotDirectory} (${count} объектов)`))
    .catch(() => {
      console.error("Backup Vercel Blob не завершён");
      process.exitCode = 1;
    });
}
