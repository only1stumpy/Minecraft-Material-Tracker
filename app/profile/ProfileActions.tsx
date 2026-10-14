"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function ProfileActions() {
  const [message, setMessage] = useState(""); const router = useRouter();
  async function password(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const r = await fetch("/api/account/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: form.get("current"), newPassword: form.get("next") }) }); const data = await r.json(); setMessage(r.ok ? "Пароль изменён" : data.error); if (r.ok) (event.target as HTMLFormElement).reset(); }
  return <div className="space-y-6"><form onSubmit={password} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6"><h2 className="text-xl font-semibold">Сменить пароль</h2><input name="current" type="password" required placeholder="Текущий пароль" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"/><input name="next" type="password" required minLength={12} placeholder="Новый пароль (не менее 12 символов)" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"/><button className="rounded-full bg-emerald-400 px-5 py-2 font-semibold text-slate-950">Сохранить</button>{message && <p role="status" className="text-sm text-slate-300">{message}</p>}</form><button onClick={async () => { await fetch("/api/account/logout-all", { method: "POST" }); router.push("/login"); router.refresh(); }} className="rounded-full border border-rose-500 px-5 py-2 text-rose-300">Выйти со всех устройств</button></div>;
}
