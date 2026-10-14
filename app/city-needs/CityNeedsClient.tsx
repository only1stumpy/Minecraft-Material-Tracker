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
  const [query, setQuery] = useState("");
  const [onlyNeeded, setOnlyNeeded] = useState(false);
  const normalizedQuery = normalizeSearch(query);
  const visibleNeeds = useMemo(() => initialNeeds.filter((row) => {
    if (onlyNeeded && row.needed <= 0) return false;
    if (!normalizedQuery) return true;
    return row.normalizedName.includes(normalizedQuery) || row.projects.some((project) => normalizeSearch(project.buildingName).includes(normalizedQuery));
  }), [initialNeeds, normalizedQuery, onlyNeeded]);
  const totalNeeded = visibleNeeds.reduce((sum, row) => sum + row.needed, 0);

  return (
    <div className="space-y-5">
      <section className="glass-panel-soft grid gap-3 rounded-3xl p-5 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="text-sm text-[var(--muted)]">Поиск материала или постройки<input value={query} onChange={(event) => setQuery(event.target.value)} className="glass-control mt-2 w-full rounded-xl px-4 py-3" placeholder="Например, камень" /></label>
        <label className="glass-control flex items-center gap-2 rounded-xl px-4 py-3 text-sm text-[var(--muted)]"><input type="checkbox" checked={onlyNeeded} onChange={(event) => setOnlyNeeded(event.target.checked)} className="accent-[var(--accent-strong)]" /> Только дефицит</label>
        <div className="rounded-xl border border-rose-400/25 bg-rose-950/25 px-4 py-3 text-sm text-rose-100">Нужно: <b>{numberFormatter.format(totalNeeded)}</b></div>
      </section>
      {visibleNeeds.length === 0 ? <p className="glass-panel-soft rounded-2xl p-6 text-[var(--muted)]">Активных потребностей по этому фильтру нет.</p> : <div className="grid gap-4">{visibleNeeds.map((row) => <article key={row.normalizedName} className="glass-panel rounded-3xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-white">{row.name}</h2><p className="mt-1 text-xs text-[var(--muted-strong)]">Нормализованное имя: {row.normalizedName}</p></div><div className="text-right"><p className="text-2xl font-semibold text-rose-100">{numberFormatter.format(row.needed)}</p><p className="text-xs text-[var(--muted)]">осталось добыть</p></div></div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4"><div className="rounded-xl border border-white/8 bg-black/25 p-3"><span className="text-[var(--muted-strong)]">Требуется</span><b className="mt-1 block text-white">{numberFormatter.format(row.required)}</b></div><div className="rounded-xl border border-white/8 bg-black/25 p-3"><span className="text-[var(--muted-strong)]">Собрано</span><b className="mt-1 block text-white">{numberFormatter.format(row.gathered)}</b></div><div className="rounded-xl border border-white/8 bg-black/25 p-3"><span className="text-[var(--muted-strong)]">Доставлено</span><b className="mt-1 block text-white">{numberFormatter.format(row.delivered)}</b></div><div className="rounded-xl border border-rose-300/20 bg-rose-950/20 p-3"><span className="text-[var(--muted-strong)]">На складе</span><b className="mt-1 block text-rose-100">{numberFormatter.format(row.warehouseQuantity)}</b></div></div>
        <p className="mt-4 text-sm text-[var(--muted)]">Остаток по проектам: <b className="text-slate-200">{numberFormatter.format(row.projectRemaining)}</b> · покрыто вкладом: <b className="text-slate-200">{numberFormatter.format(row.covered)}</b>. Склад вычтен один раз.</p>
        <ul className="mt-4 space-y-2 border-t border-white/8 pt-4">{row.projects.map((project) => <li key={project.materialId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/25 px-3 py-2 text-sm"><Link href={`/buildings/${project.buildingId}#material-${project.materialId}`} className="text-rose-200 hover:text-rose-100 hover:underline">{project.buildingName}</Link><span className="text-[var(--muted)]">{project.statusLabel} · осталось {numberFormatter.format(project.remaining)}</span></li>)}</ul>
      </article>)}</div>}
    </div>
  );
}
