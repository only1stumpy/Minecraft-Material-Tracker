import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Вход" };
export default async function LoginPage() { if (await getCurrentUser()) redirect("/"); return <main className="min-h-screen bg-slate-950 px-6 py-20 text-white"><div className="mx-auto max-w-md"><p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-300">Antville Builder</p><h1 className="mb-3 text-4xl font-semibold">Вход для жителей</h1><p className="mb-8 text-slate-400">Регистрация закрыта. Получите аккаунт у администрации Антвилля.</p><LoginForm /></div></main>; }
