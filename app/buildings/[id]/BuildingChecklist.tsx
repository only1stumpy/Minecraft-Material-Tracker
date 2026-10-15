"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { breakdownMaterial } from "@/lib/materials";
import { materialProgressStatusLabel, summarizeMaterialProgress } from "@/lib/material-operations";

type Contribution = {
  userId: string;
  gatheredQty: number;
  user: { minecraftNickname: string };
};

type Reservation = {
  id: string;
  userId: string;
  quantity: number;
  gatheredQty: number;
  releasedAt: Date | null;
  user: { minecraftNickname: string };
  pending?: boolean;
};

type PendingReservation = {
  reservation: Reservation;
  previousReservationIds: string[];
  phase: "saving" | "refreshing";
};

type ChecklistMaterial = {
  id: string;
  name: string;
  requiredQty: number;
  stackSize: number;
  surplusLimit: number;
  sortOrder: number;
  contributions: Contribution[];
  reservations: Reservation[];
};

type Props = {
  buildingId: string;
  materials: ChecklistMaterial[];
  actorId: string;
  canModerate: boolean;
  canParticipate: boolean;
  initialFilters: BuildingChecklistFilters;
};

type Action = "reserve" | "release" | "gather" | "correct";
export type MaterialFilter = "all" | "mine" | "free" | "active" | "ready";
export type MaterialSort = "name" | "required" | "remaining" | "gathered";
export type BuildingChecklistFilters = {
  materialFilter: MaterialFilter;
  materialQ: string;
  materialSort: MaterialSort;
  materialHideCompleted: boolean;
};

const MAX_SEARCH_LENGTH = 120;

const numberFormatter = new Intl.NumberFormat("ru-RU");

function quantities(row: ChecklistMaterial) {
  const gathered = row.contributions.reduce((sum, contribution) => sum + contribution.gatheredQty, 0);
  const progress = summarizeMaterialProgress({
    requiredQty: row.requiredQty,
    gatheredQty: gathered,
    surplusLimit: row.surplusLimit,
    reservations: row.reservations,
  });
  return { gathered, reserved: progress.reservedQty, free: progress.freeQty, remaining: progress.remainingQty, percent: progress.gatheredPercent, status: progress.status };
}

function breakdownLabel(quantity: number, stackSize: number) {
  const parts = breakdownMaterial(quantity, stackSize);
  return [
    parts.fullShulkers > 0 ? `${parts.fullShulkers} ш.` : "",
    parts.fullStacks > 0 ? `${parts.fullStacks} ст.` : "",
    parts.looseItems > 0 ? `${parts.looseItems} шт.` : "",
  ].filter(Boolean).join(" ") || "0 шт.";
}

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : "Операция не выполнена";
}

export default function BuildingChecklist({
  buildingId,
  materials,
  actorId,
  canModerate,
  canParticipate,
  initialFilters,
}: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<MaterialFilter>(initialFilters.materialFilter);
  const [search, setSearch] = useState(initialFilters.materialQ);
  const [sort, setSort] = useState<MaterialSort>(initialFilters.materialSort);
  const [hideCompleted, setHideCompleted] = useState(initialFilters.materialHideCompleted);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingReservations, setPendingReservations] = useState<Record<string, PendingReservation>>({});
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const confirmedPendingIds = useMemo(() => {
    const confirmed = new Set<string>();
    for (const row of materials) {
      const pending = pendingReservations[row.id];
      if (!pending) continue;
      const previousIds = new Set(pending.previousReservationIds);
      if (row.reservations.some((reservation) => reservation.userId === actorId
        && !reservation.releasedAt
        && reservation.quantity === pending.reservation.quantity
        && !previousIds.has(reservation.id))) {
        confirmed.add(row.id);
      }
    }
    return confirmed;
  }, [materials, pendingReservations, actorId]);

  const optimisticMaterials = useMemo(() => materials.map((row) => {
    const pending = pendingReservations[row.id];
    if (!pending || confirmedPendingIds.has(row.id)) return row;
    return { ...row, reservations: [...row.reservations, pending.reservation] };
  }), [materials, pendingReservations, confirmedPendingIds]);

  useEffect(() => {
    if (confirmedPendingIds.size === 0) return;
    setPendingReservations((current) => {
      let changed = false;
      const next = { ...current };
      for (const id of confirmedPendingIds) {
        if (next[id]) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [confirmedPendingIds]);

  const totalRequired = materials.reduce((sum, row) => sum + row.requiredQty, 0);
  const totalGathered = optimisticMaterials.reduce((sum, row) => sum + quantities(row).gathered, 0);

  function replaceFilterQuery(next: BuildingChecklistFilters) {
    const url = new URL(window.location.href);
    url.searchParams.set("materialFilter", next.materialFilter);
    url.searchParams.set("materialQ", next.materialQ);
    url.searchParams.set("materialSort", next.materialSort);
    url.searchParams.set("materialHideCompleted", String(next.materialHideCompleted));
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function updateFilter(next: MaterialFilter) {
    setFilter(next);
    replaceFilterQuery({ materialFilter: next, materialQ: search, materialSort: sort, materialHideCompleted: hideCompleted });
  }

  function updateSearch(next: string) {
    const normalized = next.slice(0, MAX_SEARCH_LENGTH);
    setSearch(normalized);
    replaceFilterQuery({ materialFilter: filter, materialQ: normalized, materialSort: sort, materialHideCompleted: hideCompleted });
  }

  function updateSort(next: MaterialSort) {
    setSort(next);
    replaceFilterQuery({ materialFilter: filter, materialQ: search, materialSort: next, materialHideCompleted: hideCompleted });
  }

  function updateHideCompleted(next: boolean) {
    setHideCompleted(next);
    replaceFilterQuery({ materialFilter: filter, materialQ: search, materialSort: sort, materialHideCompleted: next });
  }

  const visibleMaterials = useMemo(() => optimisticMaterials
    .filter((row) => {
      const progress = quantities(row);
      if (hideCompleted && progress.gathered >= row.requiredQty) return false;
      if (search && !row.name.toLocaleLowerCase("ru-RU").includes(search.toLocaleLowerCase("ru-RU"))) return false;
      if (filter === "mine" && !row.contributions.some((contribution) => contribution.userId === actorId)
        && !row.reservations.some((reservation) => reservation.userId === actorId && !reservation.releasedAt)) return false;
      if (filter === "free" && progress.free <= 0) return false;
      if (filter === "active" && progress.gathered === 0 && progress.reserved === 0) return false;
      if (filter === "ready" && progress.gathered < row.requiredQty) return false;
      return true;
    })
    .sort((left, right) => {
      if (sort === "required") return right.requiredQty - left.requiredQty || left.name.localeCompare(right.name, "ru");
      if (sort === "remaining") return quantities(right).remaining - quantities(left).remaining || left.name.localeCompare(right.name, "ru");
      if (sort === "gathered") return quantities(right).gathered - quantities(left).gathered || left.name.localeCompare(right.name, "ru");
      return left.name.localeCompare(right.name, "ru");
    }), [optimisticMaterials, actorId, filter, hideCompleted, search, sort]);

  async function runAction(row: ChecklistMaterial, action: Action, quantity: number, reservationId?: string, targetUserId?: string, direction?: "add" | "remove") {
    setError("");
    setSaveMessage("");
    setBusyId(row.id);
    const pendingReservation = action === "reserve" ? {
      reservation: {
        id: `optimistic:${crypto.randomUUID()}`,
        userId: actorId,
        quantity,
        gatheredQty: 0,
        releasedAt: null,
        user: { minecraftNickname: "Вы" },
        pending: true,
      },
      previousReservationIds: row.reservations.map((reservation) => reservation.id),
      phase: "saving" as const,
    } : null;
    if (pendingReservation) {
      setPendingReservations((current) => ({ ...current, [row.id]: pendingReservation }));
    }
    try {
      const response = await fetch(`/api/buildings/${encodeURIComponent(buildingId)}/materials/${encodeURIComponent(row.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          action,
          ...(action === "release" ? {} : { quantity }),
          ...(reservationId ? { reservationId } : {}),
          ...(targetUserId ? { targetUserId } : {}),
          ...(direction ? { direction } : {}),
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      if (pendingReservation) {
        setPendingReservations((current) => current[row.id]
          ? { ...current, [row.id]: { ...current[row.id], phase: "refreshing" } }
          : current);
      }
      setSaveMessage("Изменение сохранено");
      router.refresh();
    } catch (requestError) {
      if (pendingReservation) {
        setPendingReservations((current) => {
          if (!current[row.id]) return current;
          const next = { ...current };
          delete next[row.id];
          return next;
        });
      }
      setError(requestError instanceof Error ? requestError.message : "Ошибка сохранения");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="glass-panel space-y-5 rounded-[2rem] p-5 md:p-7" aria-labelledby="materials-heading">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="glass-eyebrow">Ресурсы</p><h2 id="materials-heading" className="mt-2 text-2xl font-semibold text-white">Материалы и вклад</h2>
          <p className="mt-1 text-sm text-slate-400">
            Собрано {numberFormatter.format(totalGathered)} / {numberFormatter.format(totalRequired)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Отмечайте сбор после того, как положили ресурсы в сундук постройки.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm md:text-right">
          <span>Требуется <b className="block text-white">{numberFormatter.format(totalRequired)}</b></span>
          <span>Собрано <b className="block text-rose-200">{numberFormatter.format(totalGathered)}</b></span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_auto_auto_auto]">
        <label className="sr-only" htmlFor="material-search">Поиск материала</label>
        <input id="material-search" value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Найти материал" className="glass-control rounded-2xl px-4 py-3 text-sm outline-none focus:border-rose-200" />
        <label className="sr-only" htmlFor="material-filter">Фильтр материалов</label>
        <select id="material-filter" value={filter} onChange={(event) => updateFilter(event.target.value as MaterialFilter)} className="glass-control rounded-2xl px-4 py-3 text-sm"><option value="all">Все материалы</option><option value="mine">Мои материалы</option><option value="free">Свободные</option><option value="active">В работе</option><option value="ready">Собрано полностью</option></select>
        <label className="sr-only" htmlFor="material-sort">Сортировка материалов</label>
        <select id="material-sort" value={sort} onChange={(event) => updateSort(event.target.value as MaterialSort)} className="glass-control rounded-2xl px-4 py-3 text-sm"><option value="required">Сначала большее требуемое количество</option><option value="name">По названию</option><option value="remaining">Сначала большой остаток</option><option value="gathered">По собранному количеству</option></select>
        <label className="glass-control flex items-center gap-2 rounded-2xl px-3 text-sm text-slate-300"><input type="checkbox" checked={hideCompleted} onChange={(event) => updateHideCompleted(event.target.checked)} className="accent-rose-400" />Скрыть собранное</label>
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      {saveMessage && <p role="status" className="text-sm text-rose-200">{saveMessage}</p>}

      {materials.length === 0 ? (
        <p className="glass-panel-soft rounded-2xl p-6 text-sm text-slate-400">Материалы ещё не добавлены. Владелец или модератор может изменить карточку постройки.</p>
      ) : visibleMaterials.length === 0 ? (
        <p className="glass-panel-soft rounded-2xl p-6 text-sm text-slate-400">По этим фильтрам материалов нет.</p>
      ) : (
        <div className="space-y-3">
          {visibleMaterials.map((row) => {
            const progress = quantities(row);
            const pendingReservation = pendingReservations[row.id] && !confirmedPendingIds.has(row.id)
              ? pendingReservations[row.id]
              : null;
            const ownReservations = row.reservations.filter((item) => item.userId === actorId && !item.releasedAt);
            const currentReservation = ownReservations.find((item) => item.quantity > item.gatheredQty);
            const historyReservations = row.reservations.filter((reservation) => !reservation.releasedAt
              && reservation.gatheredQty < reservation.quantity);
            const value = amounts[row.id] ?? String(currentReservation
              ? currentReservation.quantity - currentReservation.gatheredQty
              : Math.max(0, Math.min(progress.free, progress.remaining)));
            const parsedAmount = Number(value);
            const validAmount = Number.isSafeInteger(parsedAmount) && parsedAmount > 0;
            const busy = busyId === row.id || pendingReservation !== null;
            const itemBreakdown = breakdownMaterial(row.requiredQty, row.stackSize);
            const statusLabel = pendingReservation
              ? `${materialProgressStatusLabel(progress.status)} · ${pendingReservation.phase === "saving" ? "сохраняем…" : "подтверждаем…"}`
              : materialProgressStatusLabel(progress.status);

            return (
              <article key={row.id} className="glass-panel-soft rounded-2xl p-4 md:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 md:flex-1">
                    <h3 className="break-words font-semibold text-white">{row.name}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">
                      Требуется {numberFormatter.format(row.requiredQty)} ({breakdownLabel(row.requiredQty, row.stackSize)}; {itemBreakdown.occupiedSlots} слотов)
                    </p>
                  </div>
                  <div className="min-w-0 space-y-2 text-sm md:max-w-[55%] md:text-right">
                    <p><span className="glass-pill rounded-full px-2 py-1 text-xs" aria-label={`Статус материала: ${statusLabel}`}>{statusLabel}</span></p>
                    <p className="break-words"><b className="text-rose-200">{numberFormatter.format(progress.gathered)}</b> собрано</p>
                    <p className="break-words text-slate-400">Осталось по плану: {numberFormatter.format(progress.remaining)} · свободно: {numberFormatter.format(progress.free)}{row.surplusLimit > 0 ? ` · избыток до +${numberFormatter.format(row.surplusLimit)}` : ""}</p>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-label={`Сбор материала ${row.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
                  <div className="h-full rounded-full bg-rose-300 transition-[width]" style={{ width: `${progress.percent}%` }} />
                </div>

                {historyReservations.length > 0 && <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs leading-relaxed text-slate-400">{historyReservations.map((reservation) => <li key={reservation.id} className="break-words">{reservation.user.minecraftNickname}{reservation.pending ? ` · ${pendingReservation?.phase === "saving" ? "сохраняем…" : "подтверждаем…"}` : ""}: взял {numberFormatter.format(reservation.quantity)}, собрал {numberFormatter.format(reservation.gatheredQty)} (в работе)</li>)}</ul>}
                {row.contributions.length > 0 && <p className="mt-2 break-words text-xs leading-relaxed text-slate-400">Вклад: {row.contributions.map((contribution) => `${contribution.user.minecraftNickname} — ${numberFormatter.format(contribution.gatheredQty)} собрано`).join(" · ")}</p>}

                {canParticipate && <div className="mt-4 grid grid-cols-1 items-end gap-2 border-t border-white/10 pt-4 sm:flex sm:flex-wrap">
                  <label className="grid min-w-0 gap-1 text-xs text-slate-400 sm:w-28">Количество<input inputMode="numeric" value={value} onChange={(event) => setAmounts((items) => ({ ...items, [row.id]: event.target.value }))} className="glass-control w-full rounded-lg px-3 py-2 text-sm text-white" /></label>
                  {!currentReservation && <button type="button" disabled={busy || !validAmount || parsedAmount > progress.free} onClick={() => void runAction(row, "reserve", parsedAmount)} className="glass-action-primary w-full whitespace-nowrap rounded-xl px-3 py-2 text-sm disabled:opacity-40 sm:w-auto">Взять в работу</button>}
                  {currentReservation && <>
                    <button type="button" disabled={busy || !validAmount || parsedAmount > currentReservation.quantity - currentReservation.gatheredQty} onClick={() => void runAction(row, "gather", parsedAmount, currentReservation.id)} className="glass-action-primary w-full whitespace-nowrap rounded-xl px-3 py-2 text-sm disabled:opacity-40 sm:w-auto">Отметить сбор</button>
                    <button type="button" disabled={busy} onClick={() => void runAction(row, "release", 0, currentReservation.id)} className="glass-control w-full whitespace-nowrap rounded-xl px-3 py-2 text-sm text-slate-200 disabled:opacity-40 sm:w-auto">Освободить</button>
                  </>}
                </div>}

                {canModerate && row.reservations.some((reservation) => reservation.gatheredQty > 0) && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 text-xs">
                  <span className="text-amber-200">Коррекция сбора:</span>
                  {row.reservations.filter((reservation) => reservation.gatheredQty > 0 || !reservation.releasedAt).map((reservation) => <div key={reservation.id} className="flex flex-wrap items-center gap-1 glass-panel-soft rounded-lg p-2"><span className="mr-1 text-slate-300">{reservation.user.minecraftNickname}</span><button type="button" disabled={busy || !validAmount} onClick={() => void runAction(row, "correct", parsedAmount, reservation.id, reservation.userId, "add")} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">+ собрать</button><button type="button" disabled={busy || !validAmount || parsedAmount > reservation.gatheredQty} onClick={() => void runAction(row, "correct", parsedAmount, reservation.id, reservation.userId, "remove")} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">− убрать</button></div>)}
                </div>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
