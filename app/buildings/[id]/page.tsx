import Link from "next/link";
import Image from "next/image";

import BuildingChecklist, {
  type BuildingChecklistFilters,
  type MaterialFilter,
  type MaterialSort,
} from "./BuildingChecklist";
import CollaborationPanel from "./CollaborationPanel";
import FavoriteButton from "./FavoriteButton";
import StatusEditor from "./StatusEditor";
import BuildingHistory from "./BuildingHistory";
import LiveSync from "./LiveSync";
import { requireReadyUser } from "@/lib/auth";
import { canManageBuilding, canModerateContent, canParticipate } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { integerPercentComplete } from "@/lib/materials";

export const dynamic = "force-dynamic";

const STATUS_LABELS = {
  DRAFT: "Черновик",
  PLANNED: "Запланировано",
  COLLECTING: "Сбор ресурсов",
  READY: "Готово к строительству",
  BUILDING: "Строится",
  COMPLETED: "Завершено",
  PAUSED: "Приостановлено",
  ARCHIVED: "Архив",
} as const;

const MATERIAL_ACTIVITY_LABELS = {
  RESERVED: "взял в работу",
  RELEASED: "освободил резерв",
  GATHERED: "собрал",
  DELIVERED: "доставил",
  CORRECTED: "скорректировал",
} as const;

type PageSearchParams = Record<string, string | string[] | undefined>;

const MATERIAL_FILTERS = ["all", "mine", "free", "active", "ready"] as const;
const MATERIAL_SORTS = ["name", "remaining", "gathered"] as const;

const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] ?? "" : value ?? "";

const parseMaterialFilter = (value: string | string[] | undefined): MaterialFilter => {
  const candidate = firstParam(value);
  return (MATERIAL_FILTERS as readonly string[]).includes(candidate)
    ? candidate as MaterialFilter
    : "all";
};

const parseMaterialSearch = (value: string | string[] | undefined) =>
  firstParam(value).trim().slice(0, 120);

const parseMaterialSort = (value: string | string[] | undefined): MaterialSort => {
  const candidate = firstParam(value);
  return (MATERIAL_SORTS as readonly string[]).includes(candidate)
    ? candidate as MaterialSort
    : "name";
};

const parseMaterialHideCompleted = (value: string | string[] | undefined) => {
  const candidate = firstParam(value).toLowerCase();
  return !["false", "0", "off", "no"].includes(candidate);
};

export default async function BuildingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<PageSearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const initialFilters: BuildingChecklistFilters = {
    materialFilter: parseMaterialFilter(query.materialFilter),
    materialQ: parseMaterialSearch(query.materialQ),
    materialSort: parseMaterialSort(query.materialSort),
    materialHideCompleted: parseMaterialHideCompleted(query.materialHideCompleted),
  };
  const actor = await requireReadyUser();
  const building = await prisma.building.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      x: true,
      y: true,
      z: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      version: true,
      schematicFileName: true,
      schematicPath: true,
      schematicSize: true,
      screenshotPath: true,
      legacyScreenshotDataUrl: true,
      ownerId: true,
      owner: { select: { id: true, minecraftNickname: true } },
      responsible: { select: { id: true, minecraftNickname: true } },
      materials: {
        where: { isArchived: false },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          requiredQty: true,
          stackSize: true,
          allowSurplus: true,
          sortOrder: true,
          contributions: {
            select: {
              userId: true,
              gatheredQty: true,
              deliveredQty: true,
              user: { select: { minecraftNickname: true } },
            },
          },
          reservations: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              userId: true,
              quantity: true,
              gatheredQty: true,
              releasedAt: true,
              user: { select: { minecraftNickname: true } },
            },
          },
        },
      },
      tasks: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, title: true, description: true, status: true, assigneeId: true, assignee: { select: { minecraftNickname: true } } },
      },
      comments: {
        where: { hiddenAt: null },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          body: true,
          createdAt: true,
          authorId: true,
          materialId: true,
          material: { select: { name: true } },
          author: { select: { minecraftNickname: true } },
        },
      },
      favorites: { where: { userId: actor.id }, select: { userId: true } },
      revisions: {
        orderBy: { version: "desc" },
        take: 10,
        select: {
          id: true,
          version: true,
          createdAt: true,
          actor: { select: { minecraftNickname: true } },
        },
      },
    },
  });

  if (!building) {
    return <main className="min-h-screen px-6 py-16 text-slate-100"><div className="mx-auto max-w-4xl space-y-6"><Link href="/" className="text-sm text-emerald-300 hover:underline">← Вернуться к каталогу</Link><h1 className="text-3xl font-semibold">Постройка не найдена</h1><p className="text-slate-400">Проверьте ссылку или вернитесь к каталогу.</p></div></main>;
  }

  const recentActivity = await prisma.materialActivity.findMany({
    where: { material: { buildingId: id } },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: {
      id: true,
      kind: true,
      quantityDelta: true,
      createdAt: true,
      actor: { select: { minecraftNickname: true } },
      material: { select: { name: true } },
    },
  });

  const mayManage = canManageBuilding(actor, { ownerId: building.ownerId });
  const mayModerate = canModerateContent(actor);
  const totalRequired = building.materials.reduce((sum, item) => sum + item.requiredQty, 0);
  const totalGathered = building.materials.reduce((sum, item) => sum + item.contributions.reduce((partial, contribution) => partial + contribution.gatheredQty, 0), 0);
  const totalDelivered = building.materials.reduce((sum, item) => sum + item.contributions.reduce((partial, contribution) => partial + contribution.deliveredQty, 0), 0);
  const progress = totalRequired === 0 ? 0 : integerPercentComplete(totalGathered, totalRequired);
  const participantCount = new Set(building.materials.flatMap((item) => item.contributions.filter((contribution) => contribution.gatheredQty > 0).map((contribution) => contribution.userId))).size;

  return (
    <main className="min-h-screen px-6 py-10 text-slate-100 md:py-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <Link href="/" className="w-fit text-sm text-emerald-300 hover:underline">← Вернуться к каталогу</Link>
        <header className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3"><span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">{STATUS_LABELS[building.status]}</span><span className="text-xs text-slate-500">Обновлено {building.updatedAt.toLocaleString("ru-RU")}</span></div>
              <h1 className="text-3xl font-semibold text-white md:text-5xl">{building.name}</h1>
              {building.description && <p className="max-w-3xl whitespace-pre-wrap text-slate-300">{building.description}</p>}
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-400">
                <span>Автор: {building.owner?.minecraftNickname ?? "не назначен"}</span>
                {building.responsible && <span>Ответственный: {building.responsible.minecraftNickname}</span>}
                {(building.x !== null || building.y !== null || building.z !== null) && <span>Координаты: {building.x ?? "—"}, {building.y ?? "—"}, {building.z ?? "—"}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {building.schematicPath ? <a href={`/api/buildings/${encodeURIComponent(building.id)}/schematic`} className="rounded-xl border border-slate-700 px-4 py-2 text-emerald-200 hover:border-emerald-400">Скачать {building.schematicFileName ?? "схему"}{building.schematicSize ? ` · ${(building.schematicSize / 1024 / 1024).toFixed(1)} МБ` : ""}</a> : <span className="text-slate-500">Схема не прикреплена</span>}
                {mayManage && <Link href={`/buildings/${building.id}/edit`} className="rounded-xl bg-emerald-400 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-300">Редактировать карточку</Link>}
                <FavoriteButton buildingId={building.id} initialFavorite={building.favorites.length > 0} />
              </div>
            </div>
            {building.screenshotPath || building.legacyScreenshotDataUrl ? <Image src={building.screenshotPath ? `/api/files/${building.screenshotPath.split("/").map(encodeURIComponent).join("/")}` : building.legacyScreenshotDataUrl!} alt={`Скриншот: ${building.name}`} width={1024} height={576} unoptimized className="max-h-80 w-full rounded-2xl border border-slate-800 object-cover lg:max-w-md" /> : <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 px-8 text-center text-sm text-slate-500 lg:w-80">Скриншот пока не добавлен</div>}
          </div>
          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-950/70 p-4"><p className="text-sm text-slate-400">Сбор материалов</p><p className="mt-1 text-2xl font-semibold">{progress}%</p><div className="mt-3 h-2 rounded-full bg-slate-800"><div className="h-2 rounded-full bg-emerald-400" style={{ width: `${progress}%` }} /></div></div>
            <div className="rounded-2xl bg-slate-950/70 p-4"><p className="text-sm text-slate-400">Собрано / доставлено</p><p className="mt-1 text-2xl font-semibold">{totalGathered.toLocaleString("ru-RU")} / {totalDelivered.toLocaleString("ru-RU")}</p></div>
            <div className="rounded-2xl bg-slate-950/70 p-4"><p className="text-sm text-slate-400">Участники сбора</p><p className="mt-1 text-2xl font-semibold">{participantCount}</p></div>
          </div>
        </header>

        <LiveSync buildingId={building.id} cursor={building.updatedAt.toISOString()} />
        {mayManage && <StatusEditor buildingId={building.id} status={building.status} expectedVersion={building.version} />}
        {mayManage && <BuildingHistory buildingId={building.id} expectedVersion={building.version} revisions={building.revisions} />}
        <BuildingChecklist buildingId={building.id} materials={building.materials} actorId={actor.id} canModerate={mayModerate} canParticipate={canParticipate(actor)} initialFilters={initialFilters} />
        <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-xl font-semibold">Последние действия</h2>
          {recentActivity.length === 0 ? <p className="text-sm text-slate-400">Операций со сбором пока нет.</p> : <ul className="divide-y divide-slate-800">{recentActivity.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
            <span>{item.actor.minecraftNickname} {MATERIAL_ACTIVITY_LABELS[item.kind]} {Math.abs(item.quantityDelta).toLocaleString("ru-RU")} × {item.material.name}</span>
            <time className="text-slate-500">{item.createdAt.toLocaleString("ru-RU")}</time>
          </li>)}</ul>}
        </section>
        <CollaborationPanel buildingId={building.id} currentUserId={actor.id} canManage={mayManage} canModerate={mayModerate} tasks={building.tasks} comments={building.comments} materials={building.materials.map(({ id, name }) => ({ id, name }))} />
      </div>
    </main>
  );
}
