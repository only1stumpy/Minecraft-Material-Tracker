"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Revision = {
  id: string;
  version: number;
  createdAt: Date;
  actor: { minecraftNickname: string } | null;
};

export default function BuildingHistory({ buildingId, expectedVersion, revisions }: {
  buildingId: string;
  expectedVersion: number;
  revisions: Revision[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function restore(revision: Revision) {
    if (!window.confirm(`Восстановить версию ${revision.version}? Текущее состояние останется в истории.`)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/buildings/${encodeURIComponent(buildingId)}/revisions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revisionId: revision.id, expectedVersion }),
      });
      const body = await response.json().catch(() => null) as { error?: unknown } | null;
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Не удалось восстановить версию");
      setMessage(`Восстановлена версия ${revision.version}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка соединения");
    } finally {
      setBusy(false);
    }
  }

  return <section className="glass-panel space-y-4 rounded-3xl p-5 md:p-6">
    <div>
      <p className="glass-eyebrow">Журнал изменений</p><h2 className="mt-2 text-lg font-semibold">История версий</h2>
      <p className="mt-1 text-sm text-slate-400">Восстановление изменит карточку и список материалов, сохранив историю вклада.</p>
    </div>
    {revisions.length === 0 ? <p className="text-sm text-slate-500">История появится после первого изменения карточки.</p> : <ul className="divide-y divide-white/10">
      {revisions.map((revision) => <li key={revision.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
        <span><b>Версия {revision.version}</b><span className="ml-2 text-slate-400">{revision.createdAt.toLocaleString("ru-RU")} · {revision.actor?.minecraftNickname ?? "участник удалён"}</span></span>
        <button type="button" disabled={busy} onClick={() => void restore(revision)} className="glass-control rounded-xl px-3 py-1.5 text-rose-100 disabled:opacity-40">Восстановить</button>
      </li>)}
    </ul>}
    {message && <p role="status" className="text-sm text-slate-300">{message}</p>}
  </section>;
}
