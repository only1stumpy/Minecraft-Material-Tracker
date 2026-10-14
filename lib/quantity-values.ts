/**
 * A non-negative integer that can safely cross the server/client boundary.
 * Small values stay numbers for existing callers; larger values stay decimal
 * strings so neither PostgreSQL nor JavaScript silently rounds them.
 */
export type QuantityValue = number | string;

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const NON_NEGATIVE_INTEGER = /^\d+$/;
const quantityFormatter = new Intl.NumberFormat("ru-RU");

export function quantityToBigInt(value: QuantityValue | bigint): bigint {
  if (typeof value === "bigint") {
    if (value < BigInt(0)) throw new RangeError("quantity must be non-negative");
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError("quantity must be a non-negative safe integer");
    }
    return BigInt(value);
  }

  const normalized = value.trim();
  if (!NON_NEGATIVE_INTEGER.test(normalized)) {
    throw new RangeError("quantity must be a non-negative integer string");
  }
  return BigInt(normalized);
}

export function normalizeQuantity(value: QuantityValue | bigint): QuantityValue {
  const integer = quantityToBigInt(value);
  return integer <= MAX_SAFE_INTEGER_BIGINT ? Number(integer) : integer.toString();
}

export function formatQuantity(value: QuantityValue | bigint): string {
  return quantityFormatter.format(quantityToBigInt(value));
}

export function subtractQuantity(left: QuantityValue | bigint, right: QuantityValue | bigint): QuantityValue {
  const result = quantityToBigInt(left) - quantityToBigInt(right);
  return normalizeQuantity(result < BigInt(0) ? BigInt(0) : result);
}

export function quantityPercentComplete(completed: QuantityValue | bigint, total: QuantityValue | bigint): number {
  const completedInteger = quantityToBigInt(completed);
  const totalInteger = quantityToBigInt(total);
  if (totalInteger === BigInt(0)) return 100;
  if (completedInteger === BigInt(0)) return 0;
  const percent = (completedInteger * BigInt(100)) / totalInteger;
  return Number(percent > BigInt(100) ? BigInt(100) : percent);
}
