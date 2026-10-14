"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FavoriteButton({ buildingId, initialFavorite }: { buildingId: string; initialFavorite: boolean }) {
  const [favorite, setFavorite] = useState(initialFavorite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function toggle() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/buildings/favorites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buildingId, favorite: !favorite }),
      });
      if (!response.ok) throw new Error("Не удалось сохранить избранное");
      setFavorite(!favorite);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось сохранить избранное");
    } finally {
      setBusy(false);
    }
  }

  return <span className="flex flex-col gap-1"><button type="button" disabled={busy} onClick={() => void toggle()} aria-pressed={favorite} className={`glass-control rounded-xl px-4 py-2 text-sm ${favorite ? "text-rose-100" : "text-slate-200"} disabled:opacity-50`}>{favorite ? "★ В избранном" : "☆ В избранное"}</button>{error && <span role="alert" className="text-xs text-rose-300">{error}</span>}</span>;
}
