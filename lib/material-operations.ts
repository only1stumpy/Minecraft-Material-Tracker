import { integerPercentComplete } from "./materials.ts";

export type ReservationSlice = Readonly<{
  quantity: number;
  gatheredQty: number;
  releasedAt: Date | null;
}>;

export type MaterialProgressInput = Readonly<{
  requiredQty: number;
  gatheredQty: number;
  deliveredQty: number;
  allowSurplus: boolean;
  reservations: readonly ReservationSlice[];
}>;

export type MaterialProgress = Readonly<{
  remainingQty: number;
  reservedQty: number;
  freeQty: number;
  gatheredPercent: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "PARTIAL" | "GATHERED" | "DELIVERED";
}>;

export function summarizeMaterialProgress(input: MaterialProgressInput): MaterialProgress {
  const { requiredQty, gatheredQty, deliveredQty, allowSurplus, reservations } = input;
  for (const [name, value] of Object.entries({ requiredQty, gatheredQty, deliveredQty })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer`);
    }
  }
  if (deliveredQty > gatheredQty) throw new RangeError("deliveredQty cannot exceed gatheredQty");

  const reservedQty = reservations.reduce((sum, reservation) => {
    if (
      !Number.isSafeInteger(reservation.quantity) ||
      !Number.isSafeInteger(reservation.gatheredQty) ||
      reservation.quantity < 0 ||
      reservation.gatheredQty < 0 ||
      reservation.gatheredQty > reservation.quantity
    ) {
      throw new RangeError("reservation quantities are invalid");
    }
    const next = sum + (reservation.releasedAt ? 0 : reservation.quantity - reservation.gatheredQty);
    if (!Number.isSafeInteger(next)) throw new RangeError("reservation total exceeds the safe integer range");
    return next;
  }, 0);

  const remainingQty = Math.max(0, requiredQty - gatheredQty);
  const freeQty = allowSurplus ? Number.MAX_SAFE_INTEGER : Math.max(0, remainingQty - reservedQty);
  const gatheredPercent = integerPercentComplete(gatheredQty, requiredQty);

  let status: MaterialProgress["status"];
  if (requiredQty > 0 && deliveredQty >= requiredQty) status = "DELIVERED";
  else if (requiredQty === 0 || gatheredQty >= requiredQty) status = deliveredQty > 0 ? "DELIVERED" : "GATHERED";
  else if (gatheredQty > 0) status = "PARTIAL";
  else if (reservedQty > 0) status = "IN_PROGRESS";
  else status = "NOT_STARTED";

  return { remainingQty, reservedQty, freeQty, gatheredPercent, status };
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
