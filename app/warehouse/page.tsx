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
      updatedAt: true,
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
    updatedAt: stock.updatedAt.toISOString(),
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
    <main className="min-h-screen px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/" className="text-sm text-emerald-300 hover:underline">← В каталог</Link>
            <h1 className="mt-3 text-4xl font-semibold text-white">Общий склад</h1>
            <p className="mt-2 max-w-2xl text-slate-400">Остатки города и журнал движений материалов.</p>
          </div>
          <Link href="/city-needs" className="rounded-full border border-emerald-500/50 px-4 py-2 text-sm text-emerald-200 hover:border-emerald-300">Потребности города →</Link>
        </header>
        <WarehouseClient initialStocks={initialStocks} canManage={canModerateContent(actor)} />
      </div>
    </main>
  );
}
