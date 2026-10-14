import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { canModerateContent } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const MAX_QUERY_LENGTH = 100;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const COMMENT_LIMIT = 30;
const IMPORT_LIMIT = 20;
const MAX_DUPLICATES = 50;
const MAX_DUPLICATES_PER_GROUP = 10;

const parsePage = (value: string | null, fallback: number) => {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parsePageSize = (value: string | null) => {
  if (value === null) return DEFAULT_PAGE_SIZE;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, MAX_PAGE_SIZE);
};

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (!canModerateContent(actor) || actor.mustChangePassword) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q")?.trim() ?? "";
  if (rawQuery.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: `Поисковый запрос не должен превышать ${MAX_QUERY_LENGTH} символов` }, { status: 400 });
  }
  const page = parsePage(url.searchParams.get("page"), 1);
  const pageSize = parsePageSize(url.searchParams.get("pageSize"));
  if (page === null || pageSize === null) {
    return NextResponse.json({ error: "Некорректные параметры пагинации" }, { status: 400 });
  }

  const buildingWhere: Prisma.BuildingWhereInput = rawQuery
    ? {
        OR: [
          { name: { contains: rawQuery, mode: "insensitive" } },
          { description: { contains: rawQuery, mode: "insensitive" } },
          { owner: { minecraftNickname: { contains: rawQuery, mode: "insensitive" } } },
        ],
      }
    : {};
  const commentWhere: Prisma.CommentWhereInput = rawQuery
    ? {
        OR: [
          { body: { contains: rawQuery, mode: "insensitive" } },
          { author: { minecraftNickname: { contains: rawQuery, mode: "insensitive" } } },
          { building: { name: { contains: rawQuery, mode: "insensitive" } } },
        ],
      }
    : {};

  try {
    const duplicateFilter = rawQuery
      ? Prisma.sql`AND (b."name" ILIKE ${"%" + rawQuery + "%"} OR COALESCE(b."description", "") ILIKE ${"%" + rawQuery + "%"} OR COALESCE(u."minecraftNickname", "") ILIKE ${"%" + rawQuery + "%"})`
      : Prisma.empty;
    const [buildings, buildingTotal, activeTotal, deletedTotal, archivedTotal, comments, imports, duplicateGroups] = await Promise.all([
      prisma.building.findMany({
        where: buildingWhere,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          archivedAt: true,
          deletedAt: true,
          owner: { select: { id: true, minecraftNickname: true } },
        },
      }),
      prisma.building.count({ where: buildingWhere }),
      prisma.building.count({ where: { AND: [buildingWhere, { deletedAt: null }, { status: { not: "ARCHIVED" } }] } }),
      prisma.building.count({ where: { AND: [buildingWhere, { deletedAt: { not: null } }] } }),
      prisma.building.count({ where: { AND: [buildingWhere, { status: "ARCHIVED" }] } }),
      prisma.comment.findMany({
        where: commentWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: COMMENT_LIMIT,
        select: {
          id: true,
          body: true,
          hiddenAt: true,
          createdAt: true,
          updatedAt: true,
          author: { select: { id: true, minecraftNickname: true } },
          building: { select: { id: true, name: true } },
        },
      }),
      prisma.importLog.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: IMPORT_LIMIT,
        select: {
          id: true,
          fileName: true,
          success: true,
          error: true,
          createdAt: true,
          actor: { select: { minecraftNickname: true } },
        },
      }),
      prisma.$queryRaw<Array<{ normalizedName: string; ids: string[]; total: number }>>(Prisma.sql`
        SELECT lower(regexp_replace(btrim(b."name"), '[[:space:]]+', ' ', 'g')) AS "normalizedName",
               (array_agg(b."id" ORDER BY b."updatedAt" DESC))[1:${MAX_DUPLICATES_PER_GROUP}] AS "ids",
               count(*)::integer AS "total"
        FROM "Building" b
        LEFT JOIN "User" u ON u."id" = b."ownerId"
        WHERE true ${duplicateFilter}
        GROUP BY 1
        HAVING count(*) > 1
        ORDER BY count(*) DESC, "normalizedName" ASC
        LIMIT ${MAX_DUPLICATES}
      `),
    ]);

    const duplicateIds = duplicateGroups.flatMap((group) => group.ids);
    const duplicateCandidates = duplicateIds.length ? await prisma.building.findMany({
      where: { id: { in: duplicateIds } },
      select: {
        id: true,
        name: true,
        status: true,
        deletedAt: true,
        updatedAt: true,
        owner: { select: { minecraftNickname: true } },
      },
    }) : [];
    const candidateById = new Map(duplicateCandidates.map((building) => [building.id, building]));
    const duplicates = duplicateGroups.map((group) => ({
      normalizedName: group.normalizedName,
      total: group.total,
      items: group.ids.map((id) => candidateById.get(id)).filter((building) => building !== undefined),
    }));

    return NextResponse.json({
      buildings,
      duplicates,
      comments,
      imports,
      pagination: {
        page,
        pageSize,
        total: buildingTotal,
        totalPages: Math.max(1, Math.ceil(buildingTotal / pageSize)),
      },
      summary: {
        active: activeTotal,
        deleted: deletedTotal,
        archived: archivedTotal,
      },
    });
  } catch {
    return NextResponse.json({ error: "Не удалось загрузить данные модерации" }, { status: 500 });
  }
}
