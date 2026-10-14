import assert from "node:assert/strict";
import test from "node:test";
import {
  formatQuantity,
  normalizeQuantity,
  quantityPercentComplete,
  subtractQuantity,
} from "../lib/quantity-values.ts";

test("агрегаты сохраняют точное значение за пределами JS safe integer", () => {
  const value = "9007199254740993";
  assert.equal(normalizeQuantity(value), value);
  assert.equal(formatQuantity(value), "9\u00a0007\u00a0199\u00a0254\u00a0740\u00a0993");
  assert.equal(subtractQuantity(value, "1"), "9007199254740992");
});

test("малые агрегаты остаются совместимыми с числовым UI", () => {
  assert.equal(normalizeQuantity("2048"), 2048);
  assert.equal(formatQuantity(2048), "2\u00a0048");
  assert.equal(subtractQuantity(10, 14), 0);
});

test("процент прогресса считается без потери точности на больших суммах", () => {
  assert.equal(quantityPercentComplete("9007199254740993", "90071992547409930"), 10);
  assert.equal(quantityPercentComplete("300", "100"), 100);
});
