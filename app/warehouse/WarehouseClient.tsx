"use client";

import { FormEvent, useMemo, useState } from "react";

export type WarehouseMovementView = {
  id: string;
  kind: "RECEIVED" | "USED" | "ADJUSTED";
  delta: number;
  note: string | null;
  createdAt: string;
  actorName: string;
};

export type WarehouseStockView = {
  id: string;
  itemName: string;
  normalizedName: string;
  stackSize: number;
  quantity: number;
  updatedAt: string;
  movements: WarehouseMovementView[];
};

type Props = {
  initialStocks: WarehouseStockView[];
  canManage: boolean;
};

type MovementKind = "RECEIVED" | "USED" | "ADJUSTED";

const KIND_LABELS: Record<MovementKind, string> = {
  RECEIVED: "Приход",
  USED: "Списание",
  ADJUSTED: "Корректировка",
};

const formatNumber = new Intl.NumberFormat("ru-RU");
const formatDate = (value: string) => new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "short",
  timeStyle: "short",
}).format(new Date(value));

const normalizeSearch = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е").replace(/\s+/g, " ");

export default function WarehouseClient({ initialStocks, canManage }: Props) {
  const [stocks, setStocks] = useState(initialStocks);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<MovementKind>("RECEIVED");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const visibleStocks = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return stocks;
    return stocks.filter((stock) => stock.normalizedName.includes(normalizedQuery));
  }, [query, stocks]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/warehouse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemName,
          kind,
          quantity: Number(quantity),
          note: note || undefined,
        }),
      });
      const data = await response.json().catch(() => null) as { stock?: WarehouseStockView; error?: string } | null;
      if (!response.ok || !data?.stock) throw new Error(data?.error ?? "Не удалось обновить склад");
      setStocks((previous) => {
        const previousStock = previous.find((stock) => stock.normalizedName === data.stock?.normalizedName);
        const movements = [...(data.stock?.movements ?? []), ...(previousStock?.movements ?? [])]
          .filter((movement, index, all) => all.findIndex((candidate) => candidate.id === movement.id) === index)
          .slice(0, 5);
        const updatedStock = { ...data.stock as WarehouseStockView, movements };
        const withoutUpdated = previous.filter((stock) => stock.normalizedName !== updatedStock.normalizedName);
        return [...withoutUpdated, updatedStock].sort((left, right) => left.itemName.localeCompare(right.itemName, "ru"));
      });
      setItemName("");
      setQuantity("");
      setNote("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось обновить склад");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {canManage && <form onSubmit={submit} className="glass-panel-soft grid gap-4 rounded-3xl p-5 md:grid-cols-[1.5fr_1fr_1fr_2fr_auto] md:items-end">
        <div className="md:col-span-full"><p className="glass-eyebrow">Операция со складом</p><p className="mt-1 text-sm text-[var(--muted)]">Зафиксируйте приход, списание или точную корректировку остатка.</p></div>
        <label className="text-sm text-[var(--muted)]">Материал<input value={itemName} onChange={(event) => setItemName(event.target.value)} maxLength={160} required className="glass-control mt-2 w-full rounded-xl px-3 py-2.5" placeholder="Например, камень" /></label>
        <label className="text-sm text-[var(--muted)]">Движение<select value={kind} onChange={(event) => setKind(event.target.value as MovementKind)} className="glass-control mt-2 w-full rounded-xl px-3 py-2.5"><option value="RECEIVED">Приход</option><option value="USED">Списание</option><option value="ADJUSTED">Корректировка</option></select></label>
        <label className="text-sm text-[var(--muted)]">{kind === "ADJUSTED" ? "Итоговый остаток" : "Количество"}<input type="number" min={kind === "ADJUSTED" ? 0 : 1} max={2147483647} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} required className="glass-control mt-2 w-full rounded-xl px-3 py-2.5" /></label>
        <label className="text-sm text-[var(--muted)]">Примечание<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className="glass-control mt-2 w-full rounded-xl px-3 py-2.5" placeholder="Необязательно" /></label>
        <button type="submit" disabled={busy} className="glass-action-primary rounded-xl px-4 py-2.5 disabled:opacity-50">{busy ? "Сохраняем…" : "Сохранить"}</button>
      </form>}
      {!canManage && <p className="glass-panel-soft rounded-2xl p-4 text-sm text-[var(--muted)]">Изменять склад могут только модераторы и администраторы.</p>}
      {error && <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}
      <section className="space-y-4" aria-labelledby="warehouse-list-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="glass-eyebrow">Инвентарь</p><h2 id="warehouse-list-heading" className="mt-2 text-2xl font-semibold text-white">Остатки</h2></div>
          <label className="text-sm text-[var(--muted)]">Поиск<input value={query} onChange={(event) => setQuery(event.target.value)} className="glass-control ml-2 rounded-xl px-3 py-2" placeholder="Название материала" /></label>
        </div>
        {visibleStocks.length === 0 ? <p className="glass-panel-soft rounded-2xl p-6 text-[var(--muted)]">Материалы не найдены.</p> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleStocks.map((stock) => <article key={stock.id} className="glass-panel rounded-3xl p-5 transition hover:-translate-y-0.5">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">{stock.itemName}</h3><p className="mt-1 text-xs text-[var(--muted-strong)]">Обновлено {formatDate(stock.updatedAt)}</p></div><strong className="text-xl text-rose-100">{formatNumber.format(stock.quantity)}</strong></div>
          <p className="mt-2 text-xs text-[var(--muted)]">Стака: {formatNumber.format(stock.stackSize)} · {stock.quantity === 1 ? "штука" : "штук"}</p>
          {stock.movements.length > 0 && <ul className="mt-4 space-y-2 border-t border-white/8 pt-3 text-xs text-[var(--muted)]">{stock.movements.slice(0, 3).map((movement) => <li key={movement.id} className="flex justify-between gap-3"><span>{KIND_LABELS[movement.kind]} · {movement.delta > 0 ? "+" : ""}{formatNumber.format(movement.delta)}{movement.note ? ` · ${movement.note}` : ""}</span><span className="shrink-0 text-[var(--muted-strong)]">{movement.actorName}</span></li>)}</ul>}
        </article>)}</div>}
      </section>
    </div>
  );
}
