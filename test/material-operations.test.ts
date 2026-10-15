import assert from "node:assert/strict";
import test from "node:test";
import { materialProgressStatusLabel, summarizeMaterialProgress } from "../lib/material-operations.ts";

test("статусы материалов имеют понятные русские подписи", () => {
  assert.deepEqual(
    ["NOT_STARTED", "IN_PROGRESS", "PARTIAL", "GATHERED"].map((status) => materialProgressStatusLabel(status as Parameters<typeof materialProgressStatusLabel>[0])),
    ["Не начато", "В работе", "Собрано частично", "Собрано полностью"],
  );
});

test("резервации уменьшают доступный остаток только на ещё не собранное количество", () => {
  const result = summarizeMaterialProgress({
    requiredQty: 100,
    gatheredQty: 25,
    surplusLimit: 0,
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
    surplusLimit: 0,
    reservations: [{ quantity: 32, gatheredQty: 8, releasedAt: new Date() }],
  });
  assert.equal(result.freeQty, 48);
  assert.equal(result.reservedQty, 0);
});

test("контролируемый избыток ограничивает свободный объём", () => {
  const result = summarizeMaterialProgress({
    requiredQty: 16,
    gatheredQty: 20,
    surplusLimit: 5,
    reservations: [],
  });
  assert.equal(result.remainingQty, 0);
  assert.equal(result.freeQty, 1);
  assert.equal(result.gatheredPercent, 100);
  assert.equal(result.status, "GATHERED");
});

test("повреждённые счётчики не проходят тихо", () => {
  assert.throws(() => summarizeMaterialProgress({
    requiredQty: -1,
    gatheredQty: 0,
    surplusLimit: 0,
    reservations: [],
  }), RangeError);
  assert.throws(() => summarizeMaterialProgress({
    requiredQty: 10,
    gatheredQty: -1,
    surplusLimit: 0,
    reservations: [],
  }), RangeError);
});

test("сумма резервов вне безопасного диапазона отклоняется", () => {
  assert.throws(() => summarizeMaterialProgress({
    requiredQty: 0,
    gatheredQty: 0,
    surplusLimit: 0,
    reservations: [
      { quantity: Number.MAX_SAFE_INTEGER, gatheredQty: 0, releasedAt: null },
      { quantity: 1, gatheredQty: 0, releasedAt: null },
    ],
  }), RangeError);
});

test("нулевой лимит не разрешает превышение требуемого количества", () => {
  const result = summarizeMaterialProgress({
    requiredQty: 10,
    gatheredQty: 10,
    surplusLimit: 0,
    reservations: [],
  });
  assert.equal(result.freeQty, 0);
});

test("отрицательный, дробный и слишком большой лимиты отклоняются", () => {
  const input = { requiredQty: 10, gatheredQty: 0, reservations: [] } as const;
  assert.throws(() => summarizeMaterialProgress({ ...input, surplusLimit: -1 }), RangeError);
  assert.throws(() => summarizeMaterialProgress({ ...input, surplusLimit: 1.5 }), RangeError);
  assert.throws(() => summarizeMaterialProgress({ ...input, surplusLimit: Number.MAX_SAFE_INTEGER }), RangeError);
  assert.throws(() => summarizeMaterialProgress({ requiredQty: 2_147_483_647, gatheredQty: 0, surplusLimit: 1, reservations: [] }), RangeError);
});
