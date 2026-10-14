"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES = [
  ["DRAFT", "Черновик"],
  ["PLANNED", "Запланировано"],
  ["COLLECTING", "Сбор ресурсов"],
  ["READY", "Готово к строительству"],
  ["BUILDING", "Строится"],
  ["COMPLETED", "Завершено"],
  ["PAUSED", "Приостановлено"],
  ["ARCHIVED", "Архивировано"],
] as const;

export default function StatusEditor({ buildingId, status, expectedVersion }: { buildingId: string; status: string; expectedVersion: number }) {
  const [value, setValue] = useState(status);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function save() {
    if (value === status) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/buildings/${encodeURIComponent(buildingId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: value, expectedVersion }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Не удалось изменить статус");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Ошибка соединения");
    } finally {
      setSaving(false);
    }
  }

  return <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
    <label className="grid gap-1 text-sm text-slate-400">Статус постройки<select value={value} onChange={(event) => setValue(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">{STATUSES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <button type="button" disabled={saving || value === status} onClick={() => void save()} className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">{saving ? "Сохраняем…" : "Сохранить статус"}</button>
    {error && <p role="alert" className="w-full text-sm text-rose-300">{error}</p>}
  </section>;
}
