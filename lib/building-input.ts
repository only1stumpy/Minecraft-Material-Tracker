import { MAX_MATERIAL_QUANTITY, normalizeMaterialName } from "./materials.ts";

export type MaterialDraft = Readonly<{
  name: string;
  normalizedName: string;
  requiredQty: number;
  stackSize: number;
  surplusLimit: number;
}>;

export type MaterialDraftError = Readonly<{ index: number; message: string }>;
export type MaterialDraftResult = Readonly<{
  rows: MaterialDraft[];
  errors: MaterialDraftError[];
  duplicates: string[];
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseMaterialDrafts(value: unknown, mergeDuplicates = false): MaterialDraftResult {
  if (!Array.isArray(value)) return { rows: [], errors: [{ index: -1, message: "Материалы должны быть списком" }], duplicates: [] };
  if (value.length > 2000) return { rows: [], errors: [{ index: -1, message: "Не больше 2000 строк материалов за раз" }], duplicates: [] };

  const rows: MaterialDraft[] = [];
  const errors: MaterialDraftError[] = [];
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push({ index, message: "Строка материала должна быть объектом" });
      return;
    }
    const name = typeof item.name === "string" ? item.name.normalize("NFKC").trim() : "";
    const normalizedName = normalizeMaterialName(name);
    if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name) || !normalizedName) {
      errors.push({ index, message: "Название материала должно содержать от 1 до 120 символов" });
      return;
    }
    const requiredQty = item.requiredQty;
    if (typeof requiredQty !== "number" || !Number.isSafeInteger(requiredQty) || requiredQty < 0 || requiredQty > MAX_MATERIAL_QUANTITY) {
      errors.push({ index, message: `Количество должно быть целым числом от 0 до ${MAX_MATERIAL_QUANTITY}` });
      return;
    }
    const stackSize = item.stackSize === undefined ? 64 : item.stackSize;
    if (typeof stackSize !== "number" || !Number.isSafeInteger(stackSize) || stackSize < 1 || stackSize > MAX_MATERIAL_QUANTITY) {
      errors.push({ index, message: "Размер стака должен быть положительным целым числом" });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(item, "allowSurplus")) {
      errors.push({ index, message: "Поле allowSurplus устарело; укажите surplusLimit" });
      return;
    }
    const surplusLimit = item.surplusLimit === undefined ? 0 : item.surplusLimit;
    if (typeof surplusLimit !== "number" || !Number.isSafeInteger(surplusLimit) || surplusLimit < 0 || surplusLimit > MAX_MATERIAL_QUANTITY) {
      errors.push({ index, message: `Лимит избытка должен быть целым числом от 0 до ${MAX_MATERIAL_QUANTITY}` });
      return;
    }
    if (surplusLimit > MAX_MATERIAL_QUANTITY - requiredQty) {
      errors.push({ index, message: "Требуемое количество и лимит избытка вместе превышают предел хранения" });
      return;
    }
    rows.push({ name, normalizedName, requiredQty, stackSize, surplusLimit });
  });

  const totals = new Map<string, MaterialDraft>();
  const duplicates: string[] = [];
  for (const row of rows) {
    const existing = totals.get(row.normalizedName);
    if (!existing) {
      totals.set(row.normalizedName, row);
      continue;
    }
    if (!duplicates.includes(row.normalizedName)) duplicates.push(row.normalizedName);
    if (!mergeDuplicates) continue;
    const combinedQty = existing.requiredQty + row.requiredQty;
    const combinedSurplus = existing.surplusLimit + row.surplusLimit;
    if (combinedQty > MAX_MATERIAL_QUANTITY || combinedSurplus > MAX_MATERIAL_QUANTITY - combinedQty) {
      errors.push({ index: -1, message: `Суммарное количество для «${row.name}» превышает предел хранения` });
      continue;
    }
    totals.set(row.normalizedName, { ...existing, requiredQty: combinedQty, surplusLimit: combinedSurplus });
  }

  if (!mergeDuplicates && duplicates.length > 0) {
    return { rows: [], errors, duplicates, };
  }
  return { rows: Array.from(totals.values()), errors, duplicates };
}
