"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const PREFERENCE_KINDS = [
  "BUILDING_ASSIGNED",
  "BUILDING_STATUS_CHANGED",
  "MATERIAL_RESERVED",
  "MATERIAL_GATHERED",
  "COMMENT_ADDED",
  "ROLE_CHANGED",
] as const;

type PreferenceKind = (typeof PREFERENCE_KINDS)[number];
type NotificationKind = PreferenceKind | "MATERIAL_DELIVERED";

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

type Preference = { kind: PreferenceKind; enabled: boolean };

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
  const [savingKind, setSavingKind] = useState<PreferenceKind | null>(null);
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

  async function togglePreference(kind: PreferenceKind, enabled: boolean) {
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
    <main className="min-h-screen px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="glass-panel rounded-[2rem] p-6 md:p-8">
          <p className="glass-eyebrow">Центр уведомлений</p>
          <h1 className="mt-3 text-4xl font-semibold text-white md:text-5xl">Уведомления</h1>
          <p className="mt-2 text-[var(--muted)]">Непрочитанных: <span className="text-rose-100">{unreadCount}</span></p>
        </header>

        {error && <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200">{error}</p>}

        <section className="space-y-4">
          <div><p className="glass-eyebrow">Лента</p><h2 className="mt-2 text-2xl font-semibold text-white">Входящие</h2></div>
          {loading ? <p className="glass-panel-soft rounded-2xl p-6 text-[var(--muted)]">Загрузка…</p> : notifications.length === 0 ? <p className="glass-panel-soft rounded-2xl p-6 text-[var(--muted)]">Новых уведомлений пока нет.</p> : (
            <ul className="glass-panel divide-y divide-white/8 overflow-hidden rounded-3xl">
              {notifications.map((notification) => (
                <li key={notification.id} className={`flex flex-wrap items-center gap-4 p-5 transition ${notification.readAt ? "" : "bg-rose-950/30"}`}>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium text-white">{notificationTitle(notification)}</p>
                    <time dateTime={notification.createdAt} className="block text-xs text-[var(--muted-strong)]">{new Date(notification.createdAt).toLocaleString("ru-RU")}</time>
                    {notification.buildingId && <Link href={`/buildings/${notification.buildingId}`} className="inline-block text-sm text-rose-200 hover:text-rose-100 hover:underline">Открыть постройку</Link>}
                  </div>
                  {!notification.readAt && <button type="button" onClick={() => void markRead(notification.id)} className="glass-control rounded-lg px-3 py-2 text-sm text-slate-200 hover:border-rose-300/70">Прочитано</button>}
                </li>
              ))}
            </ul>
          )}
          {hasMore && <button type="button" disabled={loadingMore} onClick={() => void loadNotifications(page + 1, true)} className="glass-control rounded-xl px-5 py-2 text-sm disabled:opacity-50">{loadingMore ? "Загрузка…" : "Загрузить ещё"}</button>}
        </section>

        <section className="space-y-4">
          <div><p className="glass-eyebrow">Контроль сигнала</p><h2 className="mt-2 text-2xl font-semibold text-white">Настройки уведомлений</h2></div>
          <div className="glass-panel divide-y divide-white/8 overflow-hidden rounded-3xl">
            {PREFERENCE_KINDS.map((kind) => {
              const preference = preferences.find((item) => item.kind === kind);
              const enabled = preference?.enabled ?? true;
              return <label key={kind} className="flex cursor-pointer items-center justify-between gap-4 p-4 transition hover:bg-white/[0.025]"><span>{KIND_LABELS[kind]}</span><input type="checkbox" checked={enabled} disabled={savingKind === kind} onChange={(event) => void togglePreference(kind, event.target.checked)} className="h-5 w-5 accent-[var(--accent-strong)]" /></label>;
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
