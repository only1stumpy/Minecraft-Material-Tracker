"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type User = {
  id: string;
  minecraftNickname: string;
  role: "ADMIN" | "MODERATOR" | "PLAYER";
  isBlocked: boolean;
  createdAt: string | Date;
  lastActiveAt: string | Date | null;
  _count: { buildings: number };
  gatheredQty: number;
};

export function AdminUsers({ users, actorId }: { users: User[]; actorId: string }) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const router = useRouter();

  async function request(url: string, options: RequestInit) {
    setError("");
    try {
      const response = await fetch(url, options);
      const data = await response.json() as { error?: string; temporaryPassword?: string; user?: { minecraftNickname: string } };
      if (!response.ok) throw new Error(data.error ?? "Операция не выполнена");
      if (data.temporaryPassword) {
        setSecret(`Временный пароль${data.user ? ` для ${data.user.minecraftNickname}` : ""}: ${data.temporaryPassword}`);
      }
      router.refresh();
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка соединения");
      return false;
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const completed = await request("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname: fields.get("nickname"), role: fields.get("role") }),
    });
    if (completed) form.reset();
  }

  async function update(id: string, payload: object) {
    setPendingId(id);
    await request(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setPendingId(null);
  }

  return <div className="space-y-7">
    <form onSubmit={create} className="glass-panel-soft grid gap-3 rounded-3xl p-5 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
      <div className="min-w-0">
        <p className="glass-eyebrow mb-2">Новый участник</p>
        <input name="nickname" required minLength={3} maxLength={16} pattern="[A-Za-z0-9_]+" placeholder="Minecraft-ник" className="glass-control w-full rounded-xl px-4 py-3" />
      </div>
      <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Роль
        <select name="role" className="glass-control rounded-xl px-4 py-3 text-sm normal-case tracking-normal"><option value="PLAYER">Игрок</option><option value="MODERATOR">Модератор</option><option value="ADMIN">Администратор</option></select>
      </label>
      <button className="glass-action-primary rounded-xl px-5 py-3">Создать аккаунт</button>
    </form>
    {secret && <div role="status" className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4 font-mono text-amber-200">{secret}<p className="mt-1 font-sans text-xs text-amber-100/75">Скопируйте пароль сейчас: позднее он не отображается.</p></div>}
    {error && <p role="alert" className="rounded-xl border border-rose-500/45 bg-rose-950/35 p-3 text-rose-200">{error}</p>}
    <div className="glass-panel overflow-x-auto rounded-3xl">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-black/20 text-[var(--muted)]"><tr><th className="p-4">Игрок</th><th className="p-4">Роль</th><th className="p-4">Постройки</th><th className="p-4">Собрано</th><th className="p-4">Последняя активность</th><th className="p-4">Действия</th></tr></thead>
        <tbody>{users.map((user) => { const disabled = pendingId === user.id || actorId === user.id; return <tr key={user.id} className="border-t border-white/8 align-top hover:bg-white/[0.025]"><td className="p-4"><b className="text-white">{user.minecraftNickname}</b>{actorId === user.id && <span className="ml-2 text-xs text-[var(--muted-strong)]">это вы</span>}{user.isBlocked && <span className="ml-2 inline-flex rounded-full border border-rose-400/40 bg-rose-950/35 px-2 py-0.5 text-xs text-rose-200">заблокирован</span>}</td><td className="p-4"><span className="glass-pill rounded-full px-2 py-1 text-xs">{user.role}</span></td><td className="p-4 text-white">{user._count.buildings}</td><td className="p-4 text-white">{user.gatheredQty}</td><td className="p-4 text-[var(--muted)]">{user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleString("ru-RU") : "—"}</td><td className="p-4"><div className="flex flex-wrap gap-2"><button disabled={disabled} onClick={() => update(user.id, { blocked: !user.isBlocked })} className="glass-control rounded-lg px-3 py-1.5 text-xs disabled:opacity-50">{user.isBlocked ? "Разблокировать" : "Блокировать"}</button><button disabled={disabled} onClick={() => update(user.id, { action: "resetPassword" })} className="glass-control rounded-lg px-3 py-1.5 text-xs disabled:opacity-50">Новый пароль</button><label className="sr-only" htmlFor={`role-${user.id}`}>Роль пользователя {user.minecraftNickname}</label><select id={`role-${user.id}`} disabled={disabled} value={user.role} onChange={(event) => void update(user.id, { role: event.target.value })} className="glass-control rounded-lg px-3 py-1.5 text-xs disabled:opacity-50"><option value="PLAYER">Игрок</option><option value="MODERATOR">Модератор</option><option value="ADMIN">Администратор</option></select><button disabled={disabled} onClick={() => { const nickname = window.prompt("Новый Minecraft-ник", user.minecraftNickname); if (nickname && nickname !== user.minecraftNickname) void update(user.id, { nickname }); }} className="glass-control rounded-lg px-3 py-1.5 text-xs disabled:opacity-50">Переименовать</button></div></td></tr>; })}</tbody>
      </table>
    </div>
  </div>;
}
