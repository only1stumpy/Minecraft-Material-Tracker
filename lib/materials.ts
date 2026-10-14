export const MAX_MATERIALS_TEXT_BYTES = 2 * 1024 * 1024;
export const MAX_MATERIAL_QUANTITY = 2_147_483_647;
export const DEFAULT_STACK_SIZE = 64;
const SHULKER_SLOTS = 27;

export type MaterialRow = {
  item: string;
  total: number;
  missing: number;
  available: number;
  stackSize: number;
};

export type MaterialParseError = {
  line: number;
  raw: string;
  code: "malformed-row" | "invalid-item" | "invalid-number" | "too-large";
  message: string;
  columns?: string[];
};

export type ParseMaterialsResult = {
  rows: MaterialRow[];
  errors: MaterialParseError[];
};

/** @deprecated Use ParseMaterialsResult. */
export type MaterialParseResult = ParseMaterialsResult;

export type ParseMaterialsOptions = {
  stackSize?: number;
};

export type MaterialBreakdown = {
  quantity: number;
  stackSize: number;
  fullShulkers: number;
  fullStacks: number;
  looseItems: number;
  occupiedSlots: number;
};

const ITEM_HEADER_TERMS = [
  "item",
  "material",
  "block",
  "предмет",
  "материал",
  "блок",
  "название",
];

const QUANTITY_HEADER_TERMS = [
  "total",
  "count",
  "required",
  "needed",
  "всего",
  "колич",
  "нужно",
  "требуется",
  "missing",
  "недоста",
  "не хватает",
  "available",
  "in stock",
  "доступно",
  "налич",
  "есть",
];

const isHeader = (cells: string[]) => {
  if (cells.length !== 4) return false;
  const normalizedCells = cells.map((cell) =>
    cell.toLocaleLowerCase().replaceAll("ё", "е"),
  );
  const hasItemLabel = ITEM_HEADER_TERMS.some((term) =>
    normalizedCells[0].includes(term),
  );
  const hasQuantityLabel = QUANTITY_HEADER_TERMS.some((term) =>
    normalizedCells.slice(1).some((cell) => cell.includes(term)),
  );
  return hasItemLabel && hasQuantityLabel;
};

const isSeparator = (cells: string[]) =>
  cells.length === 4 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));

const assertNonNegativeSafeInteger = (value: number, name: string) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
};

const assertStackSize = (stackSize: number) => {
  if (
    typeof stackSize !== "number" ||
    !Number.isSafeInteger(stackSize) ||
    stackSize < 1 ||
    stackSize > Math.floor(Number.MAX_SAFE_INTEGER / SHULKER_SLOTS)
  ) {
    throw new RangeError(
      "stackSize must be a positive safe integer that fits in a shulker",
    );
  }
};

const splitPipeRow = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;

  const withoutOuterPipes = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return withoutOuterPipes.split("|").map((cell) => cell.trim());
};

type QuantityResult =
  | { value: number; error?: undefined }
  | { value?: undefined; error: string };

const parseQuantity = (value: string): QuantityResult => {
  const cleaned = value.replace(/\s+/g, "");
  if (!cleaned) return { error: "пустое значение" };
  if (/^-\d+$/.test(cleaned)) return { error: "отрицательное значение" };
  if (!/^\d+$/.test(cleaned)) return { error: "нужно целое число" };

  const parsed = Number(cleaned);
  if (!Number.isSafeInteger(parsed)) return { error: "число вне безопасного диапазона" };
  if (parsed > MAX_MATERIAL_QUANTITY) return { error: "число превышает предел хранения в базе" };
  return { value: parsed };
};

export function normalizeMaterialName(name: string): string {
  return name.normalize("NFKC").trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е").replace(/\s+/g, " ");
}

export function integerPercentComplete(completed: number, total: number): number {
  assertNonNegativeSafeInteger(completed, "completed");
  assertNonNegativeSafeInteger(total, "total");
  if (total === 0) return 100;
  const percent = Number((BigInt(completed) * BigInt(100)) / BigInt(total));
  return Math.min(100, percent);
}

export const parseMaterials = (
  text: string,
  options: ParseMaterialsOptions = {},
): ParseMaterialsResult => {
  if (typeof text !== "string") throw new TypeError("text must be a string");

  const stackSize = options.stackSize ?? DEFAULT_STACK_SIZE;
  assertStackSize(stackSize);

  if (new TextEncoder().encode(text).byteLength > MAX_MATERIALS_TEXT_BYTES) {
    return {
      rows: [],
      errors: [
        {
          line: 0,
          raw: "",
          code: "too-large",
          message: `Текст материалов превышает ${MAX_MATERIALS_TEXT_BYTES} байт`,
        },
      ],
    };
  }

  const rows: MaterialRow[] = [];
  const errors: MaterialParseError[] = [];

  text.split(/\r?\n/).forEach((line, index) => {
    const cells = splitPipeRow(line);
    if (!cells || isSeparator(cells) || isHeader(cells)) return;

    if (cells.length !== 4) {
      errors.push({
        line: index + 1,
        raw: line.trim(),
        code: "malformed-row",
        message: "Строка должна содержать четыре колонки",
      });
      return;
    }

    const [item, total, missing, available] = cells;
    if (!item) {
      errors.push({
        line: index + 1,
        raw: line.trim(),
        code: "invalid-item",
        message: "Название материала не может быть пустым",
      });
      return;
    }

    const parsedTotal = parseQuantity(total);
    const parsedMissing = parseQuantity(missing);
    const parsedAvailable = parseQuantity(available);
    const parsed = [
      ["total", parsedTotal],
      ["missing", parsedMissing],
      ["available", parsedAvailable],
    ] as const;
    const invalid = parsed.filter(([, result]) => "error" in result);
    if (invalid.length > 0) {
      errors.push({
        line: index + 1,
        raw: line.trim(),
        code: "invalid-number",
        columns: invalid.map(([column]) => column),
        message: invalid
          .map(([column, result]) => `${column}: ${result.error}`)
          .join("; "),
      });
      return;
    }

    if (
      "error" in parsedTotal ||
      "error" in parsedMissing ||
      "error" in parsedAvailable
    ) {
      return;
    }

    rows.push({
      item,
      total: parsedTotal.value,
      missing: parsedMissing.value,
      available: parsedAvailable.value,
      stackSize,
    });
  });

  return { rows, errors };
};

export const breakdownMaterial = (
  quantity: number,
  stackSize = DEFAULT_STACK_SIZE,
): MaterialBreakdown => {
  assertNonNegativeSafeInteger(quantity, "quantity");
  assertStackSize(stackSize);

  const shulkerSize = SHULKER_SLOTS * stackSize;
  const fullShulkers = Math.floor(quantity / shulkerSize);
  const afterShulkers = quantity % shulkerSize;
  const fullStacks = Math.floor(afterShulkers / stackSize);
  const looseItems = afterShulkers % stackSize;

  return {
    quantity,
    stackSize,
    fullShulkers,
    fullStacks,
    looseItems,
    occupiedSlots: fullShulkers * SHULKER_SLOTS + fullStacks + (looseItems > 0 ? 1 : 0),
  };
};

/** @deprecated Use breakdownMaterial to keep the shulker/stack arithmetic together. */
export const toStacks = (quantity: number, stackSize = DEFAULT_STACK_SIZE) =>
  breakdownMaterial(quantity, stackSize).fullStacks;

/** @deprecated Use breakdownMaterial to keep the shulker/stack arithmetic together. */
export const toShulkers = (quantity: number, stackSize = DEFAULT_STACK_SIZE) =>
  breakdownMaterial(quantity, stackSize).fullShulkers;
