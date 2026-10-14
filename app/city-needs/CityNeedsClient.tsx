"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type CityNeedProject = {
  materialId: string;
  buildingId: string;
  buildingName: string;
  status: string;
  statusLabel: string;
  required: number;
  gathered: number;
  delivered: number;
  remaining: number;
  reservations: CityNeedReservationView[];
};

export type CityNeedReservationView = {
  id: string;
  quantity: number;
  gatheredQty: number;
};

export type CityNeedView = {
  name: string;
  normalizedName: string;
  required: number;
  gathered: number;
  delivered: number;
  covered: number;
  projectRemaining: number;
  warehouseQuantity: number;
  needed: number;
  projects: CityNeedProject[];
};

type Props = { initialNeeds: CityNeedView[] };

const numberFormatter = new Intl.NumberFormat("ru-RU");
const normalizeSearch = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е").replace(/\s+/g, " ");

export default function CityNeedsClient({ initialNeeds }: Props) {
  const [needs, setNeeds] = useState(initialNeeds);
  const [query, setQuery] = useState("");
  const [onlyNeeded, setOnlyNeeded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const normalizedQuery = normalizeSearch(query);
  const visibleNeeds = useMemo(() => needs.filter((row) => {
    if (onlyNeeded && row.needed <= 0) return false;
    if (!normalizedQuery) return true;
    return row.normalizedName.includes(normalizedQuery) || row.projects.some((project) => normalizeSearch(project.buildingName).includes(normalizedQuery));
  }), [needs, normalizedQuery, onlyNeeded]);
  const totalNeeded = visibleNeeds.reduce((sum, row) => sum + row.needed, 0);
  const myReservations = useMemo(() => {
    const merged = new Map<string, {
      id: string;
      quantity: number;
      gatheredQty: number;
      materialName: string;
      buildingId: string;
      buildingName: string;
      materialId: string;
    }>();
    for (const row of needs) {
      for (const project of row.projects) {
        for (const reservation of project.reservations) {
          const current = merged.get(project.materialId);
          if (current) {
            current.quantity += reservation.quantity;
            current.gatheredQty += reservation.gatheredQty;
          } else {
            merged.set(project.materialId, {
              ...reservation,
              materialName: row.name,
              buildingId: project.buildingId,
              buildingName: project.buildingName,
              materialId: project.materialId,
            });
          }
        }
      }
    }
    return [...merged.values()];
  }, [needs]);

  const reserve = async (project: CityNeedProject) => {
    const raw = window.prompt(`Сколько зарезервировать для «${project.buildingName}»? Осталось: ${numberFormatter.format(project.remaining)}`);
    if (raw === null) return;
    const quantity = Number(raw);
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      setError("Количество должно быть положительным целым числом");
      return;
    }
    setBusy(project.materialId);
    setError("");
    try {
      const response = await fetch(`/api/buildings/${project.buildingId}/materials/${project.materialId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reserve", quantity, operationId: crypto.randomUUID() }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Не удалось зарезервировать материал");
      // The existing material API intentionally returns only operation status.
      // Reload to receive the authoritative reservation id for later release.
      window.location.reload();
    } catch (reserveError) {
      setError(reserveError instanceof Error ? reserveError.message : "Не удалось зарезервировать материал");
    } finally {
      setBusy(null);
    }
  };

  const release = async (project: CityNeedProject, reservation: CityNeedReservationView) => {
    setBusy(reservation.id);
    setError("");
    try {
      const response = await fetch(`/api/buildings/${project.buildingId}/materials/${project.materialId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "release", reservationId: reservation.id, operationId: crypto.randomUUID() }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Не удалось освободить резервацию");
      setNeeds((previous) => previous.map((row) => ({
        ...row,
        projects: row.projects.map((candidate) => candidate.materialId !== project.materialId ? candidate : {
          ...candidate,
          reservations: candidate.reservations.filter((candidateReservation) => candidateReservation.id !== reservation.id),
        }),
      })));
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : "Не удалось освободить резервацию");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="glass-panel-soft grid gap-3 rounded-3xl p-5 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="text-sm text-[var(--muted)]">Поиск материала или постройки<input value={query} onChange={(event) => setQuery(event.target.value)} className="glass-control mt-2 w-full rounded-xl px-4 py-3" placeholder="Например, камень" /></label>
        <label className="glass-control flex items-center gap-2 rounded-xl px-4 py-3 text-sm text-[var(--muted)]"><input type="checkbox" checked={onlyNeeded} onChange={(event) => setOnlyNeeded(event.target.checked)} className="accent-[var(--accent-strong)]" /> Только дефицит</label>
        <div className="rounded-xl border border-rose-400/25 bg-rose-950/25 px-4 py-3 text-sm text-rose-100">Нужно: <b>{numberFormatter.format(totalNeeded)}</b></div>
      </section>
      {error && <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}
      <section className="glass-panel-soft rounded-3xl p-5" aria-labelledby="my-mining-heading">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="glass-eyebrow">Личный список добычи</p><h2 id="my-mining-heading" className="mt-2 text-2xl font-semibold text-white">Мои активные резервации</h2></div><span className="rounded-xl border border-rose-300/20 bg-rose-950/20 px-3 py-2 text-sm text-rose-100">{numberFormatter.format(myReservations.reduce((sum, reservation) => sum + reservation.quantity - reservation.gatheredQty, 0))} шт.</span></div>
        {myReservations.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">Пока ничего не зарезервировано. Выберите проект ниже и укажите количество.</p> : <ul className="mt-4 grid gap-2 md:grid-cols-2">{myReservations.map((reservation) => <li key={reservation.id} className="rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-sm"><Link href={`/buildings/${reservation.buildingId}#material-${reservation.materialId}`} className="text-rose-200 hover:text-rose-100 hover:underline">{reservation.materialName}</Link><span className="text-[var(--muted)]"> · {reservation.buildingName} · {numberFormatter.format(reservation.quantity - reservation.gatheredQty)} шт.</span></li>)}</ul>}
        <p className="mt-3 text-xs text-[var(--muted-strong)]">Личные резервации помогают распределить работу и не уменьшают общий дефицит города.</p>
      </section>
      {visibleNeeds.length === 0 ? <p className="glass-panel-soft rounded-2xl p-6 text-[var(--muted)]">Активных потребностей по этому фильтру нет.</p> : <div className="grid gap-4">{visibleNeeds.map((row) => <article key={row.normalizedName} className="glass-panel rounded-3xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-white">{row.name}</h2><p className="mt-1 text-xs text-[var(--muted-strong)]">Нормализованное имя: {row.normalizedName}</p></div><div className="text-right"><p className="text-2xl font-semibold text-rose-100">{numberFormatter.format(row.needed)}</p><p className="text-xs text-[var(--muted)]">осталось добыть</p></div></div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4"><div className="rounded-xl border border-white/8 bg-black/25 p-3"><span className="text-[var(--muted-strong)]">Требуется</span><b className="mt-1 block text-white">{numberFormatter.format(row.required)}</b></div><div className="rounded-xl border border-white/8 bg-black/25 p-3"><span className="text-[var(--muted-strong)]">Собрано</span><b className="mt-1 block text-white">{numberFormatter.format(row.gathered)}</b></div><div className="rounded-xl border border-white/8 bg-black/25 p-3"><span className="text-[var(--muted-strong)]">Доставлено</span><b className="mt-1 block text-white">{numberFormatter.format(row.delivered)}</b></div><div className="rounded-xl border border-rose-300/20 bg-rose-950/20 p-3"><span className="text-[var(--muted-strong)]">На складе</span><b className="mt-1 block text-rose-100">{numberFormatter.format(row.warehouseQuantity)}</b></div></div>
        <p className="mt-4 text-sm text-[var(--muted)]">Остаток по проектам: <b className="text-slate-200">{numberFormatter.format(row.projectRemaining)}</b> · покрыто вкладом: <b className="text-slate-200">{numberFormatter.format(row.covered)}</b>. Склад вычтен один раз.</p>
        <ul className="mt-4 space-y-2 border-t border-white/8 pt-4">{row.projects.map((project) => <li key={project.materialId} className="rounded-xl bg-black/25 px-3 py-2 text-sm"><div className="flex flex-wrap items-center justify-between gap-3"><Link href={`/buildings/${project.buildingId}#material-${project.materialId}`} className="text-rose-200 hover:text-rose-100 hover:underline">{project.buildingName}</Link><span className="text-[var(--muted)]">{project.statusLabel} · осталось {numberFormatter.format(project.remaining)}</span></div><div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted-strong)]"><span>Мой резерв: {numberFormatter.format(project.reservations.reduce((sum, reservation) => sum + reservation.quantity - reservation.gatheredQty, 0))}</span><button type="button" onClick={() => reserve(project)} disabled={busy !== null || project.remaining < 1} className="glass-control rounded-lg px-3 py-1.5 text-rose-100 disabled:opacity-50">{busy === project.materialId ? "Сохраняем…" : "Зарезервировать"}</button></div>{project.reservations.length > 0 && <ul className="mt-2 space-y-1 border-t border-white/8 pt-2">{project.reservations.map((reservation) => <li key={reservation.id} className="flex flex-wrap items-center justify-between gap-2"><span>{numberFormatter.format(reservation.quantity - reservation.gatheredQty)} шт. в личном списке</span><button type="button" onClick={() => release(project, reservation)} disabled={busy !== null} className="text-rose-200 hover:text-rose-100 disabled:opacity-50">Освободить</button></li>)}</ul>}</li>)}</ul>
      </article>)}</div>}
    </div>
  );
}
