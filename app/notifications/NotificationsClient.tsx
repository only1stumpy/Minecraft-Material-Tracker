"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const NOTIFICATION_KINDS = [
  "BUILDING_ASSIGNED",
  "BUILDING_STATUS_CHANGED",
  "MATERIAL_RESERVED",
  "MATERIAL_GATHERED",
  "MATERIAL_DELIVERED",
  "COMMENT_ADDED",
  "ROLE_CHANGED",
] as const;

type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

type NotificationItem = {
  id: string;
  kind: NotificationKind;
  buildingId: string | null;
  entityId: string | null;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
  actor: { minecraftNickname: string } | null;
};

type Preference = { kind: NotificationKind; enabled: boolean };

type NotificationsResponse = {
  error?: string;
  notifications: NotificationItem[];
  unreadCount: number;
  page: number;
  hasMore: boolean;
};

type PreferencesResponse = { error?: string; preferences: Preference[] };

const KIND_LABELS: Record<NotificationKind, string> = {
  BUILDING_ASSIGNED: "Вам назначили постройку",
  BUILDING_STATUS_CHANGED: "Изменился статус постройки",
  MATERIAL_RESERVED: "Зарезервирован материал",
  MATERIAL_GATHERED: "Материал собран",
  MATERIAL_DELIVERED: "Материал доставлен",
  COMMENT_ADDED: "Добавлен комментарий",
  ROLE_CHANGED: "Изменилась роль аккаунта",
};

const getError = async (response: Response) => {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : "Операция не выполнена";
};

const notificationTitle = (notification: NotificationItem) => {
  const label = KIND_LABELS[notification.kind] ?? "Новое уведомление";
  return notification.actor ? `${notification.actor.minecraftNickname}: ${label}` : label;
};

export default function NotificationsClient() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingKind, setSavingKind] = useState<NotificationKind | null>(null);
  const [error, setError] = useState("");

  async function loadNotifications(nextPage: number, append: boolean) {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/notifications?page=${nextPage}&limit=20`, { cache: "no-store" });
      if (!response.ok) throw new Error(await getError(response));
      const data = await response.json() as NotificationsResponse;
      setNotifications((current) => append ? [...current, ...data.notifications] : data.notifications);
      setUnreadCount(data.unreadCount);
      setPage(data.page);
      setHasMore(data.hasMore);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить уведомления");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function loadPreferences() {
    try {
      const response = await fetch("/api/notifications/preferences", { cache: "no-store" });
      if (!response.ok) throw new Error(await getError(response));
      const data = await response.json() as PreferencesResponse;
      setPreferences(data.preferences);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить настройки");
    }
  }

  useEffect(() => {
    void Promise.all([loadNotifications(1, false), loadPreferences()]);
  }, []);

  async function markRead(id: string) {
    const current = notifications.find((notification) => notification.id === id);
    if (!current || current.readAt) return;
    const readAt = new Date().toISOString();
    setNotifications((items) => items.map((item) => item.id === id ? { ...item, readAt } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      const response = await fetch(`/api/notifications/${encodeURIComponent(id)}`, { method: "PATCH" });
      if (!response.ok) throw new Error(await getError(response));
    } catch (requestError) {
      setNotifications((items) => items.map((item) => item.id === id ? current : item));
      setUnreadCount((count) => count + 1);
      setError(requestError instanceof Error ? requestError.message : "Не удалось отметить уведомление");
    }
  }

  async function togglePreference(kind: NotificationKind, enabled: boolean) {
    const previous = preferences;
    setSavingKind(kind);
    setPreferences((items) => items.map((item) => item.kind === kind ? { ...item, enabled } : item));
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, enabled }),
      });
      if (!response.ok) throw new Error(await getError(response));
    } catch (requestError) {
      setPreferences(previous);
      setError(requestError instanceof Error ? requestError.message : "Не удалось сохранить настройку");
    } finally {
      setSavingKind(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Центр уведомлений</p>
          <h1 className="text-4xl font-semibold text-white">Уведомления</h1>
          <p className="text-slate-400">Непрочитанных: {unreadCount}</p>
        </header>

        {error && <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200">{error}</p>}

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Входящие</h2>
          {loading ? <p className="text-slate-400">Загрузка…</p> : notifications.length === 0 ? <p className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-400">Новых уведомлений пока нет.</p> : (
            <ul className="divide-y divide-slate-800 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              {notifications.map((notification) => (
                <li key={notification.id} className={`flex flex-wrap items-center gap-4 p-5 ${notification.readAt ? "" : "bg-emerald-950/30"}`}>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium text-white">{notificationTitle(notification)}</p>
                    <time dateTime={notification.createdAt} className="block text-xs text-slate-500">{new Date(notification.createdAt).toLocaleString("ru-RU")}</time>
                    {notification.buildingId && <Link href={`/buildings/${notification.buildingId}`} className="inline-block text-sm text-emerald-300 hover:underline">Открыть постройку</Link>}
                  </div>
                  {!notification.readAt && <button type="button" onClick={() => void markRead(notification.id)} className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:border-emerald-400">Прочитано</button>}
                </li>
              ))}
            </ul>
          )}
          {hasMore && <button type="button" disabled={loadingMore} onClick={() => void loadNotifications(page + 1, true)} className="rounded-full border border-slate-600 px-5 py-2 text-sm disabled:opacity-50">{loadingMore ? "Загрузка…" : "Загрузить ещё"}</button>}
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Настройки уведомлений</h2>
          <div className="divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900">
            {NOTIFICATION_KINDS.map((kind) => {
              const preference = preferences.find((item) => item.kind === kind);
              const enabled = preference?.enabled ?? true;
              return <label key={kind} className="flex cursor-pointer items-center justify-between gap-4 p-4"><span>{KIND_LABELS[kind]}</span><input type="checkbox" checked={enabled} disabled={savingKind === kind} onChange={(event) => void togglePreference(kind, event.target.checked)} className="h-5 w-5 accent-emerald-400" /></label>;
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
