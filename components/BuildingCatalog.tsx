import Image from "next/image";
import Link from "next/link";
import { integerPercentComplete } from "@/lib/materials";

export type BuildingCatalogBuilding = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
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

export type BuildingCatalogFilters = {
  q: string;
  status: string;
  sort: string;
  mine: boolean;
  participated: boolean;
  favorites: boolean;
  hideCompleted: boolean;
  page: number;
};

export type BuildingCatalogProps = {
  buildings: BuildingCatalogBuilding[];
  filters: BuildingCatalogFilters;
  pageCount: number;
  total: number;
};

export const BUILDING_STATUS_OPTIONS = [
  ["", "Все статусы"],
  ["DRAFT", "Черновик"],
  ["PLANNED", "Запланировано"],
  ["COLLECTING", "Сбор ресурсов"],
  ["READY", "Готово к строительству"],
  ["BUILDING", "Строится"],
  ["COMPLETED", "Завершено"],
  ["PAUSED", "Приостановлено"],
  ["ARCHIVED", "Архивировано"],
] as const;

const SORT_OPTIONS = [
  ["updated", "По последним изменениям"],
  ["created", "Сначала новые"],
  ["name", "По названию"],
  ["progress", "По прогрессу"],
] as const;

const STATUS_LABELS = Object.fromEntries(BUILDING_STATUS_OPTIONS) as Record<string, string>;
const numberFormatter = new Intl.NumberFormat("ru-RU");
const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
});

const statusClasses: Record<string, string> = {
  DRAFT: "border-slate-600 bg-slate-800 text-slate-200",
  PLANNED: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  COLLECTING: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  READY: "border-cyan-500/40 bg-cyan-500/10 text-cyan-200",
  BUILDING: "border-violet-500/40 bg-violet-500/10 text-violet-200",
  COMPLETED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  PAUSED: "border-orange-500/40 bg-orange-500/10 text-orange-200",
  ARCHIVED: "border-slate-600 bg-slate-800 text-slate-400",
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
};

const formatCount = (value: number) => numberFormatter.format(Math.max(0, value));

const buildingCountLabel = (value: number) => {
  const absolute = Math.abs(value) % 100;
  const last = absolute % 10;
  if (absolute >= 11 && absolute <= 14) return "построек";
  if (last === 1) return "постройка";
  if (last >= 2 && last <= 4) return "постройки";
  return "построек";
};

const progressFor = (building: BuildingCatalogBuilding) => {
  if (building.requiredQty <= 0) return 0;
  return integerPercentComplete(building.gatheredQty, building.requiredQty);
};

const queryForPage = (filters: BuildingCatalogFilters, page: number) => {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.status) query.set("status", filters.status);
  if (filters.sort) query.set("sort", filters.sort);
  if (filters.mine) query.set("mine", "1");
  if (filters.participated) query.set("participated", "1");
  if (filters.favorites) query.set("favorites", "1");
  if (filters.hideCompleted) query.set("hideCompleted", "1");
  query.set("page", String(page));
  return `/?${query.toString()}`;
};

function FilterForm({ filters }: { filters: BuildingCatalogFilters }) {
  return (
    <form action="/" method="get" className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-slate-950/20">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(10rem,1fr)_minmax(12rem,1fr)_auto] lg:items-end">
        <label htmlFor="catalog-q" className="grid gap-2 text-sm text-slate-300">
          Поиск
          <input
            id="catalog-q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Название, описание или автор"
            autoComplete="off"
            className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30"
          />
        </label>

        <label htmlFor="catalog-status" className="grid gap-2 text-sm text-slate-300">
          Статус
          <select id="catalog-status" name="status" defaultValue={filters.status} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30">
            {BUILDING_STATUS_OPTIONS.map(([value, label]) => <option key={value || "all"} value={value}>{label}</option>)}
          </select>
        </label>

        <label htmlFor="catalog-sort" className="grid gap-2 text-sm text-slate-300">
          Сортировка
          <select id="catalog-sort" name="sort" defaultValue={filters.sort} className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30">
            {SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        <button type="submit" className="min-h-11 rounded-xl bg-emerald-400 px-5 font-semibold text-slate-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-slate-900">
          Применить
        </button>
      </div>

      <fieldset className="mt-4 flex flex-wrap gap-3 border-0 p-0">
        <legend className="sr-only">Дополнительные фильтры</legend>
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-700 px-3 text-sm text-slate-300 transition has-[:focus-visible]:border-emerald-400 has-[:checked]:border-emerald-500/70 has-[:checked]:bg-emerald-500/10">
          <input type="checkbox" name="mine" value="1" defaultChecked={filters.mine} className="size-4 accent-emerald-400" />
          Мои постройки
        </label>
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-700 px-3 text-sm text-slate-300 transition has-[:focus-visible]:border-emerald-400 has-[:checked]:border-emerald-500/70 has-[:checked]:bg-emerald-500/10">
          <input type="checkbox" name="participated" value="1" defaultChecked={filters.participated} className="size-4 accent-emerald-400" />
          Я участвую
        </label>
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-700 px-3 text-sm text-slate-300 transition has-[:focus-visible]:border-emerald-400 has-[:checked]:border-emerald-500/70 has-[:checked]:bg-emerald-500/10">
          <input type="checkbox" name="favorites" value="1" defaultChecked={filters.favorites} className="size-4 accent-emerald-400" />
          Избранное
        </label>
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-700 px-3 text-sm text-slate-300 transition has-[:focus-visible]:border-emerald-400 has-[:checked]:border-emerald-500/70 has-[:checked]:bg-emerald-500/10">
          <input type="checkbox" name="hideCompleted" value="1" defaultChecked={filters.hideCompleted} className="size-4 accent-emerald-400" />
          Скрыть завершённые
        </label>
        {(filters.q || filters.status || filters.mine || filters.participated || filters.favorites || filters.hideCompleted) && (
          <Link href="/" className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline">
            Сбросить фильтры
          </Link>
        )}
      </fieldset>
    </form>
  );
}

function BuildingCard({ building }: { building: BuildingCatalogBuilding }) {
  const progress = progressFor(building);
  const coordinates = [building.x, building.y, building.z];
  const hasCoordinates = coordinates.some((coordinate) => coordinate !== null);
  const screenshotUrl = building.screenshotPath
    ? `/api/files/${building.screenshotPath.split("/").map(encodeURIComponent).join("/")}`
    : null;

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:border-emerald-400/60">
      <Link href={`/buildings/${encodeURIComponent(building.id)}`} aria-label={`Открыть постройку «${building.name}»`} className="block h-48 overflow-hidden bg-slate-950">
        {screenshotUrl ? (
          <Image src={screenshotUrl} alt={`Скриншот постройки «${building.name}»`} width={640} height={360} unoptimized className="h-48 w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div role="img" aria-label={`Для постройки «${building.name}» скриншот не добавлен`} className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-500">
            <span aria-hidden="true" className="text-3xl leading-none">▧</span>
            <span className="text-sm">Скриншот не добавлен</span>
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/buildings/${encodeURIComponent(building.id)}`} className="break-words text-xl font-semibold text-white underline-offset-4 hover:text-emerald-300 hover:underline">
              {building.name}
            </Link>
            <p className="mt-1 text-xs text-slate-500">Создано: {formatDate(building.createdAt)} · обновлено: {formatDate(building.updatedAt)}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses[building.status] ?? "border-slate-600 bg-slate-800 text-slate-300"}`}>
            {STATUS_LABELS[building.status] ?? building.status}
          </span>
        </div>

        {building.description && <p className="line-clamp-3 text-sm leading-6 text-slate-300">{building.description}</p>}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Автор</dt>
            <dd className="truncate text-slate-200">{building.ownerNickname ?? "Не назначен"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Участники</dt>
            <dd className="text-slate-200">{formatCount(building.participantCount)}</dd>
          </div>
          {hasCoordinates && (
            <div className="col-span-2">
              <dt className="text-xs text-slate-500">Координаты</dt>
              <dd className="font-mono text-xs text-slate-300">{coordinates.map((coordinate) => coordinate ?? "—").join(", ")}</dd>
            </div>
          )}
        </dl>

        <div className="mt-auto border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-300">Собрано {formatCount(building.gatheredQty)} / {formatCount(building.requiredQty)} · Осталось {formatCount(Math.max(building.requiredQty - building.gatheredQty, 0))}</span>
            <span className="font-semibold text-emerald-300">{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-label={`Собрано материалов для ${building.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="h-full rounded-full bg-emerald-400 transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>Доставлено: {formatCount(building.deliveredQty)}</span>
            <span>{building.isFavorite ? "★ В избранном" : "☆ Не в избранном"}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function Pagination({ filters, pageCount }: { filters: BuildingCatalogFilters; pageCount: number }) {
  if (pageCount <= 1) return null;

  const page = Math.min(Math.max(1, filters.page), pageCount);
  const previousHref = queryForPage(filters, page - 1);
  const nextHref = queryForPage(filters, page + 1);

  return (
    <nav aria-label="Страницы каталога" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-5">
      {page > 1 ? (
        <Link href={previousHref} rel="prev" className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-4 text-sm text-slate-200 transition hover:border-emerald-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/60">
          ← Назад
        </Link>
      ) : <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-xl border border-slate-800 px-4 text-sm text-slate-600">← Назад</span>}
      <span className="text-sm text-slate-400">Страница {page} из {pageCount}</span>
      {page < pageCount ? (
        <Link href={nextHref} rel="next" className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-4 text-sm text-slate-200 transition hover:border-emerald-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/60">
          Вперёд →
        </Link>
      ) : <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-xl border border-slate-800 px-4 text-sm text-slate-600">Вперёд →</span>}
    </nav>
  );
}

export default function BuildingCatalog({ buildings, filters, pageCount, total }: BuildingCatalogProps) {
  const hasFilters = Boolean(filters.q || filters.status || filters.mine || filters.participated || filters.favorites || filters.hideCompleted);

  return (
    <section aria-labelledby="catalog-heading" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="catalog-heading" className="text-2xl font-semibold text-white">Каталог построек</h2>
          <p className="mt-1 text-sm text-slate-400">{total === 0 ? "Постройки не найдены" : `${formatCount(total)} ${buildingCountLabel(total)}`}</p>
        </div>
        <Link href="/buildings/new" className="inline-flex min-h-11 items-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-slate-950">
          + Добавить постройку
        </Link>
      </div>

      <FilterForm filters={filters} />

      {buildings.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/50 px-6 py-12 text-center">
          <p className="text-lg font-medium text-slate-200">{hasFilters ? "По этим фильтрам ничего не найдено" : "Пока нет ни одной постройки"}</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">{hasFilters ? "Измените запрос или сбросьте фильтры, чтобы увидеть другие карточки." : "Добавьте первую постройку, чтобы жители могли найти её и собрать нужные материалы."}</p>
          {hasFilters && <Link href="/" className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-emerald-500/50 px-4 text-sm text-emerald-200 transition hover:bg-emerald-500/10">Сбросить фильтры</Link>}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {buildings.map((building) => <BuildingCard key={building.id} building={building} />)}
          </div>
          <Pagination filters={filters} pageCount={pageCount} />
        </>
      )}
    </section>
  );
}
