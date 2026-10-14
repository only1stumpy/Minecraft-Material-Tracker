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

  parse() {
    const rootType = this.readTagType();
    if (rootType !== TAG_COMPOUND) invalidNbt("root tag must be a compound");

    this.consumeNode(0);
    this.readString();
    this.readPayload(rootType, 0);

    if (this.offset !== this.bytes.length) invalidNbt("trailing bytes after root tag");
    return this.nodes;
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

  private readString() {
    const length = this.readUnsignedShort();
    this.require(length);
    const start = this.offset;
    this.offset += length;
    try {
      this.decoder.decode(this.bytes.subarray(start, this.offset));
    } catch {
      invalidNbt("invalid UTF-8 string");
    }
  }

  private consumeNode(depth: number) {
    if (depth > MAX_NBT_DEPTH) invalidNbt("maximum nesting depth exceeded");
    this.nodes += 1;
    if (this.nodes > MAX_NBT_NODES) invalidNbt("maximum node count exceeded");
  }

  private readPayload(type: number, depth: number) {
    switch (type) {
      case TAG_BYTE:
        this.require(1);
        this.offset += 1;
        return;
      case TAG_SHORT:
        this.require(2);
        this.offset += 2;
        return;
      case TAG_INT:
      case TAG_FLOAT:
        this.require(4);
        this.offset += 4;
        return;
      case TAG_LONG:
      case TAG_DOUBLE:
        this.require(8);
        this.offset += 8;
        return;
      case TAG_BYTE_ARRAY: {
        const length = this.readInt();
        this.skipArray(length, 1);
        return;
      }
      case TAG_STRING:
        this.readString();
        return;
      case TAG_LIST:
        this.readList(depth);
        return;
      case TAG_COMPOUND:
        this.readCompound(depth);
        return;
      case TAG_INT_ARRAY: {
        const length = this.readInt();
        this.skipArray(length, 4);
        return;
      }
      case TAG_LONG_ARRAY: {
        const length = this.readInt();
        this.skipArray(length, 8);
        return;
      }
      default:
        invalidNbt(`tag type ${type} cannot have a payload`);
    }
  }

  private skipArray(length: number, itemBytes: number) {
    if (length < 0) invalidNbt("negative array length");
    if (length > Math.floor(this.remaining() / itemBytes)) invalidNbt("truncated array");
    this.offset += length * itemBytes;
  }

  private readList(depth: number) {
    const itemType = this.readTagType();
    const length = this.readInt();
    if (length < 0) invalidNbt("negative list length");
    if (itemType === TAG_END && length !== 0) invalidNbt("TAG_End list must be empty");
    if (length > MAX_NBT_NODES - this.nodes) invalidNbt("maximum node count exceeded");

    for (let index = 0; index < length; index += 1) {
      this.consumeNode(depth + 1);
      this.readPayload(itemType, depth + 1);
    }
  }

  private readCompound(depth: number) {
    while (true) {
      const type = this.readTagType();
      if (type === TAG_END) return;
      this.consumeNode(depth + 1);
      this.readString();
      this.readPayload(type, depth + 1);
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

  const nodes = new NbtParser(payload).parse();
  return {
    ok: true,
    extension: normalizedExtension,
    compressed,
    compressedBytes: input.byteLength,
    decompressedBytes: payload.byteLength,
    nodes,
  };
}
