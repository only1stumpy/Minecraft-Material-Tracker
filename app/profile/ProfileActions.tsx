"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

async function getError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : "Не удалось выполнить операцию";
}

export function ProfileActions({ nickname }: { nickname: string }) {
  const router = useRouter();
  const [nextNickname, setNextNickname] = useState(nickname);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveNickname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname: nextNickname }),
      });
      if (!response.ok) throw new Error(await getError(response));
      setMessage("Minecraft-ник обновлён. История и вклад сохранены.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка соединения");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: form.get("current"), newPassword: form.get("next") }),
      });
      if (!response.ok) throw new Error(await getError(response));
      setMessage("Пароль изменён");
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка соединения");
    } finally {
      setBusy(false);
    }
  }

  async function logoutAll() {
    setBusy(true);
    try {
      await fetch("/api/account/logout-all", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-6">
    <form onSubmit={saveNickname} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div><h2 className="text-xl font-semibold">Minecraft-ник</h2><p className="mt-1 text-sm text-slate-400">Ник можно менять: вклад и история привязаны к аккаунту.</p></div>
      <label className="grid gap-2 text-sm text-slate-300">Новый ник<input value={nextNickname} onChange={(event) => setNextNickname(event.target.value)} minLength={3} maxLength={16} pattern="[A-Za-z0-9_]{3,16}" required className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" /></label>
      <button disabled={busy || nextNickname === nickname} className="rounded-full bg-emerald-400 px-5 py-2 font-semibold text-slate-950 disabled:opacity-40">Сохранить ник</button>
    </form>

    <form onSubmit={changePassword} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-semibold">Сменить пароль</h2>
      <input name="current" type="password" required autoComplete="current-password" placeholder="Текущий пароль" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
      <input name="next" type="password" required minLength={12} autoComplete="new-password" placeholder="Новый пароль (не менее 12 символов)" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
      <button disabled={busy} className="rounded-full bg-emerald-400 px-5 py-2 font-semibold text-slate-950 disabled:opacity-40">Сохранить пароль</button>
    </form>

    <button disabled={busy} onClick={() => void logoutAll()} className="rounded-full border border-rose-500 px-5 py-2 text-rose-300 disabled:opacity-40">Выйти со всех устройств</button>
    {message && <p role="status" aria-live="polite" className="text-sm text-slate-300">{message}</p>}
  </div>;
}
