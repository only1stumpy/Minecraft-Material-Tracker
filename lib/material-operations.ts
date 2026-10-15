import { integerPercentComplete, MAX_MATERIAL_QUANTITY } from "./materials.ts";

export type ReservationSlice = Readonly<{
  quantity: number;
  gatheredQty: number;
  releasedAt: Date | null;
}>;

export type MaterialProgressInput = Readonly<{
  requiredQty: number;
  gatheredQty: number;
  surplusLimit: number;
  reservations: readonly ReservationSlice[];
}>;

export type MaterialProgress = Readonly<{
  remainingQty: number;
  reservedQty: number;
  freeQty: number;
  gatheredPercent: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "PARTIAL" | "GATHERED";
}>;

export const MATERIAL_PROGRESS_STATUS_LABELS: Record<MaterialProgress["status"], string> = {
  NOT_STARTED: "Не начато",
  IN_PROGRESS: "В работе",
  PARTIAL: "Собрано частично",
  GATHERED: "Собрано полностью",
};

export function materialProgressStatusLabel(status: MaterialProgress["status"]) {
  return MATERIAL_PROGRESS_STATUS_LABELS[status];
}

export function summarizeMaterialProgress(input: MaterialProgressInput): MaterialProgress {
  const { requiredQty, gatheredQty, surplusLimit, reservations } = input;
  for (const [name, value] of Object.entries({ requiredQty, gatheredQty, surplusLimit })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer`);
    }
  }
  if (requiredQty > MAX_MATERIAL_QUANTITY || surplusLimit > MAX_MATERIAL_QUANTITY
    || surplusLimit > MAX_MATERIAL_QUANTITY - requiredQty) {
    throw new RangeError("requiredQty plus surplusLimit exceeds the storage limit");
  }
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
  const freeQty = Math.max(0, requiredQty + surplusLimit - gatheredQty - reservedQty);
  const gatheredPercent = integerPercentComplete(gatheredQty, requiredQty);

  let status: MaterialProgress["status"];
  if (requiredQty === 0 || gatheredQty >= requiredQty) status = "GATHERED";
  else if (gatheredQty > 0) status = "PARTIAL";
  else if (reservedQty > 0) status = "IN_PROGRESS";
  else status = "NOT_STARTED";

  return { remainingQty, reservedQty, freeQty, gatheredPercent, status };
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
