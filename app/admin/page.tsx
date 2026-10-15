import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdminUsers } from "./AdminUsers";
import { BuildingAdminActions } from "./BuildingAdminActions";

export const metadata = { title: "Администрирование" };

type ManagedBuilding = { id: string; name: string; deletedAt: Date | null; owner: { minecraftNickname: string } | null };
type AuditEntry = { id: string; action: string; entityType: string; createdAt: Date; actor: { minecraftNickname: string } | null };

const asSafeTotal = (value: number | null) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;

export default async function AdminPage() {
  const actor = await requireAdmin();
  const [users, contributionTotals, buildings, audit] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        minecraftNickname: true,
        role: true,
        isBlocked: true,
        createdAt: true,
        lastActiveAt: true,
        _count: { select: { buildings: true } },
      },
    }),
    prisma.materialContribution.groupBy({
      by: ["userId"],
      _sum: { gatheredQty: true },
    }),
    prisma.building.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, deletedAt: true, owner: { select: { minecraftNickname: true } } },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, action: true, entityType: true, createdAt: true, actor: { select: { minecraftNickname: true } } },
    }),
  ]);
  const contributionByUserId = new Map(contributionTotals.map((row) => [row.userId, {
    gatheredQty: asSafeTotal(row._sum.gatheredQty),
  }]));
  const usersWithTotals = users.map((user) => ({
    ...user,
    gatheredQty: contributionByUserId.get(user.id)?.gatheredQty ?? 0,
  }));
  return <main className="min-h-screen px-4 py-10 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl space-y-10"><header className="glass-panel rounded-[2rem] p-6 md:p-8"><p className="glass-eyebrow">Только для администрации</p><h1 className="mt-3 text-4xl font-semibold md:text-5xl">Управление платформой</h1><p className="mt-3 max-w-2xl text-[var(--muted)]">Аккаунты, карточки и журнал действий в одном контрольном слое.</p></header><section><div className="mb-4 flex items-end justify-between gap-4"><div><p className="glass-eyebrow">Команда</p><h2 className="mt-2 text-2xl font-semibold">Пользователи</h2></div><span className="glass-pill rounded-full px-3 py-1 text-xs">{usersWithTotals.length} аккаунтов</span></div><AdminUsers users={usersWithTotals} actorId={actor.id}/></section><section><div className="mb-4"><p className="glass-eyebrow">Контент</p><h2 className="mt-2 text-2xl font-semibold">Постройки</h2></div><div className="glass-panel divide-y divide-white/8 overflow-hidden rounded-3xl">{buildings.map((building: ManagedBuilding) => <div key={building.id} className="flex flex-wrap items-center gap-4 p-4 transition hover:bg-white/[0.025]"><Link href={`/buildings/${building.id}`} className="font-semibold text-rose-200 hover:text-rose-100 hover:underline">{building.name}</Link><span className="text-sm text-[var(--muted)]">{building.owner?.minecraftNickname ?? "Владелец не назначен"}</span>{building.deletedAt && <span className="rounded-full border border-rose-400/40 bg-rose-950/35 px-2 py-0.5 text-xs text-rose-200">скрыта</span>}<span className="flex-1"/><BuildingAdminActions id={building.id} deleted={Boolean(building.deletedAt)}/></div>)}</div></section><section><div className="mb-4"><p className="glass-eyebrow">Аудит</p><h2 className="mt-2 text-2xl font-semibold">Последние важные действия</h2></div><div className="glass-panel divide-y divide-white/8 overflow-hidden rounded-3xl">{audit.map((log: AuditEntry) => <div key={log.id} className="flex flex-wrap justify-between gap-4 p-4 text-sm"><span>{log.actor?.minecraftNickname ?? "Система"}: {log.action} · {log.entityType}</span><time className="text-[var(--muted)]">{log.createdAt.toLocaleString("ru-RU")}</time></div>)}</div></section></div></main>;
}
