import { prisma } from "@/lib/prisma";

export const MAX_BUILDING_SYNC_CURSOR_LENGTH = 40;

/** Parse the timestamp cursor accepted by the sync and SSE endpoints. */
export function parseBuildingSyncCursor(value: string | null): Date | null {
  if (!value) return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_BUILDING_SYNC_CURSOR_LENGTH) return null;
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

/**
 * Return the latest server-side change timestamp for a building and its
 * collaborative data. A missing or soft-deleted building returns null.
 */
export async function getBuildingSyncCursor(buildingId: string): Promise<Date | null> {
  const building = await prisma.building.findFirst({
    where: { id: buildingId, deletedAt: null },
    select: { updatedAt: true },
  });
  if (!building) return null;

  const [activity, comment, task] = await Promise.all([
    prisma.materialActivity.findFirst({
      where: { material: { buildingId } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.comment.findFirst({
      where: { buildingId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.buildingTask.findFirst({
      where: { buildingId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  return [building.updatedAt, activity?.createdAt, comment?.updatedAt, task?.updatedAt]
    .filter((value): value is Date => value instanceof Date)
    .reduce((latest, value) => value > latest ? value : latest, building.updatedAt);
}

export function maxBuildingSyncCursor(...cursors: (Date | null)[]): Date | null {
  return cursors
    .filter((value): value is Date => value instanceof Date)
    .reduce<Date | null>((latest, value) => !latest || value > latest ? value : latest, null);
}
