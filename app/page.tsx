import { Prisma } from "@prisma/client";

import BuildingCatalog, {
  type BuildingCatalogBuilding,
  type BuildingCatalogFilters,
} from "@/components/BuildingCatalog";
import { requireReadyUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;
const MAX_PAGE = 1_000_000;

const BUILDING_STATUSES = [
  "DRAFT",
  "PLANNED",
  "COLLECTING",
  "READY",
  "BUILDING",
  "COMPLETED",
  "PAUSED",
  "ARCHIVED",
] as const;

type BuildingStatusValue = (typeof BUILDING_STATUSES)[number];
const SORT_VALUES = ["updated", "created", "name", "progress"] as const;
type SortValue = (typeof SORT_VALUES)[number];

type PageSearchParams = Record<string, string | string[] | undefined>;
type CatalogQueryRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  x: number | null;
  y: number | null;
  z: number | null;
  ownerNickname: string | null;
  screenshotPath: string | null;
  requiredQty: number;
  gatheredQty: number;
  deliveredQty: number;
  participantCount: number;
  isFavorite: boolean;
};

const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] ?? "" : value ?? "";

const hasFlag = (value: string | string[] | undefined) => {
  const normalized = firstParam(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on";
};

const parsePage = (value: string | string[] | undefined) => {
  const parsed = Number.parseInt(firstParam(value), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_PAGE) : 1;
};

const parseStatus = (value: string | string[] | undefined): BuildingStatusValue | "" => {
  const candidate = firstParam(value);
  return (BUILDING_STATUSES as readonly string[]).includes(candidate)
    ? candidate as BuildingStatusValue
    : "";
};

const parseSort = (value: string | string[] | undefined): SortValue => {
  const candidate = firstParam(value);
  return (SORT_VALUES as readonly string[]).includes(candidate)
    ? candidate as SortValue
    : "updated";
};

const buildWhereSql = ({
  q,
  status,
  mine,
  participated,
  favorites,
  hideCompleted,
  userId,
}: {
  q: string;
  status: BuildingStatusValue | "";
  mine: boolean;
  participated: boolean;
  favorites: boolean;
  hideCompleted: boolean;
  userId: string;
}) => {
  const conditions: Prisma.Sql[] = [Prisma.sql`b."deletedAt" IS NULL`];

  if (q) {
    const pattern = `%${q}%`;
    conditions.push(Prisma.sql`(
      b."name" ILIKE ${pattern}
      OR b."description" ILIKE ${pattern}
      OR owner."minecraftNickname" ILIKE ${pattern}
    )`);
  }
  if (status) conditions.push(Prisma.sql`b."status" = ${status}::"BuildingStatus"`);
  if (mine) conditions.push(Prisma.sql`b."ownerId" = ${userId}`);
  if (participated) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1
      FROM "MaterialContribution" participation_filter
      INNER JOIN "Material" participation_material
        ON participation_material."id" = participation_filter."materialId"
      WHERE participation_material."buildingId" = b."id"
        AND participation_material."isArchived" = false
        AND participation_filter."userId" = ${userId}
    )`);
  }
  if (favorites) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "Favorite" favorite_filter
      WHERE favorite_filter."buildingId" = b."id" AND favorite_filter."userId" = ${userId}
    )`);
  }
  if (hideCompleted) conditions.push(Prisma.sql`b."status" <> 'COMPLETED'::"BuildingStatus"`);

  return Prisma.join(conditions, " AND ");
};

const orderBySql = (sort: SortValue) => {
  switch (sort) {
    case "created":
      return Prisma.sql`b."createdAt" DESC, b."id" DESC`;
    case "name":
      return Prisma.sql`LOWER(b."name") ASC, b."id" ASC`;
    case "progress":
      return Prisma.sql`
        CASE
          WHEN COALESCE(material_totals."requiredQty", 0) <= 0 THEN 0
          ELSE LEAST(
            1::numeric,
            COALESCE(material_totals."gatheredQty", 0)::numeric /
              NULLIF(material_totals."requiredQty", 0)
          )
        END DESC,
        latest_activity."lastActivityAt" DESC,
        b."id" DESC
      `;
    default:
      return Prisma.sql`latest_activity."lastActivityAt" DESC, b."id" DESC`;
  }
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const user = await requireReadyUser();
  const params = await searchParams;
  const q = firstParam(params.q).trim().slice(0, 120);
  const status = parseStatus(params.status);
  const sort = parseSort(params.sort);
  const mine = hasFlag(params.mine);
  const participated = hasFlag(params.participated);
  const favorites = hasFlag(params.favorites);
  const hideCompleted = hasFlag(params.hideCompleted);
  const requestedPage = parsePage(params.page);

  const whereSql = buildWhereSql({ q, status, mine, participated, favorites, hideCompleted, userId: user.id });
  const [{ count }] = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT COUNT(*)::integer AS count
    FROM "Building" b
    LEFT JOIN "User" owner ON owner."id" = b."ownerId"
    WHERE ${whereSql}
  `);

  const total = Math.max(0, count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const offset = (page - 1) * PAGE_SIZE;
  const orderBy = orderBySql(sort);

  const rows = await prisma.$queryRaw<CatalogQueryRow[]>(Prisma.sql`
    SELECT
      b."id",
      b."name",
      b."description",
      b."status"::text AS "status",
      b."createdAt",
      latest_activity."lastActivityAt" AS "updatedAt",
      b."x",
      b."y",
      b."z",
      owner."minecraftNickname" AS "ownerNickname",
      b."screenshotPath",
      COALESCE(material_totals."requiredQty", 0)::integer AS "requiredQty",
      COALESCE(material_totals."gatheredQty", 0)::integer AS "gatheredQty",
      COALESCE(material_totals."deliveredQty", 0)::integer AS "deliveredQty",
      COALESCE(material_totals."participantCount", 0)::integer AS "participantCount",
      EXISTS (
        SELECT 1 FROM "Favorite" favorite_row
        WHERE favorite_row."buildingId" = b."id" AND favorite_row."userId" = ${user.id}
      ) AS "isFavorite"
    FROM "Building" b
    LEFT JOIN "User" owner ON owner."id" = b."ownerId"
    LEFT JOIN (
      SELECT activity."buildingId", MAX(activity."lastActivityAt") AS "lastActivityAt"
      FROM (
        SELECT base_building."id" AS "buildingId", base_building."updatedAt" AS "lastActivityAt"
        FROM "Building" base_building
        UNION ALL
        SELECT material."buildingId", material_activity."createdAt"
        FROM "MaterialActivity" material_activity
        INNER JOIN "Material" material ON material."id" = material_activity."materialId"
        UNION ALL
        SELECT comment."buildingId", comment."updatedAt"
        FROM "Comment" comment
        UNION ALL
        SELECT task."buildingId", task."updatedAt"
        FROM "BuildingTask" task
      ) activity
      GROUP BY activity."buildingId"
    ) latest_activity ON latest_activity."buildingId" = b."id"
    LEFT JOIN (
      SELECT required."buildingId", required."requiredQty",
             COALESCE(contribution."gatheredQty", 0) AS "gatheredQty",
             COALESCE(contribution."deliveredQty", 0) AS "deliveredQty",
             COALESCE(contribution."participantCount", 0) AS "participantCount"
      FROM (
        SELECT "buildingId", SUM("requiredQty") AS "requiredQty"
        FROM "Material"
        WHERE "isArchived" = false
        GROUP BY "buildingId"
      ) required
      LEFT JOIN (
        SELECT material."buildingId",
               COALESCE(SUM(contribution."gatheredQty"), 0) AS "gatheredQty",
               COALESCE(SUM(contribution."deliveredQty"), 0) AS "deliveredQty",
               COUNT(DISTINCT contribution."userId") FILTER (WHERE contribution."gatheredQty" > 0) AS "participantCount"
        FROM "Material" material
        LEFT JOIN "MaterialContribution" contribution ON contribution."materialId" = material."id"
        WHERE material."isArchived" = false
        GROUP BY material."buildingId"
      ) contribution ON contribution."buildingId" = required."buildingId"
    ) material_totals ON material_totals."buildingId" = b."id"
    WHERE ${whereSql}
    ORDER BY ${orderBy}
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `);

  const buildings: BuildingCatalogBuilding[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    x: row.x,
    y: row.y,
    z: row.z,
    ownerNickname: row.ownerNickname,
    screenshotPath: row.screenshotPath,
    requiredQty: row.requiredQty,
    gatheredQty: row.gatheredQty,
    deliveredQty: row.deliveredQty,
    participantCount: row.participantCount,
    isFavorite: row.isFavorite,
  }));

  const filters: BuildingCatalogFilters = {
    q,
    status,
    sort,
    mine,
    participated,
    favorites,
    hideCompleted,
    page,
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 py-12">
        <header className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Antville Builder</p>
          <h1 className="text-4xl font-semibold text-white md:text-5xl">Каталог построек Антвилля</h1>
          <p className="max-w-3xl text-base text-slate-300 md:text-lg">Ищите проекты, следите за сбором материалов и подключайтесь к работе жителей города.</p>
        </header>
        <BuildingCatalog buildings={buildings} filters={filters} pageCount={pageCount} total={total} />
      </main>
    </div>
  );
}
