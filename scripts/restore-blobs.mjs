import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { get, put } from "@vercel/blob";
import {
  assertSnapshotFile,
  assertMatchingBlobDigest,
  digestBlobStream,
  readManifest,
} from "./blob-snapshot.mjs";

function tokenFromEnvironment() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN обязателен");
  return token;
}

async function assertSnapshotDirectory(snapshotArgument) {
  if (typeof snapshotArgument !== "string" || snapshotArgument.trim() === "") throw new Error("Укажите путь snapshot");
  const snapshotDirectory = resolve(snapshotArgument);
  const snapshotStat = await lstat(snapshotDirectory);
  if (!snapshotStat.isDirectory() || (snapshotStat.mode & 0o777) !== 0o700) {
    throw new Error("Snapshot должен быть закрытым каталогом");
  }
  const blobsStat = await lstat(resolve(snapshotDirectory, "blobs"));
  if (!blobsStat.isDirectory() || (blobsStat.mode & 0o777) !== 0o700) {
    throw new Error("Каталог blobs должен быть закрытой папкой");
  }
  return snapshotDirectory;
}

async function compareWithExisting(pathname, expected, existing) {
  if (!existing || existing.statusCode !== 200 || !existing.stream) {
    throw new Error(`Blob недоступен для проверки: ${pathname}`);
  }
  const digest = await digestBlobStream(existing.stream, expected.size);
  assertMatchingBlobDigest({ ...expected, pathname }, digest);
  return digest;
}

async function restoreEntry(entry, snapshotDirectory, token) {
  const source = await assertSnapshotFile(snapshotDirectory, entry.pathname);
  if (source.size !== entry.size) throw new Error(`Размер файла snapshot не совпал: ${entry.pathname}`);

  const existing = await get(entry.pathname, { access: "private", token, useCache: false });
  if (existing) {
    await compareWithExisting(entry.pathname, entry, existing);
    return "existing";
  }

  const sourceStream = createReadStream(source.filePath);
  try {
    await put(entry.pathname, sourceStream, {
      access: "private",
      allowOverwrite: false,
      contentType: entry.contentType,
      token,
    });
  } catch (error) {
    sourceStream.destroy();
    // Another operator may have restored this pathname between get and put.
    const raced = await get(entry.pathname, { access: "private", token, useCache: false });
    if (!raced) throw error;
    await compareWithExisting(entry.pathname, entry, raced);
    return "existing";
  } finally {
    if (!sourceStream.destroyed) sourceStream.destroy();
  }

  const uploaded = await get(entry.pathname, { access: "private", token, useCache: false });
  await compareWithExisting(entry.pathname, entry, uploaded);
  return "uploaded";
}

export async function restoreBlobs(snapshotArgument) {
  const token = tokenFromEnvironment();
  const snapshotDirectory = await assertSnapshotDirectory(snapshotArgument);
  const manifest = await readManifest(snapshotDirectory);
  let uploaded = 0;
  let existing = 0;
  for (const entry of manifest.blobs) {
    const result = await restoreEntry(entry, snapshotDirectory, token);
    if (result === "uploaded") uploaded += 1;
    else existing += 1;
  }
  return { snapshotDirectory, uploaded, existing, count: manifest.blobs.length };
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  restoreBlobs(process.argv[2])
    .then(({ snapshotDirectory, uploaded, existing }) => console.log(`Восстановление Blob завершено: ${snapshotDirectory} (загружено ${uploaded}, уже были ${existing})`))
    .catch(() => {
      console.error("Restore Vercel Blob не завершён");
      process.exitCode = 1;
    });
}
