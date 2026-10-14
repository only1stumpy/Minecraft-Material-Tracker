import { getCurrentUser } from "@/lib/auth";
import {
  getBuildingSyncCursor,
  maxBuildingSyncCursor,
  parseBuildingSyncCursor,
} from "@/lib/building-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const STREAM_WINDOW_MS = 25_000;
const POLL_INTERVAL_MS = 2_000;
const HEARTBEAT_INTERVAL_MS = 10_000;

function encodeComment(message: string) {
  return `: ${message}\n\n`;
}

function encodeBuildingEvent(cursor: Date) {
  const value = cursor.toISOString();
  return `id: ${value}\nevent: building\ndata: ${JSON.stringify({ cursor: value })}\n\n`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) {
    return new Response(JSON.stringify({ error: "Требуется авторизация" }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  if (actor.mustChangePassword) {
    return new Response(JSON.stringify({ error: "Сначала смените временный пароль" }), {
      status: 403,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const searchParams = new URL(request.url).searchParams;
  const sinceValue = searchParams.get("since");
  const since = parseBuildingSyncCursor(sinceValue);
  if (searchParams.has("since") && !since) {
    return new Response(JSON.stringify({ error: "Некорректный курсор синхронизации" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const lastEventId = request.headers.get("last-event-id")?.trim() || null;
  const lastEventCursor = parseBuildingSyncCursor(lastEventId);
  if (lastEventId && !lastEventCursor) {
    return new Response(JSON.stringify({ error: "Некорректный Last-Event-ID" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  let initialCursor = maxBuildingSyncCursor(since, lastEventCursor);
  if (!initialCursor) {
    return new Response(JSON.stringify({ error: "Требуется курсор синхронизации" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const { id } = await params;
  const currentCursor = await getBuildingSyncCursor(id);
  if (!currentCursor) {
    return new Response(JSON.stringify({ error: "Постройка не найдена" }), {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  // EventSource cursors come from the client. Clamp a forged future cursor so
  // it cannot suppress updates until the database clock catches up.
  if (currentCursor < initialCursor) initialCursor = currentCursor;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let lastCursor = initialCursor;
      let pollTimer: ReturnType<typeof setTimeout> | undefined;
      let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
      const closeTimer = { current: undefined as ReturnType<typeof setTimeout> | undefined };

      function cleanup() {
        if (pollTimer) clearTimeout(pollTimer);
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        if (closeTimer.current) clearTimeout(closeTimer.current);
        request.signal.removeEventListener("abort", closeStream);
      }

      function closeStream() {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          // The client may have closed the stream between the abort check and here.
        }
      }

      function enqueue(payload: string) {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(payload));
          return true;
        } catch {
          closeStream();
          return false;
        }
      }

      async function poll() {
        if (closed) return;
        try {
          const nextCursor = await getBuildingSyncCursor(id);
          if (closed) return;
          if (!nextCursor) {
            closeStream();
            return;
          }
          if (nextCursor > lastCursor) {
            lastCursor = nextCursor;
            if (!enqueue(encodeBuildingEvent(nextCursor))) return;
          }
        } catch {
          closeStream();
          return;
        }
        if (!closed) pollTimer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }

      function heartbeat() {
        if (!enqueue(encodeComment("heartbeat"))) return;
        heartbeatTimer = setTimeout(heartbeat, HEARTBEAT_INTERVAL_MS);
      }

      request.signal.addEventListener("abort", closeStream, { once: true });
      if (request.signal.aborted) {
        closeStream();
        return;
      }

      if (!enqueue("retry: 2000\n" + encodeComment("connected"))) return;
      if (currentCursor > lastCursor) {
        lastCursor = currentCursor;
        if (!enqueue(encodeBuildingEvent(currentCursor))) return;
      }
      pollTimer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      heartbeatTimer = setTimeout(heartbeat, HEARTBEAT_INTERVAL_MS);
      closeTimer.current = setTimeout(closeStream, STREAM_WINDOW_MS);
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
