"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = { buildingId: string; cursor: string };
type SyncStatus = "connecting" | "connected" | "reconnecting" | "paused";

const isNewCursor = (candidate: string, current: string) => {
  const nextTime = Date.parse(candidate);
  const currentTime = Date.parse(current);
  return Number.isFinite(nextTime) && Number.isFinite(currentTime) && nextTime > currentTime;
};

export default function LiveSync({ buildingId, cursor: initialCursor }: Props) {
  const router = useRouter();
  const cursorRef = useRef(initialCursor);
  const [status, setStatus] = useState<SyncStatus>("connecting");

  useEffect(() => {
    let stopped = false;
    let source: EventSource | null = null;

    const closeSource = (nextStatus: SyncStatus) => {
      source?.close();
      source = null;
      if (!stopped) setStatus(nextStatus);
    };

    const openSource = () => {
      if (stopped || document.visibilityState === "hidden") {
        if (!stopped) setStatus("paused");
        return;
      }
      source?.close();
      const query = new URLSearchParams({ since: cursorRef.current });
      const nextSource = new EventSource(`/api/buildings/${encodeURIComponent(buildingId)}/events?${query}`, { withCredentials: true });
      source = nextSource;
      setStatus("connecting");

      nextSource.onopen = () => {
        if (!stopped && source === nextSource) setStatus("connected");
      };
      nextSource.onerror = () => {
        if (!stopped && source === nextSource) setStatus("reconnecting");
      };
      nextSource.addEventListener("building", (event) => {
        if (stopped || source !== nextSource) return;
        const message = event as MessageEvent<string>;
        let nextCursor = message.lastEventId;
        try {
          const payload = JSON.parse(message.data) as { cursor?: string };
          nextCursor = payload.cursor ?? nextCursor;
        } catch {
          // The event ID remains the authoritative cursor if the payload is malformed.
        }
        if (!isNewCursor(nextCursor, cursorRef.current)) return;
        cursorRef.current = nextCursor;
        router.refresh();
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        closeSource("paused");
      } else {
        openSource();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    openSource();
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      source?.close();
      source = null;
    };
  }, [buildingId, router]);

  const message = {
    connecting: "Подключаем синхронизацию…",
    connected: "Синхронизация активна · изменения обновляются автоматически",
    reconnecting: "Нет соединения · переподключаемся и обновим данные после восстановления",
    paused: "Синхронизация приостановлена в фоне · возобновится при возврате на вкладку",
  }[status];

  return <p className="glass-pill inline-flex w-fit rounded-full px-3 py-1 text-xs" role="status" aria-live="polite">{message}</p>;
}
