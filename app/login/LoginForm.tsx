"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const [error, setError] = useState(""); const [pending, setPending] = useState(false); const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setPending(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: form.get("nickname"), password: form.get("password") }) });
    const result = await response.json(); setPending(false);
    if (!response.ok) return setError(result.error ?? "Не удалось войти");
    router.push(result.mustChangePassword ? "/profile?password=required" : "/"); router.refresh();
  }
  return (
    <form onSubmit={submit} className="glass-panel space-y-5 rounded-3xl p-6 sm:p-7">
      <label className="block text-sm font-medium text-slate-200">
        Minecraft-ник
        <input name="nickname" autoComplete="username" required className="glass-control mt-2 min-h-12 w-full rounded-xl px-4 py-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-300/25" />
      </label>
      <label className="block text-sm font-medium text-slate-200">
        Пароль
        <input name="password" type="password" autoComplete="current-password" required className="glass-control mt-2 min-h-12 w-full rounded-xl px-4 py-3 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-300/25" />
      </label>
      {error && <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-950/40 px-3 py-2 text-sm text-rose-100">{error}</p>}
      <button disabled={pending} className="glass-action-primary min-h-12 w-full rounded-xl px-5 disabled:cursor-wait disabled:opacity-50">{pending ? "Входим…" : "Войти"}</button>
    </form>
  );
}
