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
      _sum: { gatheredQty: true, deliveredQty: true },
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
    deliveredQty: asSafeTotal(row._sum.deliveredQty),
  }]));
  const usersWithTotals = users.map((user) => ({
    ...user,
    gatheredQty: contributionByUserId.get(user.id)?.gatheredQty ?? 0,
    deliveredQty: contributionByUserId.get(user.id)?.deliveredQty ?? 0,
  }));
  return <main className="min-h-screen bg-slate-950 px-6 py-12 text-white"><div className="mx-auto max-w-7xl space-y-10"><header><p className="text-amber-300">Только для администрации</p><h1 className="text-4xl font-semibold">Управление платформой</h1></header><section><h2 className="mb-4 text-2xl font-semibold">Пользователи</h2><AdminUsers users={usersWithTotals} actorId={actor.id}/></section><section><h2 className="mb-4 text-2xl font-semibold">Постройки</h2><div className="divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900">{buildings.map((building: ManagedBuilding) => <div key={building.id} className="flex flex-wrap items-center gap-4 p-4"><Link href={`/buildings/${building.id}`} className="font-semibold text-emerald-300">{building.name}</Link><span className="text-sm text-slate-400">{building.owner?.minecraftNickname ?? "Владелец не назначен"}</span>{building.deletedAt && <span className="text-sm text-rose-300">скрыта</span>}<span className="flex-1"/><BuildingAdminActions id={building.id} deleted={Boolean(building.deletedAt)}/></div>)}</div></section><section><h2 className="mb-4 text-2xl font-semibold">Последние важные действия</h2><div className="divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900">{audit.map((log: AuditEntry) => <div key={log.id} className="flex justify-between gap-4 p-4 text-sm"><span>{log.actor?.minecraftNickname ?? "Система"}: {log.action} · {log.entityType}</span><time className="text-slate-400">{log.createdAt.toLocaleString("ru-RU")}</time></div>)}</div></section></div></main>;
}
