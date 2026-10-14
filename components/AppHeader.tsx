import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { LogoutButton } from "./LogoutButton";

export async function AppHeader() {
  const user = await getCurrentUser();
  if (!user) return null;
  return <header className="border-b border-slate-800 bg-slate-950/95"><nav aria-label="Основная навигация" className="mx-auto flex max-w-7xl items-center gap-5 px-6 py-4"><Link href="/" className="font-semibold text-emerald-300">Antville Builder</Link><Link href="/buildings/new" className="text-sm text-slate-300 hover:text-white">Новая постройка</Link><span className="flex-1" />{user.role === "ADMIN" && <Link href="/admin" className="text-sm text-amber-300">Админ-панель</Link>}<Link href="/profile" className="text-sm text-slate-300 hover:text-white">{user.minecraftNickname}</Link><LogoutButton /></nav></header>;
}
