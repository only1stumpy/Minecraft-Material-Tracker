import assert from "node:assert/strict";
import test from "node:test";
import { parseMaterials } from "../lib/materials.ts";

test("парсер принимает корректные целые значения", () => {
  const rows = parseMaterials("| Кирпичи | 4974 | 4974 | 0 |");
  assert.deepEqual(rows, [{ item: "Кирпичи", total: 4974, missing: 4974, available: 0 }]);
});

test("парсер отвергает отрицательные и нечисловые количества", () => {
  assert.deepEqual(parseMaterials("| Камень | -1 | -1 | 0 |\n| Земля | много | 1 | 0 |"), []);
});
