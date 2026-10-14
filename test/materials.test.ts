import assert from "node:assert/strict";
import test from "node:test";
import {
  breakdownMaterial,
  DEFAULT_STACK_SIZE,
  integerPercentComplete,
  MAX_MATERIALS_TEXT_BYTES,
  parseMaterials,
} from "../lib/materials.ts";

test("парсер принимает корректную таблицу и добавляет размер стака", () => {
  const result = parseMaterials(
    "| Item | Total | Missing | Available |\n| --- | --- | --- | --- |\n| Кирпичи | 4 974 | 4 974 | 0 |",
  );

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows, [
    {
      item: "Кирпичи",
      total: 4974,
      missing: 4974,
      available: 0,
      stackSize: DEFAULT_STACK_SIZE,
    },
  ]);
});

test("парсер принимает локализованный заголовок и таблицу без внешних pipe", () => {
  const result = parseMaterials(
    "Предмет | Всего | Не хватает | В наличии\n--- | --- | --- | ---\nКамень | 64 | 16 | 48",
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0]?.item, "Камень");
  assert.deepEqual(result.rows[0], {
    item: "Камень",
    total: 64,
    missing: 16,
    available: 48,
    stackSize: DEFAULT_STACK_SIZE,
  });
});

test("парсер возвращает ошибки строк и не теряет корректные строки", () => {
  const result = parseMaterials(
    "| Камень | -1 | 1 | 0 |\n| Земля | много | 1 | 0 |\n| Стекло | 10 | 2 | 8 |",
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.item, "Стекло");
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0]?.line, 1);
  assert.deepEqual(result.errors[0]?.columns, ["total"]);
  assert.equal(result.errors[1]?.line, 2);
  assert.match(result.errors[1]?.message ?? "", /total/);
});

test("парсер диагностирует malformed rows и пустые значения", () => {
  const result = parseMaterials("| Камень | 1 | 0 |\n| | 1 | 0 | 1 |");

  assert.equal(result.rows.length, 0);
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0]?.code, "malformed-row");
  assert.equal(result.errors[1]?.code, "invalid-item");
});

test("парсер диагностирует количество за пределом PostgreSQL INTEGER", () => {
  const result = parseMaterials("| Камень | 2147483648 | 0 | 0 |");
  assert.equal(result.rows.length, 0);
  assert.equal(result.errors[0]?.code, "invalid-number");
  assert.match(result.errors[0]?.message ?? "", /предел хранения/);
});

test("нормализация названия схлопывает пробелы и приводит ё к е", async () => {
  const { normalizeMaterialName } = await import("../lib/materials.ts");
  assert.equal(normalizeMaterialName("  ДЁРН   блок  "), "дерн блок");
});

test("парсер ограничивает размер входного текста в 2 MiB", () => {
  const result = parseMaterials("x".repeat(MAX_MATERIALS_TEXT_BYTES + 1));

  assert.deepEqual(result.rows, []);
  assert.equal(result.errors[0]?.code, "too-large");
  assert.equal(result.errors[0]?.line, 0);
});

test("раскладка 64-stack считает шулькеры, стаки, остаток и слоты целыми", () => {
  assert.deepEqual(breakdownMaterial(81, 64), {
    quantity: 81,
    stackSize: 64,
    fullShulkers: 0,
    fullStacks: 1,
    looseItems: 17,
    occupiedSlots: 2,
  });
  assert.deepEqual(breakdownMaterial(2544, 64), {
    quantity: 2544,
    stackSize: 64,
    fullShulkers: 1,
    fullStacks: 12,
    looseItems: 48,
    occupiedSlots: 40,
  });
});

test("раскладка поддерживает 16-stack, 1-stack и custom stack sizes", () => {
  assert.deepEqual(breakdownMaterial(28, 16), {
    quantity: 28,
    stackSize: 16,
    fullShulkers: 0,
    fullStacks: 1,
    looseItems: 12,
    occupiedSlots: 2,
  });
  assert.deepEqual(breakdownMaterial(28, 1), {
    quantity: 28,
    stackSize: 1,
    fullShulkers: 1,
    fullStacks: 1,
    looseItems: 0,
    occupiedSlots: 28,
  });
  assert.deepEqual(breakdownMaterial(10, 5), {
    quantity: 10,
    stackSize: 5,
    fullShulkers: 0,
    fullStacks: 2,
    looseItems: 0,
    occupiedSlots: 2,
  });
});

test("раскладка отклоняет дробные, отрицательные и небезопасные значения", () => {
  assert.throws(() => breakdownMaterial(-1), /non-negative safe integer/);
  assert.throws(() => breakdownMaterial(1.5), /non-negative safe integer/);
  assert.throws(() => breakdownMaterial(Number.MAX_SAFE_INTEGER + 1), /non-negative safe integer/);
  assert.throws(() => breakdownMaterial(1, 0), /positive safe integer/);
  assert.throws(() => breakdownMaterial(1, 1.5), /positive safe integer/);
});

test("процент использует целочисленную арифметику для больших объёмов", () => {
  assert.equal(integerPercentComplete(2_000_000_000, 2_147_483_647), 93);
  assert.equal(integerPercentComplete(300, 100), 100);
  assert.equal(integerPercentComplete(0, 0), 100);
});
