"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = { buildingId: string; cursor: string };

export default function LiveSync({ buildingId, cursor: initialCursor }: Props) {
  const router = useRouter();
  const [cursor, setCursor] = useState(initialCursor);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;

    const poll = async () => {
      if (stopped) return;
      if (document.visibilityState === "hidden" || inFlight) {
        timer = setTimeout(poll, 8_000);
        return;
      }
      inFlight = true;
      try {
        const query = new URLSearchParams({ since: cursor });
        const response = await fetch(`/api/buildings/${encodeURIComponent(buildingId)}/sync?${query}`, { cache: "no-store" });
        if (!response.ok) throw new Error("sync failed");
        const body = await response.json() as { cursor: string; changed: boolean };
        if (stopped) return;
        setConnected(true);
        if (body.cursor > cursor) setCursor(body.cursor);
        if (body.changed) router.refresh();
      } catch {
        if (!stopped) setConnected(false);
      } finally {
        inFlight = false;
        if (!stopped) timer = setTimeout(poll, connected ? 5_000 : 10_000);
      }
    };

    timer = setTimeout(poll, 5_000);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [buildingId, connected, cursor, router]);

  return <p className="text-xs text-slate-500" role="status" aria-live="polite">{connected ? "Синхронизация активна · изменения обновляются автоматически" : "Нет соединения · переподключаемся и обновим данные после восстановления"}</p>;
}
