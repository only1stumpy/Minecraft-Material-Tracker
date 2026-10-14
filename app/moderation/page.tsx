import Link from "next/link";

import { requireModerator } from "@/lib/auth";
import ModerationClient from "./ModerationClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Модерация" };

export default async function ModerationPage() {
  const actor = await requireModerator();

  return (
    <main className="min-h-screen px-4 py-10 text-slate-100 sm:px-6 md:py-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="glass-panel flex flex-col gap-4 rounded-[2rem] p-6 md:flex-row md:items-end md:justify-between md:p-8">
          <div>
            <Link href="/" className="text-sm text-rose-200 hover:text-rose-100 hover:underline">← Вернуться в каталог</Link>
            <p className="glass-eyebrow mt-6">{actor.role === "ADMIN" ? "Администрирование" : "Модерация"}</p>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">Центр модерации</h1>
            <p className="mt-3 max-w-3xl text-[var(--muted)]">Проверяйте карточки, очевидные дубли, комментарии и ошибки импорта из одного места.</p>
          </div>
          {actor.role === "ADMIN" && <Link href="/admin" className="glass-control w-fit rounded-xl px-4 py-2 text-sm text-slate-200">Управление аккаунтами</Link>}
        </header>
        <ModerationClient />
      </div>
    </main>
  );
}
