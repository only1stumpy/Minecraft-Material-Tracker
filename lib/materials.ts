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

    rows.push({
      item,
      total: numberFromCell(total),
      missing: numberFromCell(missing),
      available: numberFromCell(available),
    });
  }

  return rows;
};

export const toStacks = (total: number) => total / 64;
export const toShulkers = (total: number) => total / (27 * 64);
