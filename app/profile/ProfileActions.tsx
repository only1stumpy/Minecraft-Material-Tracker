"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

async function getError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : "Не удалось выполнить операцию";
}

export function ProfileActions({ nickname, mustChangePassword = false }: { nickname: string; mustChangePassword?: boolean }) {
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
    const form = event.currentTarget;
    setBusy(true);
    setMessage("");
    try {
      const formData = new FormData(form);
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: formData.get("current"), newPassword: formData.get("next") }),
      });
      if (!response.ok) throw new Error(await getError(response));
      setMessage("Пароль изменён");
      form.reset();
      if (mustChangePassword) router.refresh();
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

  if (mustChangePassword) {
    return <RequiredPasswordDialog nickname={nickname} busy={busy} message={message} onSubmit={changePassword} />;
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
      <input name="next" type="password" required minLength={8} autoComplete="new-password" placeholder="Новый пароль (не менее 8 символов)" className="glass-control w-full rounded-xl px-4 py-3" />
      <button disabled={busy} className="glass-action-primary w-fit rounded-xl px-5 py-2.5 disabled:opacity-40">Сохранить пароль</button>
    </form>

    <div className="flex flex-wrap items-center gap-4">
      <button disabled={busy} onClick={() => void logoutAll()} className="rounded-xl border border-rose-500/55 bg-rose-950/20 px-5 py-2.5 text-rose-200 transition hover:bg-rose-950/40 disabled:opacity-40">Выйти со всех устройств</button>
      {message && <p role="status" aria-live="polite" className="text-sm text-[var(--muted)]">{message}</p>}
    </div>
  </div>;
}

function RequiredPasswordDialog({
  nickname,
  busy,
  message,
  onSubmit,
}: {
  nickname: string;
  busy: boolean;
  message: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    try {
      dialog.removeAttribute("open");
      dialog.showModal();
    } catch {
      // Keep the server-rendered open dialog visible if modal mode is unavailable.
      dialog.setAttribute("open", "");
    }

    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      open
      aria-labelledby="required-password-title"
      aria-describedby="required-password-description"
      onCancel={(event) => event.preventDefault()}
      className="fixed left-1/2 top-1/2 right-auto bottom-auto m-0 min-h-[calc(100dvh_-_2rem)] max-h-[calc(100dvh_-_2rem)] w-[calc(100vw_-_2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[2rem] border border-rose-200/30 bg-[#160d13]/[.97] p-0 text-white shadow-[0_32px_120px_rgba(104,18,52,.48)] backdrop:bg-[#070509]/90 backdrop:backdrop-blur-md"
    >
      <div className="relative flex min-h-[calc(100dvh_-_2rem)] flex-col justify-between overflow-hidden p-6 sm:p-10 md:p-14">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-rose-500/20 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-20 size-80 rounded-full bg-fuchsia-950/30 blur-3xl" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
            <span aria-hidden="true" className="size-2 rounded-full bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,.85)]" />
            Нужно действие
          </div>
          <h1 id="required-password-title" className="mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-rose-50 sm:text-5xl">
            Замените временный пароль
          </h1>
          <p id="required-password-description" className="mt-5 max-w-2xl text-base leading-7 text-rose-100/75 sm:text-lg">
            Этот аккаунт получил временный пароль. Чтобы открыть каталог и рабочие разделы, сначала задайте свой пароль.
          </p>
        </div>

        <form onSubmit={onSubmit} className="relative mt-10 space-y-5 rounded-3xl border border-rose-200/15 bg-black/20 p-5 sm:p-7">
          <div>
            <p className="text-sm font-semibold text-rose-50">Новый пароль для {nickname}</p>
            <p className="mt-1 text-sm text-rose-100/60">Не короче 8 символов, с буквой и цифрой.</p>
          </div>
          <label className="grid gap-2 text-sm text-rose-100/75">
            Текущий временный пароль
            <input name="current" type="password" required autoFocus autoComplete="current-password" className="glass-control w-full rounded-xl px-4 py-3 text-base" />
          </label>
          <label className="grid gap-2 text-sm text-rose-100/75">
            Новый пароль
            <input name="next" type="password" required minLength={8} autoComplete="new-password" className="glass-control w-full rounded-xl px-4 py-3 text-base" />
          </label>
          <button disabled={busy} className="glass-action-primary w-full rounded-xl px-5 py-3.5 text-base font-semibold disabled:cursor-wait disabled:opacity-50">
            {busy ? "Сохраняем…" : "Сохранить новый пароль"}
          </button>
          {message && <p role="alert" aria-live="polite" className="rounded-xl border border-rose-300/25 bg-rose-950/35 p-3 text-sm text-rose-100">{message}</p>}
        </form>
      </div>
    </dialog>
  );
}
