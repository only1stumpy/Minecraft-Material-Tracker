"use client";
import { useRouter } from "next/navigation";

export function BuildingAdminActions({ id, deleted }: { id: string; deleted: boolean }) {
  const router = useRouter();
  return <button onClick={async () => { if (!deleted && !window.confirm("Скрыть постройку? Её можно будет восстановить.")) return; await fetch(`/api/admin/buildings/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ restore: deleted }) }); router.refresh(); }} className="rounded-lg border border-slate-600 px-3 py-1 text-sm">{deleted ? "Восстановить" : "Скрыть"}</button>;
}
