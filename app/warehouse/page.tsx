import Link from "next/link";

import { requireReadyUser } from "@/lib/auth";
import { canModerateContent } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

import WarehouseClient, { type WarehouseStockView } from "./WarehouseClient";

export const dynamic = "force-dynamic";

export default async function WarehousePage() {
  const actor = await requireReadyUser();
  const stocks = await prisma.warehouseStock.findMany({
    orderBy: { itemName: "asc" },
    take: 500,
    select: {
      id: true,
      itemName: true,
      normalizedName: true,
      stackSize: true,
      quantity: true,
      reserved: true,
      updatedAt: true,
      reservations: {
        where: { userId: actor.id, releasedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, operationId: true, quantity: true, createdAt: true },
      },
      movements: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          kind: true,
          delta: true,
          note: true,
          createdAt: true,
          actor: { select: { minecraftNickname: true } },
        },
      },
    },
  });

  const initialStocks: WarehouseStockView[] = stocks.map((stock) => ({
    id: stock.id,
    itemName: stock.itemName,
    normalizedName: stock.normalizedName,
    stackSize: stock.stackSize,
    quantity: stock.quantity,
    reserved: stock.reserved,
    available: Math.max(0, stock.quantity - stock.reserved),
    updatedAt: stock.updatedAt.toISOString(),
    reservations: stock.reservations.map((reservation) => ({
      id: reservation.id,
      operationId: reservation.operationId,
      quantity: reservation.quantity,
      createdAt: reservation.createdAt.toISOString(),
    })),
    movements: stock.movements.map((movement) => ({
      id: movement.id,
      kind: movement.kind,
      delta: movement.delta,
      note: movement.note,
      createdAt: movement.createdAt.toISOString(),
      actorName: movement.actor.minecraftNickname,
    })),
  }));

  return (
    <main className="min-h-screen px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="glass-panel flex flex-wrap items-start justify-between gap-4 rounded-[2rem] p-6 md:p-8">
          <div>
            <Link href="/" className="text-sm text-rose-200 hover:text-rose-100 hover:underline">← В каталог</Link>
            <p className="glass-eyebrow mt-6">Материальный контур</p>
            <h1 className="mt-2 text-4xl font-semibold text-white md:text-5xl">Общий склад</h1>
            <p className="mt-2 max-w-2xl text-[var(--muted)]">Остатки города и журнал движений материалов.</p>
          </div>
          <Link href="/city-needs" className="glass-control rounded-xl px-4 py-2 text-sm text-rose-100 hover:border-rose-300/70">Потребности города →</Link>
        </header>
        <WarehouseClient initialStocks={initialStocks} canManage={canModerateContent(actor)} />
      </div>
    </main>
  );
}
