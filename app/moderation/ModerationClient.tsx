"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type BuildingStatus = "DRAFT" | "PLANNED" | "COLLECTING" | "READY" | "BUILDING" | "COMPLETED" | "PAUSED" | "ARCHIVED";
type ModerationBuilding = {
  id: string;
  name: string;
  status: BuildingStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  owner: { id: string; minecraftNickname: string } | null;
};
type DuplicateBuilding = Pick<ModerationBuilding, "id" | "name" | "status" | "updatedAt" | "deletedAt"> & { owner: { minecraftNickname: string } | null };
type ModerationComment = {
  id: string;
  body: string;
  hiddenAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; minecraftNickname: string };
  building: { id: string; name: string };
};
type ImportEntry = {
  id: string;
  fileName: string | null;
  success: boolean;
  error: string | null;
  createdAt: string;
  actor: { minecraftNickname: string } | null;
};
type ModerationPayload = {
  buildings: ModerationBuilding[];
  duplicates: { normalizedName: string; total: number; items: DuplicateBuilding[] }[];
  comments: ModerationComment[];
  imports: ImportEntry[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: { active: number; deleted: number; archived: number };
};

const statusLabels: Record<BuildingStatus, string> = {
  DRAFT: "Черновик",
  PLANNED: "Запланировано",
  COLLECTING: "Сбор ресурсов",
  READY: "Готово к строительству",
  BUILDING: "Строится",
  COMPLETED: "Завершено",
  PAUSED: "Приостановлено",
  ARCHIVED: "Архив",
};

const formatDate = (value: string) => new Date(value).toLocaleString("ru-RU");
const buildingLabel = (building: Pick<ModerationBuilding, "deletedAt" | "status">) => building.deletedAt ? "Скрыта" : statusLabels[building.status];

export default function ModerationClient() {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<ModerationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (appliedSearch) params.set("q", appliedSearch);
    try {
      const response = await fetch(`/api/moderation?${params.toString()}`, { cache: "no-store" });
      const data = await response.json() as ModerationPayload & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось загрузить модерацию");
      setPayload(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить модерацию");
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, page]);

  useEffect(() => { void load(); }, [load]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setAppliedSearch(search.trim());
  };

  const clearSearch = () => {
    setSearch("");
    setPage(1);
    setAppliedSearch("");
  };

  const moderateBuilding = async (building: ModerationBuilding) => {
    const restore = Boolean(building.deletedAt);
    if (!restore && !window.confirm(`Скрыть постройку «${building.name}»?`)) return;
    setBusyKey(`building:${building.id}`);
    setError(null);
    try {
      const response = await fetch(`/api/admin/buildings/${encodeURIComponent(building.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restore }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось изменить постройку");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось изменить постройку");
    } finally {
      setBusyKey(null);
    }
  };

  const moderateComment = async (comment: ModerationComment) => {
    const hidden = !comment.hiddenAt;
    setBusyKey(`comment:${comment.id}`);
    setError(null);
    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(comment.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hidden }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось изменить комментарий");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось изменить комментарий");
    } finally {
      setBusyKey(null);
    }
  };

  const buildings = payload?.buildings ?? [];

  return (
    <div className="space-y-8" aria-busy={loading}>
      <form onSubmit={submitSearch} className="flex flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-900/70 p-5 md:flex-row md:items-end">
        <label className="flex-1 text-sm text-slate-300">Поиск по постройкам и комментариям<input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} placeholder="Название, ник или текст" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-400" /></label>
        <button type="submit" className="rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950 hover:bg-emerald-300">Найти</button>
        <button type="button" onClick={clearSearch} className="rounded-xl border border-slate-700 px-5 py-3 text-slate-200 hover:border-emerald-400">Сбросить</button>
      </form>

      {error && <p role="alert" className="rounded-2xl border border-rose-500/50 bg-rose-500/10 p-4 text-rose-200">{error}</p>}
      {loading && !payload && <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-slate-300">Загружаем данные модерации…</p>}

      {payload && <>
        <section className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-300">Карточки</p><h2 className="text-2xl font-semibold text-white">Недавние постройки</h2></div><p className="text-sm text-slate-400">Активных: {payload.summary.active} · скрытых: {payload.summary.deleted} · архивных: {payload.summary.archived}</p></div>
          {buildings.length === 0 ? <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-slate-300">По этому запросу построек нет.</p> : <div className="grid gap-4 md:grid-cols-2">
            {buildings.map((building) => <article key={building.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><div className="flex items-start justify-between gap-3"><div><Link href={`/buildings/${encodeURIComponent(building.id)}`} className="text-lg font-semibold text-emerald-200 hover:underline">{building.name}</Link><p className="mt-1 text-sm text-slate-400">{buildingLabel(building)} · обновлено {formatDate(building.updatedAt)}</p></div><span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">{statusLabels[building.status]}</span></div><p className="mt-3 text-sm text-slate-400">Владелец: {building.owner?.minecraftNickname ?? "не назначен"}</p><button type="button" onClick={() => void moderateBuilding(building)} disabled={busyKey === `building:${building.id}`} className="mt-4 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-100 hover:border-emerald-400 disabled:cursor-wait disabled:opacity-50">{busyKey === `building:${building.id}` ? "Сохраняем…" : building.deletedAt ? "Восстановить" : "Скрыть"}</button></article>)}
          </div>}
          {payload.pagination.totalPages > 1 && <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-slate-700 px-3 py-2 disabled:opacity-40">← Назад</button><span className="text-slate-400">Страница {payload.pagination.page} из {payload.pagination.totalPages}</span><button type="button" disabled={page >= payload.pagination.totalPages || loading} onClick={() => setPage((current) => Math.min(payload.pagination.totalPages, current + 1))} className="rounded-lg border border-slate-700 px-3 py-2 disabled:opacity-40">Вперёд →</button></div>}
        </section>

        <section className="space-y-4"><div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-300">Проверка дублей</p><h2 className="text-2xl font-semibold text-white">Очевидные совпадения названий</h2></div>{payload.duplicates.length === 0 ? <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-slate-300">Совпадений среди найденных карточек нет.</p> : <div className="grid gap-4 md:grid-cols-2">{payload.duplicates.map((group) => <div key={group.normalizedName} className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5"><h3 className="font-semibold text-amber-100">{group.items[0]?.name ?? group.normalizedName}</h3><ul className="mt-3 space-y-2 text-sm">{group.items.map((building) => <li key={building.id}><Link href={`/buildings/${encodeURIComponent(building.id)}`} className="text-emerald-200 hover:underline">{building.name}</Link><span className="ml-2 text-slate-400">{building.owner?.minecraftNickname ?? "без владельца"}</span></li>)}</ul>{group.total > group.items.length && <p className="mt-3 text-xs text-amber-200">Показаны первые {group.items.length} из {group.total}</p>}</div>)}</div>}</section>

        <section className="space-y-4"><div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-300">Комментарии</p><h2 className="text-2xl font-semibold text-white">Последние и скрытые комментарии</h2></div>{payload.comments.length === 0 ? <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-slate-300">Комментариев по этому запросу нет.</p> : <div className="space-y-3">{payload.comments.map((comment) => <article key={comment.id} className={`rounded-2xl border p-5 ${comment.hiddenAt ? "border-rose-500/30 bg-rose-500/5" : "border-slate-800 bg-slate-900/70"}`}><div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><Link href={`/buildings/${encodeURIComponent(comment.building.id)}`} className="font-semibold text-emerald-200 hover:underline">{comment.building.name}</Link><p className="text-sm text-slate-400">{comment.author.minecraftNickname} · {formatDate(comment.createdAt)}{comment.hiddenAt ? " · скрыт" : ""}</p></div><button type="button" onClick={() => void moderateComment(comment)} disabled={busyKey === `comment:${comment.id}`} className="rounded-xl border border-slate-700 px-3 py-2 text-sm hover:border-emerald-400 disabled:cursor-wait disabled:opacity-50">{busyKey === `comment:${comment.id}` ? "Сохраняем…" : comment.hiddenAt ? "Показать" : "Скрыть"}</button></div><p className="mt-3 whitespace-pre-wrap text-sm text-slate-200">{comment.body}</p></article>)}</div>}</section>

        <section className="space-y-4"><div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-300">Импорт</p><h2 className="text-2xl font-semibold text-white">Последние записи ImportLog</h2></div>{payload.imports.length === 0 ? <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-slate-300">Записей импорта пока нет.</p> : <div className="overflow-x-auto rounded-2xl border border-slate-800"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-900 text-slate-400"><tr><th className="p-4">Файл</th><th className="p-4">Результат</th><th className="p-4">Кто запускал</th><th className="p-4">Дата</th></tr></thead><tbody>{payload.imports.map((entry) => <tr key={entry.id} className="border-t border-slate-800"><td className="p-4 text-slate-200">{entry.fileName ?? "—"}{entry.error && <p className="mt-1 text-rose-300">{entry.error}</p>}</td><td className={`p-4 ${entry.success ? "text-emerald-300" : "text-rose-300"}`}>{entry.success ? "Успешно" : "Ошибка"}</td><td className="p-4 text-slate-400">{entry.actor?.minecraftNickname ?? "Система"}</td><td className="p-4 text-slate-400">{formatDate(entry.createdAt)}</td></tr>)}</tbody></table></div>}</section>
      </>}
    </div>
  );
}
