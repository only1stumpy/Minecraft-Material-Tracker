import Link from "next/link";
import { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatQuantity } from "@/lib/quantity-values";
import {
  PROFILE_ACTIVITY_ORDER,
  PROFILE_ACTIVITY_PAGE_SIZE,
  parseProfileActivityPage,
  splitProfileActivityPage,
} from "@/lib/profile-history";
import { ProfileActions } from "./ProfileActions";

export const metadata = { title: "Профиль" };
export const dynamic = "force-dynamic";

type PageSearchParams = Record<string, string | string[] | undefined>;

const ROLE_LABELS = { ADMIN: "Администратор", MODERATOR: "Модератор", PLAYER: "Игрок" } as const;
const ACTIVITY_LABELS = {
  RESERVED: "взял в работу",
  RELEASED: "освободил резерв",
  GATHERED: "собрал",
  DELIVERED: "доставил",
  CORRECTED: "скорректировал сбор",
} as const;

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const activityPage = parseProfileActivityPage(params.activityPage);
  const [createdBuildings, involvedBuildings, contributionTotals, completedTasks, activityRows, auditCount] = await Promise.all([
    prisma.building.count({ where: { ownerId: user.id, deletedAt: null } }),
    prisma.building.count({ where: { deletedAt: null, materials: { some: { contributions: { some: { userId: user.id } } } } } }),
    prisma.$queryRaw<Array<{ gatheredQty: string; deliveredQty: string }>>(Prisma.sql`
      SELECT
        COALESCE(SUM("gatheredQty"::numeric), 0)::text AS "gatheredQty",
        COALESCE(SUM("deliveredQty"::numeric), 0)::text AS "deliveredQty"
      FROM "MaterialContribution"
      WHERE "userId" = ${user.id}
    `),
    prisma.buildingTask.count({ where: { assigneeId: user.id, status: "DONE" } }),
    prisma.materialActivity.findMany({
      where: { actorId: user.id },
      orderBy: PROFILE_ACTIVITY_ORDER,
      skip: (activityPage - 1) * PROFILE_ACTIVITY_PAGE_SIZE,
      take: PROFILE_ACTIVITY_PAGE_SIZE + 1,
      select: {
        id: true,
        kind: true,
        quantityDelta: true,
        createdAt: true,
        material: { select: { name: true, building: { select: { id: true, name: true } } } },
      },
    }),
    prisma.auditLog.count({ where: { actorId: user.id } }),
  ]);
  const { rows: activity, hasNextPage } = splitProfileActivityPage(activityRows);
  const gatheredTotal = contributionTotals[0]?.gatheredQty ?? "0";
  const deliveredTotal = contributionTotals[0]?.deliveredQty ?? "0";
  const activityHref = (page: number) => page <= 1 ? "/profile" : `/profile?activityPage=${page}`;

  return <main className="min-h-screen px-4 py-10 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-5xl space-y-8">
    <Link href="/" className="text-sm text-rose-200 hover:text-rose-100 hover:underline">← Каталог</Link>
    <header className="glass-panel rounded-[2rem] p-6 md:p-8"><p className="glass-eyebrow">Профиль игрока</p><h1 className="mt-3 text-4xl font-semibold md:text-5xl">{user.minecraftNickname}</h1><p className="mt-2 text-[var(--muted)]">Роль: {ROLE_LABELS[user.role]}</p></header>
    {user.mustChangePassword && <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4 text-amber-200">Смените временный пароль перед продолжением работы.</div>}
    <section aria-label="Статистика игрока" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Stat value={createdBuildings} label="создано построек" />
      <Stat value={involvedBuildings} label="проектов с вашим вкладом" />
      <Stat value={formatQuantity(gatheredTotal)} label="предметов собрано" />
      <Stat value={formatQuantity(deliveredTotal)} label="предметов доставлено" />
      <Stat value={completedTasks} label="заданий выполнено" />
      <Stat value={auditCount} label="действий в журнале" />
    </section>

    <section className="glass-panel space-y-4 rounded-3xl p-5">
      <div><p className="glass-eyebrow">История</p><h2 className="mt-2 text-xl font-semibold">История операций</h2></div>
      {activity.length === 0 ? <p className="text-sm text-[var(--muted)]">{activityPage === 1 ? "Пока нет операций со сбором материалов." : "На этой странице записей нет."}</p> : <ul className="divide-y divide-white/8">{activity.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
        <span>{ACTIVITY_LABELS[item.kind]} {Math.abs(item.quantityDelta).toLocaleString("ru-RU")} × {item.material.name} · <Link href={`/buildings/${item.material.building.id}`} className="text-rose-200 hover:text-rose-100 hover:underline">{item.material.building.name}</Link></span>
        <time className="text-[var(--muted-strong)]">{item.createdAt.toLocaleString("ru-RU")}</time>
      </li>)}</ul>}
      {(activityPage > 1 || hasNextPage) && <nav aria-label="Страницы истории операций" className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4 text-sm">
        {activityPage > 1 ? <Link rel="prev" href={activityHref(activityPage - 1)} className="text-rose-200 hover:text-rose-100 hover:underline">← Новее</Link> : <span aria-disabled="true" className="text-[var(--muted-strong)]">← Новее</span>}
        <span className="text-[var(--muted-strong)]">Страница {activityPage}{hasNextPage ? " · есть ещё" : " · конец истории"}</span>
        {hasNextPage ? <Link rel="next" href={activityHref(activityPage + 1)} className="text-rose-200 hover:text-rose-100 hover:underline">Старше →</Link> : <span aria-disabled="true" className="text-[var(--muted-strong)]">Старше →</span>}
      </nav>}
    </section>
    <ProfileActions nickname={user.minecraftNickname} />
  </div></main>;
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return <div className="glass-panel-soft rounded-2xl p-5"><b className="text-3xl text-rose-100">{value}</b><p className="mt-1 text-[var(--muted)]">{label}</p></div>;
}
