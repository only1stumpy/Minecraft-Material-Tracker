import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import test from "node:test";
import {
  MAX_COMPRESSED_BYTES,
  MAX_DECOMPRESSED_BYTES,
  MAX_NBT_DEPTH,
  NbtValidationError,
  validateSchematic,
} from "../lib/nbt.ts";

const u16 = (value: number) => Buffer.from([(value >>> 8) & 0xff, value & 0xff]);
const i32 = (value: number) => {
  const output = Buffer.alloc(4);
  output.writeInt32BE(value);
  return output;
};
const namedInt = (name: string, value: number) =>
  Buffer.concat([Buffer.from([3]), u16(Buffer.byteLength(name)), Buffer.from(name), i32(value)]);

const compound = (name: string, children: Buffer[] = []) =>
  Buffer.concat([
    Buffer.from([10]),
    u16(Buffer.byteLength(name)),
    Buffer.from(name),
    ...children,
    Buffer.from([0]),
  ]);

const nestedCompounds = (depth: number): Buffer => {
  let payload = Buffer.from([0]);
  for (let index = 0; index < depth; index += 1) {
    payload = Buffer.concat([Buffer.from([10, 0, 1, 120]), payload, Buffer.from([0])]);
  }
  return Buffer.concat([Buffer.from([10, 0, 0]), payload]);
};

const expectCode = (action: () => unknown, code: NbtValidationError["code"]) => {
  assert.throws(action, (error: unknown) => error instanceof NbtValidationError && error.code === code);
};

test("accepts raw and gzip NBT for both schematic extensions", () => {
  const raw = compound("Schematic", [namedInt("Width", 3)]);

  for (const extension of [".litematic", ".schem"]) {
    const rawResult = validateSchematic(raw, extension);
    assert.equal(rawResult.ok, true);
    assert.equal(rawResult.compressed, false);

    const gzipResult = validateSchematic(gzipSync(raw), extension);
    assert.equal(gzipResult.ok, true);
    assert.equal(gzipResult.compressed, true);
  }
});

test("rejects unsupported extensions and malformed gzip", () => {
  const raw = compound("Schematic");
  expectCode(() => validateSchematic(raw, ".nbt"), "UNSUPPORTED_EXTENSION");
  expectCode(() => validateSchematic(Buffer.from([0x1f, 0x8b, 0x08]), ".schem"), "INVALID_GZIP");

  const corrupt = gzipSync(raw);
  corrupt[corrupt.length - 1] ^= 0xff;
  expectCode(() => validateSchematic(corrupt, ".litematic"), "INVALID_GZIP");
  expectCode(() => validateSchematic(Buffer.concat([gzipSync(raw), Buffer.from([0])]), ".schem"), "INVALID_GZIP");
});

test("rejects truncation, invalid tags, and trailing bytes", () => {
  const raw = compound("Schematic", [namedInt("Width", 3)]);
  expectCode(() => validateSchematic(raw.subarray(0, raw.length - 1), ".litematic"), "INVALID_NBT");
  expectCode(() => validateSchematic(Buffer.from([10, 0, 0, 13]), ".litematic"), "INVALID_NBT");
  expectCode(() => validateSchematic(Buffer.concat([raw, Buffer.from([0])]), ".litematic"), "INVALID_NBT");
});

test("rejects oversized input and nesting beyond the explicit limit", () => {
  expectCode(() => validateSchematic(new Uint8Array(MAX_COMPRESSED_BYTES + 1), ".schem"), "INPUT_TOO_LARGE");
  expectCode(() => validateSchematic(gzipSync(Buffer.alloc(MAX_DECOMPRESSED_BYTES + 1)), ".schem"), "DECOMPRESSED_TOO_LARGE");
  expectCode(() => validateSchematic(nestedCompounds(MAX_NBT_DEPTH + 1), ".schem"), "INVALID_NBT");
  assert.equal(validateSchematic(nestedCompounds(MAX_NBT_DEPTH), ".schem").ok, true);
});
