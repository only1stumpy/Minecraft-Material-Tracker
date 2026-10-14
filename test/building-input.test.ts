import assert from "node:assert/strict";
import test from "node:test";
import { parseMaterialDrafts } from "../lib/building-input.ts";

test("валидирует целые количества, название и stack size", () => {
  const result = parseMaterialDrafts([
    { name: "Камень", requiredQty: 64, stackSize: 64 },
    { name: "Палки", requiredQty: -1, stackSize: 64 },
    { name: "", requiredQty: 1 },
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.errors.length, 2);
});

test("дубликаты требуют подтверждения и объединяются только по запросу", () => {
  const rows = [
    { name: "Дёрн", requiredQty: 10, stackSize: 64 },
    { name: "дерн", requiredQty: 5, stackSize: 64 },
  ];
  const blocked = parseMaterialDrafts(rows);
  assert.deepEqual(blocked.rows, []);
  assert.equal(blocked.duplicates.length, 1);

  const merged = parseMaterialDrafts(rows, true);
  assert.equal(merged.rows.length, 1);
  assert.equal(merged.rows[0]?.requiredQty, 15);
});

test("объединение не переполняет PostgreSQL INTEGER", () => {
  const result = parseMaterialDrafts([
    { name: "Камень", requiredQty: 2_147_483_647 },
    { name: "камень", requiredQty: 1 },
  ], true);
  assert.equal(result.errors.length, 1);
  assert.equal(result.rows[0]?.requiredQty, 2_147_483_647);
});
