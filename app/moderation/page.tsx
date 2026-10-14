import Link from "next/link";

import { requireModerator } from "@/lib/auth";
import ModerationClient from "./ModerationClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Модерация" };

export default async function ModerationPage() {
  const actor = await requireModerator();

  return (
    <main className="min-h-screen px-6 py-10 text-slate-100 md:py-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 md:flex-row md:items-end md:justify-between md:p-8">
          <div>
            <Link href="/" className="text-sm text-emerald-300 hover:underline">← Вернуться в каталог</Link>
            <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">{actor.role === "ADMIN" ? "Администрирование" : "Модерация"}</p>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Центр модерации</h1>
            <p className="mt-3 max-w-3xl text-slate-300">Проверяйте карточки, очевидные дубли, комментарии и ошибки импорта из одного места.</p>
          </div>
          {actor.role === "ADMIN" && <Link href="/admin" className="w-fit rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-emerald-400">Управление аккаунтами</Link>}
        </header>
        <ModerationClient />
      </div>
    </main>
  );
}
