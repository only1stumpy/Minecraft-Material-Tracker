import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Вход" };
export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-12 text-white sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 space-y-2">
          <p className="font-display text-lg text-white">Antville Builder</p>
          <p className="text-sm leading-6 text-slate-400">Совместное управление строительством Антвилля.</p>
        </div>
        <h1 className="mb-3 text-4xl font-semibold">С возвращением</h1>
        <p className="mb-7 text-slate-400">Войдите, чтобы следить за строительством и помогать городу.</p>
        <LoginForm />
        <p className="mt-5 text-center text-xs leading-5 text-slate-500">Регистрация закрыта. Получите аккаунт у администрации Антвилля.</p>
      </div>
    </main>
  );
}
