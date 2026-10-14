import assert from "node:assert/strict";
import test from "node:test";
import { collectParticipantIds } from "../lib/building-metrics.ts";

test("участник считается по активной резервации до первого сбора", () => {
  const participantIds = collectParticipantIds([
    {
      contributions: [{ userId: "gatherer", gatheredQty: 4 }],
      reservations: [{ userId: "reserved", releasedAt: null }],
    },
  ]);

  assert.deepEqual([...participantIds].sort(), ["gatherer", "reserved"]);
});

test("резервация и вклад одного пользователя не дают двух участников", () => {
  const participantIds = collectParticipantIds([
    {
      contributions: [{ userId: "same-user", gatheredQty: 1 }],
      reservations: [{ userId: "same-user", releasedAt: null }],
    },
    {
      contributions: [{ userId: "same-user", gatheredQty: 0 }],
      reservations: [{ userId: "released", releasedAt: new Date() }],
    },
  ]);

  assert.deepEqual([...participantIds], ["same-user"]);
});
