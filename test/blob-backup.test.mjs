import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertSafeBlobPathname,
  assertMatchingBlobDigest,
  createManifest,
  digestBlobStream,
  safeBlobPathname,
  snapshotBlobPath,
  validateManifest,
} from "../scripts/blob-snapshot.mjs";

test("Blob pathname rejects traversal and absolute paths", () => {
  assert.equal(safeBlobPathname("buildings/one.schem"), true);
  assert.equal(safeBlobPathname("../secrets"), false);
  assert.equal(safeBlobPathname("buildings/../../secrets"), false);
  assert.equal(safeBlobPathname("/absolute"), false);
  assert.equal(safeBlobPathname("buildings\\one.schem"), false);
  assert.throws(() => assertSafeBlobPathname("../secrets"), /Небезопасный pathname/);
});

test("manifest validates metadata, duplicate paths and hash", () => {
  const manifest = createManifest([
    {
      pathname: "buildings/one.schem",
      size: 3,
      contentType: "application/octet-stream",
      uploadedAt: "2026-10-14T00:00:00.000Z",
      etag: "etag-1",
      sha256: "a".repeat(64),
    },
  ]);
  assert.equal(validateManifest(manifest).blobs.length, 1);
  assert.throws(() => validateManifest({ ...manifest, blobs: [{ ...manifest.blobs[0], sha256: "bad" }] }), /sha256/);
  assert.throws(() => validateManifest({ ...manifest, blobs: [...manifest.blobs, manifest.blobs[0]] }), /Дублирующийся pathname/);
});

test("snapshot path stays below blobs directory", () => {
  const snapshot = "/tmp/mmt-blob-snapshot";
  assert.equal(snapshotBlobPath(snapshot, "a/b.bin"), join(snapshot, "blobs", "a", "b.bin"));
  assert.throws(() => snapshotBlobPath(snapshot, "../../outside"), /Небезопасный pathname/);
});

test("digestBlobStream compares the downloaded bytes and expected size", async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("abc")); controller.close(); } });
  const digest = await digestBlobStream(stream, 3);
  assert.equal(digest.size, 3);
  assert.equal(digest.sha256, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const wrongSize = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close(); } });
  await assert.rejects(() => digestBlobStream(wrongSize, 2), /Размер Blob не совпал/);
});

test("existing Blob is accepted only when its downloaded digest matches", () => {
  const expected = { pathname: "a.bin", size: 3, sha256: "a".repeat(64) };
  assert.equal(assertMatchingBlobDigest(expected, { size: 3, sha256: "a".repeat(64) }), true);
  assert.throws(() => assertMatchingBlobDigest(expected, { size: 4, sha256: expected.sha256 }), /Существующий Blob отличается/);
  assert.throws(() => assertMatchingBlobDigest(expected, { size: 3, sha256: "b".repeat(64) }), /Существующий Blob отличается/);
});

test("manifest and files can be kept private", async () => {
  const root = await mkdtemp(join(tmpdir(), "mmt-blob-test-"));
  try {
    const blobs = join(root, "blobs");
    await mkdir(blobs, { mode: 0o700 });
    await writeFile(join(root, "manifest.json"), `${JSON.stringify(createManifest([]))}\n`, { mode: 0o600 });
    await chmod(join(root, "manifest.json"), 0o600);
    assert.equal((await stat(join(root, "manifest.json"))).mode & 0o077, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
