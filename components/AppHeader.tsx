import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { LogoutButton } from "./LogoutButton";

export async function AppHeader() {
  const user = await getCurrentUser();
  if (!user) return null;
  return <header className="site-header">
    <nav aria-label="Основная навигация" className="site-nav glass-chrome">
      <Link href="/" className="site-brand" aria-label="Antville Builder — каталог">
        <span className="site-brand-mark" aria-hidden="true">A</span>
        <span className="site-brand-copy"><strong>Antville</strong><span>Builder 2.0</span></span>
      </Link>
      <div className="site-links" aria-label="Разделы">
        <Link href="/buildings/new" className="site-link">Новая постройка</Link>
        <Link href="/warehouse" className="site-link">Склад</Link>
        <Link href="/city-needs" className="site-link">Нужды города</Link>
        <Link href="/notifications" className="site-link">Уведомления</Link>
        {(user.role === "ADMIN" || user.role === "MODERATOR") && <Link href="/moderation" className="site-link site-admin-link">Модерация</Link>}
        {user.role === "ADMIN" && <Link href="/admin" className="site-link site-admin-link">Администрирование</Link>}
      </div>
      <div className="site-account">
        <Link href="/profile" className="site-account-name">{user.minecraftNickname}</Link>
        <LogoutButton />
      </div>
    </nav>
  </header>;
}
