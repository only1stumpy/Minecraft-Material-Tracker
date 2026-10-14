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
    <form onSubmit={saveNickname} className="glass-panel space-y-5 rounded-3xl p-6">
      <div><p className="glass-eyebrow">Идентичность</p><h2 className="mt-2 text-xl font-semibold">Minecraft-ник</h2><p className="mt-1 text-sm text-[var(--muted)]">Ник можно менять: вклад и история привязаны к аккаунту.</p></div>
      <label className="grid gap-2 text-sm text-[var(--muted)]">Новый ник<input value={nextNickname} onChange={(event) => setNextNickname(event.target.value)} minLength={3} maxLength={16} pattern="[A-Za-z0-9_]{3,16}" required className="glass-control w-full rounded-xl px-4 py-3" /></label>
      <button disabled={busy || nextNickname === nickname} className="glass-action-primary w-fit rounded-xl px-5 py-2.5 disabled:opacity-40">Сохранить ник</button>
    </form>

    <form onSubmit={changePassword} className="glass-panel space-y-5 rounded-3xl p-6">
      <div><p className="glass-eyebrow">Доступ</p><h2 className="mt-2 text-xl font-semibold">Сменить пароль</h2></div>
      <input name="current" type="password" required autoComplete="current-password" placeholder="Текущий пароль" className="glass-control w-full rounded-xl px-4 py-3" />
      <input name="next" type="password" required minLength={12} autoComplete="new-password" placeholder="Новый пароль (не менее 12 символов)" className="glass-control w-full rounded-xl px-4 py-3" />
      <button disabled={busy} className="glass-action-primary w-fit rounded-xl px-5 py-2.5 disabled:opacity-40">Сохранить пароль</button>
    </form>

    <div className="flex flex-wrap items-center gap-4">
      <button disabled={busy} onClick={() => void logoutAll()} className="rounded-xl border border-rose-500/55 bg-rose-950/20 px-5 py-2.5 text-rose-200 transition hover:bg-rose-950/40 disabled:opacity-40">Выйти со всех устройств</button>
      {message && <p role="status" aria-live="polite" className="text-sm text-[var(--muted)]">{message}</p>}
    </div>
  </div>;
}
