"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type User = {
  id: string;
  minecraftNickname: string;
  role: "ADMIN" | "PLAYER";
  isBlocked: boolean;
  createdAt: string | Date;
  lastActiveAt: string | Date | null;
  _count: { buildings: number };
};

export function AdminUsers({ users }: { users: User[] }) {
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
    <form onSubmit={create} className="flex flex-wrap gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <input name="nickname" required minLength={3} maxLength={16} pattern="[A-Za-z0-9_]+" placeholder="Minecraft-ник" className="min-w-52 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
      <select name="role" className="rounded-xl border border-slate-700 bg-slate-950 px-4"><option value="PLAYER">Игрок</option><option value="ADMIN">Администратор</option></select>
      <button className="rounded-xl bg-emerald-400 px-5 font-semibold text-slate-950">Создать аккаунт</button>
    </form>
    {secret && <div role="status" className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 font-mono text-amber-200">{secret}<p className="mt-1 font-sans text-xs">Скопируйте пароль сейчас: позднее он не отображается.</p></div>}
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    <div className="overflow-x-auto rounded-2xl border border-slate-800"><table className="w-full text-left text-sm"><thead className="bg-slate-900 text-slate-400"><tr><th className="p-4">Игрок</th><th className="p-4">Роль</th><th className="p-4">Постройки</th><th className="p-4">Последняя активность</th><th className="p-4">Действия</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-t border-slate-800"><td className="p-4"><b>{user.minecraftNickname}</b>{user.isBlocked && <span className="ml-2 text-rose-300">заблокирован</span>}</td><td className="p-4">{user.role}</td><td className="p-4">{user._count.buildings}</td><td className="p-4 text-slate-400">{user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleString("ru-RU") : "—"}</td><td className="p-4"><div className="flex flex-wrap gap-2"><button disabled={pendingId === user.id} onClick={() => update(user.id, { blocked: !user.isBlocked })} className="rounded-lg border border-slate-600 px-3 py-1 disabled:opacity-50">{user.isBlocked ? "Разблокировать" : "Блокировать"}</button><button disabled={pendingId === user.id} onClick={() => update(user.id, { action: "resetPassword" })} className="rounded-lg border border-slate-600 px-3 py-1 disabled:opacity-50">Новый пароль</button><button disabled={pendingId === user.id} onClick={() => update(user.id, { role: user.role === "ADMIN" ? "PLAYER" : "ADMIN" })} className="rounded-lg border border-slate-600 px-3 py-1 disabled:opacity-50">Сменить роль</button><button disabled={pendingId === user.id} onClick={() => { const nickname = window.prompt("Новый Minecraft-ник", user.minecraftNickname); if (nickname && nickname !== user.minecraftNickname) void update(user.id, { nickname }); }} className="rounded-lg border border-slate-600 px-3 py-1 disabled:opacity-50">Переименовать</button></div></td></tr>)}</tbody></table></div>
  </div>;
}
