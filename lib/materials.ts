export type MaterialRow = {
  item: string;
  total: number;
  missing: number;
  available: number;
};

const numberFromCell = (value: string) => {
  const cleaned = value.replace(/\s+/g, "").trim();
  return cleaned ? Number(cleaned) : 0;
};

export const parseMaterials = (text: string) => {
  if (text.length > 2 * 1024 * 1024) return [];
  const rows: MaterialRow[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim());

  for (const line of lines) {
    if (!line.startsWith("|") || line.includes("Item") || line.includes("---")) {
      continue;
    }

    const parts = line
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length !== 4) {
      continue;
    }

    const [item, total, missing, available] = parts;

    const parsedTotal = numberFromCell(total);
    const parsedMissing = numberFromCell(missing);
    const parsedAvailable = numberFromCell(available);
    if (![parsedTotal, parsedMissing, parsedAvailable].every(Number.isSafeInteger) || parsedTotal < 0 || parsedMissing < 0 || parsedAvailable < 0) continue;
    rows.push({
      item,
      total: parsedTotal,
      missing: parsedMissing,
      available: parsedAvailable,
    });
  }

  return rows;
};

export const toStacks = (total: number) => total / 64;
export const toShulkers = (total: number) => total / (27 * 64);
