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
const i16 = (value: number) => {
  const output = Buffer.alloc(2);
  output.writeInt16BE(value);
  return output;
};
const i32 = (value: number) => {
  const output = Buffer.alloc(4);
  output.writeInt32BE(value);
  return output;
};

const named = (type: number, name: string, payload: Buffer) =>
  Buffer.concat([Buffer.from([type]), u16(Buffer.byteLength(name)), Buffer.from(name), payload]);
const namedShort = (name: string, value: number) => named(2, name, i16(value));
const namedInt = (name: string, value: number) => named(3, name, i32(value));
const namedString = (name: string, value: string) =>
  named(8, name, Buffer.concat([u16(Buffer.byteLength(value)), Buffer.from(value)]));
const namedByteArray = (name: string, value: Uint8Array) =>
  named(7, name, Buffer.concat([i32(value.byteLength), Buffer.from(value)]));
const namedIntArray = (name: string, values: number[]) =>
  named(11, name, Buffer.concat([i32(values.length), ...values.map(i32)]));
const namedLongArray = (name: string, length: number) =>
  named(12, name, Buffer.concat([i32(length), Buffer.alloc(Math.max(0, length) * 8)]));

const compoundPayload = (children: Buffer[] = []) => Buffer.concat([...children, Buffer.from([0])]);
const namedCompound = (name: string, children: Buffer[] = []) => named(10, name, compoundPayload(children));
const compound = (name: string, children: Buffer[] = []) =>
  Buffer.concat([Buffer.from([10]), u16(Buffer.byteLength(name)), Buffer.from(name), compoundPayload(children)]);
const namedCompoundList = (name: string, entries: Buffer[]) =>
  named(9, name, Buffer.concat([Buffer.from([10]), i32(entries.length), ...entries]));

const litematicVector = (name: string, [x, y, z]: [number, number, number]) =>
  namedCompound(name, [namedInt("x", x), namedInt("y", y), namedInt("z", z)]);
const litematicState = (name = "minecraft:air") =>
  compoundPayload([namedString("Name", name)]);
const litematic = (options: {
  version?: number;
  size?: [number, number, number];
  palette?: string[];
  blockStatesLength?: number;
  metadata?: Buffer;
  regions?: Buffer[];
  regionExtras?: Buffer[];
  rootExtras?: Buffer[];
} = {}) => {
  const version = options.version ?? 7;
  const size = options.size ?? [1, 1, 1];
  const palette = options.palette ?? ["minecraft:air"];
  const volume = Math.abs(size[0]) * Math.abs(size[1]) * Math.abs(size[2]);
  const bitsPerEntry = Math.max(2, 32 - Math.clz32(palette.length - 1));
  const expectedLongs = Math.ceil((volume * bitsPerEntry) / 64);
  const region = namedCompound("Main", [
    namedCompoundList("BlockStatePalette", palette.map((name) => litematicState(name))),
    namedLongArray("BlockStates", options.blockStatesLength ?? expectedLongs),
    litematicVector("Position", [0, 0, 0]),
    litematicVector("Size", size),
    ...(options.regionExtras ?? []),
  ]);
  return compound("", [
    namedInt("Version", version),
    namedInt("MinecraftDataVersion", 3700),
    namedInt("SubVersion", 1),
    options.metadata ?? namedCompound("Metadata"),
    namedCompound("Regions", options.regions ?? [region]),
    ...(options.rootExtras ?? []),
  ]);
};

const validV2 = (options: {
  version?: Buffer;
  dataVersion?: Buffer;
  width?: Buffer;
  height?: Buffer;
  length?: Buffer;
  palette?: Buffer;
  blockData?: Uint8Array;
  extras?: Buffer[];
} = {}) =>
  compound("Schematic", [
    options.version ?? namedInt("Version", 2),
    options.dataVersion ?? namedInt("DataVersion", 3105),
    options.width ?? namedShort("Width", 1),
    options.height ?? namedShort("Height", 1),
    options.length ?? namedShort("Length", 1),
    options.palette ?? namedCompound("Palette", [namedInt("minecraft:air", 0)]),
    namedByteArray("BlockData", options.blockData ?? Buffer.from([0])),
    ...(options.extras ?? []),
  ]);

const validV3 = (options: { blocks?: Buffer; extras?: Buffer[] } = {}) =>
  compound("", [
    namedCompound("Schematic", [
      namedInt("Version", 3),
      namedInt("DataVersion", 3700),
      namedShort("Width", 1),
      namedShort("Height", 1),
      namedShort("Length", 1),
      options.blocks ??
        namedCompound("Blocks", [
          namedCompound("Palette", [namedInt("minecraft:air", 0)]),
          namedByteArray("Data", Buffer.from([0])),
        ]),
      ...(options.extras ?? []),
    ]),
  ]);

const nestedMetadata = (depth: number) => {
  let child = Buffer.concat([Buffer.from([10, 0, 1, 120]), Buffer.from([0])]);
  for (let index = 1; index < depth; index += 1) {
    child = Buffer.concat([Buffer.from([10, 0, 1, 120]), child, Buffer.from([0])]);
  }
  return namedCompound("Metadata", depth > 0 ? [child] : []);
};

const expectCode = (action: () => unknown, code: NbtValidationError["code"]) => {
  assert.throws(action, (error: unknown) => error instanceof NbtValidationError && error.code === code);
};

test("accepts valid Sponge v2/v3 and gzip-compressed schematics", () => {
  for (const raw of [validV2(), validV3()]) {
    const rawResult = validateSchematic(raw, ".schem");
    assert.equal(rawResult.ok, true);
    assert.equal(rawResult.compressed, false);

    const gzipResult = validateSchematic(gzipSync(raw), ".schem");
    assert.equal(gzipResult.ok, true);
    assert.equal(gzipResult.compressed, true);
  }

  for (const version of [1, 4, 5, 6, 7]) {
    const litematicResult = validateSchematic(litematic({ version }), ".litematic");
    assert.equal(litematicResult.ok, true);
  }
  const gzipLitematicResult = validateSchematic(gzipSync(litematic()), ".litematic");
  assert.equal(gzipLitematicResult.compressed, true);
});

test("validates Litematica regions, palettes, and packed long-array sizes", () => {
  assert.equal(validateSchematic(litematic({ size: [33, 1, 1] }), ".litematic").ok, true);
  assert.equal(validateSchematic(litematic({ palette: ["minecraft:air", "minecraft:stone"] }), ".litematic").ok, true);

  expectCode(() => validateSchematic(litematic({ blockStatesLength: 0 }), ".litematic"), "INVALID_NBT");
  expectCode(() => validateSchematic(litematic({ blockStatesLength: 2 }), ".litematic"), "INVALID_NBT");
  expectCode(() => validateSchematic(litematic({ size: [0, 1, 1] }), ".litematic"), "INVALID_NBT");
  assert.equal(validateSchematic(litematic({ size: [1, -1, 1] }), ".litematic").ok, true);
  expectCode(
    () => validateSchematic(litematic({ palette: [], blockStatesLength: 1 }), ".litematic"),
    "INVALID_NBT",
  );
  expectCode(
    () => validateSchematic(litematic({ palette: [""], blockStatesLength: 1 }), ".litematic"),
    "INVALID_NBT",
  );
});

test("rejects empty or malformed Litematica documents", () => {
  expectCode(
    () => validateSchematic(compound("", [namedInt("Version", 7), namedCompound("Metadata"), namedCompound("Regions")]), ".litematic"),
    "INVALID_NBT",
  );
  expectCode(() => validateSchematic(compound("", [namedInt("Version", 8)]), ".litematic"), "INVALID_NBT");
  expectCode(
    () => validateSchematic(compound("", [namedInt("Version", 7), namedInt("Metadata", 1), namedCompound("Regions")]), ".litematic"),
    "INVALID_NBT",
  );
  expectCode(
    () => validateSchematic(
      litematic({
        regions: [namedInt("Main", 1)],
      }),
      ".litematic",
    ),
    "INVALID_NBT",
  );
  expectCode(
    () => validateSchematic(
      litematic({
        regionExtras: [namedString("DataVersion", "3700")],
      }),
      ".litematic",
    ),
    "INVALID_NBT",
  );
});

test("rejects a valid NBT document that is not a Sponge schematic", () => {
  expectCode(() => validateSchematic(compound("Schematic", [namedInt("Width", 1)]), ".schem"), "INVALID_NBT");
  expectCode(
    () => validateSchematic(compound("Schematic", [namedInt("Version", 2), namedInt("DataVersion", 3105)]), ".schem"),
    "INVALID_NBT",
  );
  expectCode(() => validateSchematic(validV2({ version: namedString("Version", "2") }), ".schem"), "INVALID_NBT");
  expectCode(() => validateSchematic(validV2({ width: namedInt("Width", 1) }), ".schem"), "INVALID_NBT");
  expectCode(() => validateSchematic(validV3({ blocks: namedInt("Blocks", 1) }), ".schem"), "INVALID_NBT");
});

test("checks palette references, data length, and version-specific nesting", () => {
  expectCode(
    () => validateSchematic(validV2({ blockData: Buffer.from([1]) }), ".schem"),
    "INVALID_NBT",
  );
  expectCode(
    () => validateSchematic(validV2({ blockData: Buffer.from([0, 0]) }), ".schem"),
    "INVALID_NBT",
  );
  expectCode(
    () => validateSchematic(
      compound("Schematic", [
        namedInt("Version", 3),
        namedInt("DataVersion", 3700),
        namedShort("Width", 1),
        namedShort("Height", 1),
        namedShort("Length", 1),
      ]),
      ".schem",
    ),
    "INVALID_NBT",
  );
  expectCode(
    () => validateSchematic(validV2({ extras: [namedIntArray("Offset", [0, 0])] }), ".schem"),
    "INVALID_NBT",
  );
});

test("rejects unsupported extensions and malformed gzip", () => {
  const raw = validV2();
  expectCode(() => validateSchematic(raw, ".nbt"), "UNSUPPORTED_EXTENSION");
  expectCode(() => validateSchematic(Buffer.from([0x1f, 0x8b, 0x08]), ".schem"), "INVALID_GZIP");

  const corrupt = gzipSync(raw);
  corrupt[corrupt.length - 1] ^= 0xff;
  expectCode(() => validateSchematic(corrupt, ".schem"), "INVALID_GZIP");
  expectCode(() => validateSchematic(Buffer.concat([gzipSync(raw), Buffer.from([0])]), ".schem"), "INVALID_GZIP");
});

test("rejects truncation, invalid tags, and trailing bytes", () => {
  const raw = validV2();
  expectCode(() => validateSchematic(raw.subarray(0, raw.length - 1), ".schem"), "INVALID_NBT");
  expectCode(() => validateSchematic(Buffer.from([10, 0, 0, 13]), ".litematic"), "INVALID_NBT");
  expectCode(() => validateSchematic(Buffer.concat([raw, Buffer.from([0])]), ".schem"), "INVALID_NBT");
});

test("rejects oversized input and nesting beyond the explicit limit", () => {
  expectCode(() => validateSchematic(new Uint8Array(MAX_COMPRESSED_BYTES + 1), ".schem"), "INPUT_TOO_LARGE");
  expectCode(() => validateSchematic(gzipSync(Buffer.alloc(MAX_DECOMPRESSED_BYTES + 1)), ".litematic"), "DECOMPRESSED_TOO_LARGE");
  expectCode(
    () => validateSchematic(litematic({ metadata: nestedMetadata(MAX_NBT_DEPTH + 1) }), ".litematic"),
    "INVALID_NBT",
  );
  assert.equal(validateSchematic(litematic({ metadata: nestedMetadata(MAX_NBT_DEPTH - 4) }), ".litematic").ok, true);
});
