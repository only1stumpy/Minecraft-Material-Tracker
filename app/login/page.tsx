import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Вход" };
export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-12 text-white sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-7 flex items-center gap-3">
          <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl border border-rose-200/20 bg-gradient-to-br from-rose-900/70 to-[#110d11] text-lg font-bold text-rose-100 shadow-lg shadow-rose-950/40">A</span>
          <div>
            <p className="font-semibold tracking-tight">Antville Builder</p>
            <p className="glass-eyebrow mt-1">Доступ жителей · 2.0</p>
          </div>
        </div>
        <h1 className="mb-3 text-4xl font-semibold">С возвращением</h1>
        <p className="mb-7 text-slate-400">Войдите, чтобы следить за строительством и помогать городу.</p>
        <LoginForm />
        <p className="mt-5 text-center text-xs leading-5 text-slate-500">Регистрация закрыта. Получите аккаунт у администрации Антвилля.</p>
      </div>
    </main>
  );
}
