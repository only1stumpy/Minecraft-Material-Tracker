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
  return <form onSubmit={submit} className="space-y-5 rounded-3xl border border-slate-800 bg-slate-900 p-7"><label className="block text-sm text-slate-300">Minecraft-ник<input name="nickname" autoComplete="username" required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" /></label><label className="block text-sm text-slate-300">Пароль<input name="password" type="password" autoComplete="current-password" required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" /></label>{error && <p role="alert" className="text-sm text-rose-300">{error}</p>}<button disabled={pending} className="w-full rounded-full bg-emerald-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50">{pending ? "Входим…" : "Войти"}</button></form>;
}
