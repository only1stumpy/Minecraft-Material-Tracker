import assert from "node:assert/strict";
import test from "node:test";
import { summarizeMaterialProgress } from "../lib/material-operations.ts";

test("резервации уменьшают доступный остаток только на ещё не собранное количество", () => {
  const result = summarizeMaterialProgress({
    requiredQty: 100,
    gatheredQty: 25,
    deliveredQty: 10,
    allowSurplus: false,
    reservations: [
      { quantity: 40, gatheredQty: 15, releasedAt: null },
      { quantity: 30, gatheredQty: 0, releasedAt: null },
    ],
  });

  assert.deepEqual(result, {
    remainingQty: 75,
    reservedQty: 55,
    freeQty: 20,
    gatheredPercent: 25,
    status: "PARTIAL",
  });
});

test("освобождённая резервация больше не занимает свободный объём", () => {
  const result = summarizeMaterialProgress({
    requiredQty: 64,
    gatheredQty: 16,
    deliveredQty: 0,
    allowSurplus: false,
    reservations: [{ quantity: 32, gatheredQty: 8, releasedAt: new Date() }],
  });
  assert.equal(result.freeQty, 48);
  assert.equal(result.reservedQty, 0);
});

test("ограниченное превышение даёт 100 процентов, но не увеличивает занятые слоты", () => {
  const result = summarizeMaterialProgress({
    requiredQty: 16,
    gatheredQty: 20,
    deliveredQty: 16,
    allowSurplus: true,
    reservations: [],
  });
  assert.equal(result.remainingQty, 0);
  assert.equal(result.freeQty, Number.MAX_SAFE_INTEGER);
  assert.equal(result.gatheredPercent, 100);
  assert.equal(result.status, "DELIVERED");
});

test("повреждённые счётчики не проходят тихо", () => {
  assert.throws(() => summarizeMaterialProgress({
    requiredQty: -1,
    gatheredQty: 0,
    deliveredQty: 0,
    allowSurplus: false,
    reservations: [],
  }), RangeError);
  assert.throws(() => summarizeMaterialProgress({
    requiredQty: 10,
    gatheredQty: 1,
    deliveredQty: 2,
    allowSurplus: false,
    reservations: [],
  }), RangeError);
});

test("сумма резервов вне безопасного диапазона отклоняется", () => {
  assert.throws(() => summarizeMaterialProgress({
    requiredQty: 0,
    gatheredQty: 0,
    deliveredQty: 0,
    allowSurplus: false,
    reservations: [
      { quantity: Number.MAX_SAFE_INTEGER, gatheredQty: 0, releasedAt: null },
      { quantity: 1, gatheredQty: 0, releasedAt: null },
    ],
  }), RangeError);
});
