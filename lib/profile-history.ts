export const PROFILE_ACTIVITY_PAGE_SIZE = 20;
export const MAX_PROFILE_ACTIVITY_PAGE = 100_000;

export const PROFILE_ACTIVITY_ORDER = [
  { createdAt: "desc" as const },
  { id: "desc" as const },
];

export function parseProfileActivityPage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, MAX_PROFILE_ACTIVITY_PAGE)
    : 1;
}

export function splitProfileActivityPage<T>(rows: T[], pageSize = PROFILE_ACTIVITY_PAGE_SIZE) {
  return {
    rows: rows.slice(0, pageSize),
    hasNextPage: rows.length > pageSize,
  };
}
