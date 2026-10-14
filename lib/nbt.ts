import { gunzipSync } from "node:zlib";

export const MAX_COMPRESSED_BYTES = 50 * 1024 * 1024;
export const MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;
export const MAX_NBT_DEPTH = 128;
export const MAX_NBT_NODES = 100_000;

export type SchematicExtension = ".litematic" | ".schem";

export type NbtValidationErrorCode =
  | "UNSUPPORTED_EXTENSION"
  | "INPUT_TOO_LARGE"
  | "DECOMPRESSED_TOO_LARGE"
  | "INVALID_GZIP"
  | "INVALID_NBT";

export class NbtValidationError extends Error {
  readonly code: NbtValidationErrorCode;

  constructor(code: NbtValidationErrorCode, message: string) {
    super(message);
    this.name = "NbtValidationError";
    this.code = code;
  }
}

export type NbtValidationResult = {
  ok: true;
  extension: SchematicExtension;
  compressed: boolean;
  compressedBytes: number;
  decompressedBytes: number;
  nodes: number;
};

const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_SHORT = 2;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_FLOAT = 5;
const TAG_DOUBLE = 6;
const TAG_BYTE_ARRAY = 7;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;
const TAG_INT_ARRAY = 11;
const TAG_LONG_ARRAY = 12;

type ParsedNbtValue = {
  type: number;
  value: unknown;
  itemType?: number;
};

type ParsedLongArray = {
  length: number;
};

type ParsedNbtRoot = {
  name: string;
  value: ParsedNbtValue;
  nodes: number;
};

const isErrorCode = (error: unknown, code: string) =>
  typeof error === "object" && error !== null && "code" in error && error.code === code;

const invalidNbt = (message: string): never => {
  throw new NbtValidationError("INVALID_NBT", `Invalid NBT: ${message}`);
};

class NbtParser {
  private offset = 0;
  private nodes = 0;
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  parse(): ParsedNbtRoot {
    const rootType = this.readTagType();
    if (rootType !== TAG_COMPOUND) invalidNbt("root tag must be a compound");

    this.consumeNode(0);
    const name = this.readString();
    const value = this.readPayload(rootType, 0);

    if (this.offset !== this.bytes.length) invalidNbt("trailing bytes after root tag");
    return { name, value, nodes: this.nodes };
  }

  private remaining() {
    return this.bytes.length - this.offset;
  }

  private require(length: number) {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.remaining()) {
      invalidNbt("truncated input");
    }
  }

  private readByte() {
    this.require(1);
    return this.bytes[this.offset++];
  }

  private readUnsignedShort() {
    this.require(2);
    const value = (this.bytes[this.offset] << 8) | this.bytes[this.offset + 1];
    this.offset += 2;
    return value;
  }

  private readInt() {
    this.require(4);
    const value =
      (this.bytes[this.offset] << 24) |
      (this.bytes[this.offset + 1] << 16) |
      (this.bytes[this.offset + 2] << 8) |
      this.bytes[this.offset + 3];
    this.offset += 4;
    return value;
  }

  private readTagType() {
    const type = this.readByte();
    if (type > TAG_LONG_ARRAY) invalidNbt(`unsupported tag type ${type}`);
    return type;
  }

  private readString(): string {
    const length = this.readUnsignedShort();
    this.require(length);
    const start = this.offset;
    this.offset += length;
    try {
      return this.decoder.decode(this.bytes.subarray(start, this.offset));
    } catch {
      return invalidNbt("invalid UTF-8 string");
    }
  }

  private consumeNode(depth: number) {
    if (depth > MAX_NBT_DEPTH) invalidNbt("maximum nesting depth exceeded");
    this.nodes += 1;
    if (this.nodes > MAX_NBT_NODES) invalidNbt("maximum node count exceeded");
  }

  private readPayload(type: number, depth: number): ParsedNbtValue {
    switch (type) {
      case TAG_BYTE: {
        const value = this.readByte();
        return { type, value: value > 0x7f ? value - 0x100 : value };
      }
      case TAG_SHORT: {
        const value = this.readUnsignedShort();
        return { type, value: value > 0x7fff ? value - 0x10000 : value };
      }
      case TAG_INT:
        return { type, value: this.readInt() };
      case TAG_FLOAT:
        this.require(4);
        this.offset += 4;
        return { type, value: null };
      case TAG_LONG:
        this.require(8);
        this.offset += 8;
        return { type, value: null };
      case TAG_DOUBLE:
        this.require(8);
        this.offset += 8;
        return { type, value: null };
      case TAG_BYTE_ARRAY: {
        const length = this.readInt();
        this.requireArray(length, 1);
        const start = this.offset;
        this.offset += length;
        return { type, value: this.bytes.slice(start, this.offset) };
      }
      case TAG_STRING:
        return { type, value: this.readString() };
      case TAG_LIST:
        return this.readList(depth);
      case TAG_COMPOUND:
        return { type, value: this.readCompound(depth) };
      case TAG_INT_ARRAY: {
        const length = this.readInt();
        this.requireArray(length, 4);
        const values: number[] = [];
        for (let index = 0; index < length; index += 1) values.push(this.readInt());
        return { type, value: values };
      }
      case TAG_LONG_ARRAY: {
        const length = this.readInt();
        this.requireArray(length, 8);
        this.offset += length * 8;
        return { type, value: { length } satisfies ParsedLongArray };
      }
      default:
        return invalidNbt(`tag type ${type} cannot have a payload`);
    }
  }

  private requireArray(length: number, itemBytes: number) {
    if (length < 0) invalidNbt("negative array length");
    if (length > Math.floor(this.remaining() / itemBytes)) invalidNbt("truncated array");
  }

  private readList(depth: number): ParsedNbtValue {
    const itemType = this.readTagType();
    const length = this.readInt();
    if (length < 0) invalidNbt("negative list length");
    if (itemType === TAG_END && length !== 0) invalidNbt("TAG_End list must be empty");
    if (length > MAX_NBT_NODES - this.nodes) invalidNbt("maximum node count exceeded");

    const values: ParsedNbtValue[] = [];
    for (let index = 0; index < length; index += 1) {
      this.consumeNode(depth + 1);
      values.push(this.readPayload(itemType, depth + 1));
    }
    return { type: TAG_LIST, value: values, itemType };
  }

  private readCompound(depth: number): Map<string, ParsedNbtValue> {
    const values = new Map<string, ParsedNbtValue>();
    while (true) {
      const type = this.readTagType();
      if (type === TAG_END) return values;
      this.consumeNode(depth + 1);
      const name = this.readString();
      if (values.has(name)) invalidNbt(`duplicate compound key ${name}`);
      values.set(name, this.readPayload(type, depth + 1));
    }
  }
}

const normalizeExtension = (extension: string): SchematicExtension => {
  const normalized = extension.trim().toLowerCase();
  if (normalized !== ".litematic" && normalized !== ".schem") {
    throw new NbtValidationError("UNSUPPORTED_EXTENSION", "Only .litematic and .schem files are supported");
  }
  return normalized;
};

type NbtCompound = Map<string, ParsedNbtValue>;

const compoundValue = (tag: ParsedNbtValue | undefined, field: string): NbtCompound => {
  if (!tag) return invalidNbt(`schematic is missing ${field}`);
  if (tag.type !== TAG_COMPOUND || !(tag.value instanceof Map)) {
    return invalidNbt(`${field} must be a compound`);
  }
  return tag.value as NbtCompound;
};

const requiredTag = (compound: NbtCompound, field: string): ParsedNbtValue => {
  const tag = compound.get(field);
  if (!tag) return invalidNbt(`schematic is missing ${field}`);
  return tag;
};

const intValue = (compound: NbtCompound, field: string) => {
  const tag = requiredTag(compound, field);
  if (tag.type !== TAG_INT || typeof tag.value !== "number") {
    return invalidNbt(`${field} must be an Int tag`);
  }
  return tag.value as number;
};

const longArrayValue = (compound: NbtCompound, field: string) => {
  const tag = requiredTag(compound, field);
  if (tag.type !== TAG_LONG_ARRAY || typeof tag.value !== "object" || tag.value === null || !("length" in tag.value)) {
    return invalidNbt(`${field} must be a Long Array tag`);
  }
  const length = (tag.value as ParsedLongArray).length;
  if (!Number.isSafeInteger(length) || length < 0) invalidNbt(`${field} has an invalid length`);
  return length;
};

const optionalIntValue = (compound: NbtCompound, field: string) => {
  const tag = compound.get(field);
  if (!tag) return undefined;
  if (tag.type !== TAG_INT || typeof tag.value !== "number") {
    return invalidNbt(`${field} must be an Int tag`);
  }
  return tag.value as number;
};

const dimensionValue = (compound: NbtCompound, field: string) => {
  const tag = requiredTag(compound, field);
  if (tag.type !== TAG_SHORT || typeof tag.value !== "number") {
    return invalidNbt(`${field} must be a Short tag`);
  }
  const value = (tag.value as number) & 0xffff;
  if (value === 0) invalidNbt(`${field} must be greater than zero`);
  return value;
};

const byteArrayValue = (compound: NbtCompound, field: string) => {
  const tag = requiredTag(compound, field);
  if (tag.type !== TAG_BYTE_ARRAY || !(tag.value instanceof Uint8Array)) {
    return invalidNbt(`${field} must be a Byte Array tag`);
  }
  return tag.value as Uint8Array;
};

const optionalByteArrayValue = (compound: NbtCompound, field: string) => {
  const tag = compound.get(field);
  if (!tag) return undefined;
  if (tag.type !== TAG_BYTE_ARRAY || !(tag.value instanceof Uint8Array)) {
    return invalidNbt(`${field} must be a Byte Array tag`);
  }
  return tag.value as Uint8Array;
};

const stringValue = (compound: NbtCompound, field: string) => {
  const tag = requiredTag(compound, field);
  if (tag.type !== TAG_STRING || typeof tag.value !== "string") {
    return invalidNbt(`${field} must be a String tag`);
  }
  return tag.value as string;
};

const intArrayValue = (compound: NbtCompound, field: string, required = true) => {
  const tag = compound.get(field);
  if (!tag) {
    if (required) invalidNbt(`schematic is missing ${field}`);
    return undefined;
  }
  if (tag.type !== TAG_INT_ARRAY || !Array.isArray(tag.value)) {
    return invalidNbt(`${field} must be an Int Array tag`);
  }
  return tag.value as number[];
};

const listValue = (compound: NbtCompound, field: string, required = true) => {
  const tag = compound.get(field);
  if (!tag) {
    if (required) invalidNbt(`schematic is missing ${field}`);
    return undefined;
  }
  if (tag.type !== TAG_LIST || !Array.isArray(tag.value)) {
    return invalidNbt(`${field} must be a List tag`);
  }
  return tag;
};

const validateListType = (tag: ParsedNbtValue, field: string, itemType: number) => {
  const values = tag.value as ParsedNbtValue[];
  if (values.length > 0 && tag.itemType !== itemType) {
    invalidNbt(`${field} must contain ${itemType} tags`);
  }
  if (values.length === 0 && tag.itemType !== itemType && tag.itemType !== TAG_END) {
    invalidNbt(`${field} must contain ${itemType} tags`);
  }
  for (const value of values) {
    if (value.type !== itemType) invalidNbt(`${field} contains an invalid item`);
  }
  return values;
};

type PaletteInfo = {
  ids: Set<number>;
  maxId: number;
};

const paletteValue = (compound: NbtCompound, field: string, required: boolean): PaletteInfo | undefined => {
  const tag = compound.get(field);
  if (!tag) {
    if (required) invalidNbt(`schematic is missing ${field}`);
    return undefined;
  }
  const palette = compoundValue(tag, field);
  const ids = new Set<number>();
  let maxId = -1;
  for (const [state, entry] of palette) {
    if (state.length === 0) invalidNbt(`${field} contains an empty block state`);
    if (entry.type !== TAG_INT || typeof entry.value !== "number") {
      invalidNbt(`${field} entries must be Int tags`);
    }
    const id = entry.value as number;
    if (id < 0 || ids.has(id)) invalidNbt(`${field} contains an invalid duplicate index`);
    ids.add(id);
    maxId = Math.max(maxId, id);
  }
  if (ids.size === 0) invalidNbt(`${field} must contain at least one entry`);
  return { ids, maxId };
};

const intVectorValue = (compound: NbtCompound, field: string) => {
  const vector = compoundValue(requiredTag(compound, field), field);
  return [intValue(vector, "x"), intValue(vector, "y"), intValue(vector, "z")];
};

const validateLitematicPalette = (region: NbtCompound) => {
  const tag = listValue(region, "BlockStatePalette", true) as ParsedNbtValue;
  const entries = validateListType(tag, "BlockStatePalette", TAG_COMPOUND);
  if (entries.length === 0) invalidNbt("BlockStatePalette must contain at least one entry");

  for (const entry of entries) {
    const state = compoundValue(entry, "BlockStatePalette entry");
    const name = state.get("Name");
    if (!name || name.type !== TAG_STRING || typeof name.value !== "string" || name.value.length === 0) {
      invalidNbt("BlockStatePalette entries must contain a block state Name");
    }
    const properties = state.get("Properties");
    if (properties) compoundValue(properties, "BlockStatePalette Properties");
  }

  return entries.length;
};

const validateLitematicBlockStates = (region: NbtCompound, size: number[], paletteSize: number) => {
  const volume = Math.abs(size[0]) * Math.abs(size[1]) * Math.abs(size[2]);
  if (!Number.isSafeInteger(volume) || volume <= 0) invalidNbt("region Size has an invalid volume");

  // Litematica keeps at least two bits per palette index and then packs the
  // entries tightly across the long array (rather than aligning each entry).
  const bitsPerEntry = Math.max(2, 32 - Math.clz32(paletteSize - 1));
  const totalBits = volume * bitsPerEntry;
  if (!Number.isSafeInteger(totalBits)) invalidNbt("region block data is too large");
  const expectedLongs = Math.ceil(totalBits / 64);
  const actualLongs = longArrayValue(region, "BlockStates");
  if (actualLongs === 0 || actualLongs !== expectedLongs) {
    invalidNbt(`BlockStates must contain exactly ${expectedLongs} packed longs`);
  }
};

const validateLitematicRegion = (region: NbtCompound) => {
  optionalIntValue(region, "DataVersion");
  intVectorValue(region, "Position");
  const size = intVectorValue(region, "Size");
  if (size.some((value) => value === 0)) invalidNbt("region Size components must be non-zero");

  const paletteSize = validateLitematicPalette(region);
  validateLitematicBlockStates(region, size, paletteSize);

  for (const field of ["TileEntities", "Entities", "PendingBlockTicks", "PendingFluidTicks"]) {
    const list = listValue(region, field, false);
    if (list) validateListType(list, field, TAG_COMPOUND);
  }
};

const validateLitematic = (root: ParsedNbtRoot) => {
  const rootCompound = compoundValue(root.value, "root");
  const version = intValue(rootCompound, "Version");
  if (version < 1 || version > 7) invalidNbt(`unsupported Litematica version ${version}`);

  compoundValue(requiredTag(rootCompound, "Metadata"), "Metadata");
  const regions = compoundValue(requiredTag(rootCompound, "Regions"), "Regions");
  if (regions.size === 0) invalidNbt("Regions must contain at least one region");

  optionalIntValue(rootCompound, "MinecraftDataVersion");
  optionalIntValue(rootCompound, "SubVersion");

  for (const [name, regionTag] of regions) {
    const region = compoundValue(regionTag, `Regions.${name}`);
    validateLitematicRegion(region);
  }
};

const validatePaletteMax = (compound: NbtCompound, palette: PaletteInfo | undefined) => {
  const paletteMax = optionalIntValue(compound, "PaletteMax");
  if (paletteMax === undefined) return;
  if (paletteMax < 0 || (palette && palette.maxId >= paletteMax)) {
    invalidNbt("PaletteMax is smaller than a palette index");
  }
};

const validateVarIntArray = (
  data: Uint8Array,
  expectedEntries: number,
  palette: PaletteInfo | undefined,
  field: string,
) => {
  if (expectedEntries > data.length) invalidNbt(`${field} contains too few entries`);

  let offset = 0;
  for (let index = 0; index < expectedEntries; index += 1) {
    let value = 0;
    let shift = 0;
    let terminated = false;
    for (let byteIndex = 0; byteIndex < 5; byteIndex += 1) {
      if (offset >= data.length) invalidNbt(`${field} contains a truncated varint`);
      const byte = data[offset++];
      value += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) {
        terminated = true;
        break;
      }
      shift += 7;
    }
    if (!terminated || value > 0x7fffffff) invalidNbt(`${field} contains an invalid varint`);
    if (palette && !palette.ids.has(value)) {
      invalidNbt(`${field} references an unknown palette index`);
    }
  }
  if (offset !== data.length) invalidNbt(`${field} contains trailing bytes`);
};

const validateBlockEntities = (compound: NbtCompound, field: string) => {
  const tag = listValue(compound, field, false);
  if (!tag) return;
  for (const entity of validateListType(tag, field, TAG_COMPOUND)) {
    const entityCompound = compoundValue(entity, `${field} item`);
    const position = intArrayValue(entityCompound, "Pos") as number[];
    if (position.length !== 3) invalidNbt(`${field} Pos must contain three integers`);
    stringValue(entityCompound, "Id");
  }
};

const validateEntities = (compound: NbtCompound, field: string) => {
  const tag = listValue(compound, field, false);
  if (!tag) return;
  for (const entity of validateListType(tag, field, TAG_COMPOUND)) {
    const entityCompound = compoundValue(entity, `${field} item`);
    const positionTag = listValue(entityCompound, "Pos") as ParsedNbtValue;
    const positions = validateListType(positionTag, "Pos", TAG_DOUBLE);
    if (positions.length !== 3) invalidNbt(`${field} Pos must contain three doubles`);
    stringValue(entityCompound, "Id");
  }
};

const validateOffset = (compound: NbtCompound) => {
  const offset = intArrayValue(compound, "Offset", false);
  if (offset && offset.length !== 3) invalidNbt("Offset must contain three integers");
};

const validateV2Biomes = (schematic: NbtCompound, width: number, length: number) => {
  const data = optionalByteArrayValue(schematic, "BiomeData");
  const paletteTag = schematic.get("BiomePalette");
  const paletteMax = schematic.get("BiomePaletteMax");
  if (!data && !paletteTag && !paletteMax) return;
  if (!data || !paletteTag || !paletteMax) invalidNbt("v2 biome data requires palette and palette max");
  const palette = paletteValue(schematic, "BiomePalette", true);
  const max = intValue(schematic, "BiomePaletteMax");
  if (max < 0 || (palette && palette.maxId >= max)) invalidNbt("BiomePaletteMax is smaller than a palette index");
  validateVarIntArray(data as Uint8Array, width * length, palette, "BiomeData");
};

const validateV2 = (schematic: NbtCompound) => {
  const width = dimensionValue(schematic, "Width");
  const height = dimensionValue(schematic, "Height");
  const length = dimensionValue(schematic, "Length");
  const entries = width * height * length;
  const palette = paletteValue(schematic, "Palette", false);
  validatePaletteMax(schematic, palette);
  validateVarIntArray(byteArrayValue(schematic, "BlockData"), entries, palette, "BlockData");
  const offset = intArrayValue(schematic, "Offset", false);
  if (offset && offset.length !== 3) invalidNbt("Offset must contain three integers");
  const metadata = schematic.get("Metadata");
  if (metadata) compoundValue(metadata, "Metadata");
  validateBlockEntities(schematic, "BlockEntities");
  validateBlockEntities(schematic, "TileEntities");
  validateEntities(schematic, "Entities");
  validateV2Biomes(schematic, width, length);
};

const validateV3Biomes = (schematic: NbtCompound, entries: number) => {
  const tag = schematic.get("Biomes");
  if (!tag) return;
  const biomes = compoundValue(tag, "Biomes");
  const palette = paletteValue(biomes, "Palette", true);
  validateVarIntArray(byteArrayValue(biomes, "Data"), entries, palette, "Biomes.Data");
};

const validateV3 = (schematic: NbtCompound) => {
  const width = dimensionValue(schematic, "Width");
  const height = dimensionValue(schematic, "Height");
  const length = dimensionValue(schematic, "Length");
  const entries = width * height * length;
  const blocks = compoundValue(requiredTag(schematic, "Blocks"), "Blocks");
  const palette = paletteValue(blocks, "Palette", true);
  validateVarIntArray(byteArrayValue(blocks, "Data"), entries, palette, "Blocks.Data");
  validateBlockEntities(blocks, "BlockEntities");
  validateOffset(schematic);
  const metadata = schematic.get("Metadata");
  if (metadata) compoundValue(metadata, "Metadata");
  validateEntities(schematic, "Entities");
  validateV3Biomes(schematic, entries);
};

const validateSpongeSchematic = (root: ParsedNbtRoot) => {
  const rootCompound = compoundValue(root.value, "root");
  const nestedTag = rootCompound.get("Schematic");
  const nested = nestedTag ? compoundValue(nestedTag, "Schematic") : undefined;
  const schematic = nested ?? rootCompound;
  const version = intValue(schematic, "Version");
  intValue(schematic, "DataVersion");

  if (version === 2) {
    validateV2(schematic);
    return;
  }
  if (version === 3) {
    if (!nested) invalidNbt("v3 schematic must be nested under the Schematic compound");
    validateV3(schematic);
    return;
  }
  invalidNbt(`unsupported Sponge schematic version ${version}`);
};

type GunzipInfoResult = {
  buffer: Uint8Array;
  engine: { bytesWritten: number };
};

const decompress = (bytes: Uint8Array) => {
  try {
    const result = gunzipSync(
      bytes,
      { maxOutputLength: MAX_DECOMPRESSED_BYTES, info: true },
    ) as unknown as GunzipInfoResult;
    if (result.engine.bytesWritten !== bytes.byteLength) {
      throw new NbtValidationError("INVALID_GZIP", "Trailing bytes after gzip stream");
    }
    if (result.buffer.byteLength > MAX_DECOMPRESSED_BYTES) {
      throw new NbtValidationError("DECOMPRESSED_TOO_LARGE", "Decompressed NBT payload is too large");
    }
    return new Uint8Array(result.buffer.buffer, result.buffer.byteOffset, result.buffer.byteLength);
  } catch (error) {
    if (error instanceof NbtValidationError) throw error;
    if (isErrorCode(error, "ERR_BUFFER_TOO_LARGE")) {
      throw new NbtValidationError("DECOMPRESSED_TOO_LARGE", "Decompressed NBT payload is too large");
    }
    throw new NbtValidationError("INVALID_GZIP", "Invalid gzip-compressed NBT payload");
  }
};

export function validateSchematic(
  bytes: Uint8Array | ArrayBuffer,
  extension: string,
): NbtValidationResult {
  const normalizedExtension = normalizeExtension(extension);
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (input.byteLength > MAX_COMPRESSED_BYTES) {
    throw new NbtValidationError("INPUT_TOO_LARGE", "Schematic payload is too large");
  }

  const compressed = input.byteLength >= 2 && input[0] === 0x1f && input[1] === 0x8b;
  const payload = compressed ? decompress(input) : input;
  if (payload.byteLength > MAX_DECOMPRESSED_BYTES) {
    throw new NbtValidationError("DECOMPRESSED_TOO_LARGE", "Decompressed NBT payload is too large");
  }

  const parsed = new NbtParser(payload).parse();
  if (normalizedExtension === ".schem") validateSpongeSchematic(parsed);
  if (normalizedExtension === ".litematic") validateLitematic(parsed);
  return {
    ok: true,
    extension: normalizedExtension,
    compressed,
    compressedBytes: input.byteLength,
    decompressedBytes: payload.byteLength,
    nodes: parsed.nodes,
  };
}
