import Link from "next/link";

import { requireReadyUser } from "@/lib/auth";
import { normalizeMaterialName } from "@/lib/materials";
import { prisma } from "@/lib/prisma";

import CityNeedsClient, { type CityNeedView } from "./CityNeedsClient";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["DRAFT", "PLANNED", "COLLECTING", "READY", "BUILDING"] as const;
const MAX_INT = 2_147_483_647;

type Aggregate = {
  name: string;
  normalizedName: string;
  required: number;
  gathered: number;
  delivered: number;
  covered: number;
  projects: Map<string, CityNeedView["projects"][number]>;
};

const addQuantity = (left: number, right: number) => Math.min(Number.MAX_SAFE_INTEGER, left + Math.max(0, right));

const statusLabels: Record<(typeof ACTIVE_STATUSES)[number], string> = {
  DRAFT: "Черновик",
  PLANNED: "Запланировано",
  COLLECTING: "Сбор ресурсов",
  READY: "Готово к строительству",
  BUILDING: "Строится",
};

export default async function CityNeedsPage() {
  await requireReadyUser();

  const [materials, stocks] = await Promise.all([
    prisma.material.findMany({
      where: {
        isArchived: false,
        building: { deletedAt: null, status: { in: [...ACTIVE_STATUSES] } },
      },
      orderBy: [{ normalizedName: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        normalizedName: true,
        requiredQty: true,
        building: { select: { id: true, name: true, status: true } },
        contributions: { select: { gatheredQty: true, deliveredQty: true } },
      },
    }),
    prisma.warehouseStock.findMany({
      select: { normalizedName: true, quantity: true },
    }),
  ]);

  const stockByName = new Map(stocks.map((stock) => [stock.normalizedName, Math.max(0, stock.quantity)]));
  const aggregate = new Map<string, Aggregate>();

  for (const material of materials) {
    const normalizedName = material.normalizedName || normalizeMaterialName(material.name);
    if (!normalizedName) continue;
    const current = aggregate.get(normalizedName) ?? {
      name: material.name,
      normalizedName,
      required: 0,
      gathered: 0,
      delivered: 0,
      covered: 0,
      projects: new Map(),
    };
    const gathered = material.contributions.reduce((sum, contribution) => addQuantity(sum, contribution.gatheredQty), 0);
    const delivered = material.contributions.reduce((sum, contribution) => addQuantity(sum, contribution.deliveredQty), 0);
    const projectRemaining = Math.max(0, material.requiredQty - Math.max(gathered, delivered));
    current.required = addQuantity(current.required, Math.max(0, material.requiredQty));
    current.gathered = addQuantity(current.gathered, gathered);
    current.delivered = addQuantity(current.delivered, delivered);
    current.covered = addQuantity(current.covered, Math.max(gathered, delivered));
    current.projects.set(material.id, {
      materialId: material.id,
      buildingId: material.building.id,
      buildingName: material.building.name,
      status: material.building.status,
      statusLabel: statusLabels[material.building.status as (typeof ACTIVE_STATUSES)[number]] ?? material.building.status,
      required: material.requiredQty,
      gathered,
      delivered,
      remaining: projectRemaining,
    });
    aggregate.set(normalizedName, current);
  }

  const needs: CityNeedView[] = [...aggregate.values()].map((row) => {
    const covered = row.covered;
    const projectRemaining = Math.max(0, row.required - covered);
    const warehouseQuantity = stockByName.get(row.normalizedName) ?? 0;
    return {
      name: row.name,
      normalizedName: row.normalizedName,
      required: Math.min(MAX_INT, row.required),
      gathered: Math.min(MAX_INT, row.gathered),
      delivered: Math.min(MAX_INT, row.delivered),
      covered: Math.min(MAX_INT, covered),
      projectRemaining: Math.min(MAX_INT, projectRemaining),
      warehouseQuantity: Math.min(MAX_INT, warehouseQuantity),
      needed: Math.min(MAX_INT, Math.max(0, projectRemaining - warehouseQuantity)),
      projects: [...row.projects.values()].sort((left, right) => left.buildingName.localeCompare(right.buildingName, "ru")),
    };
  }).sort((left, right) => right.needed - left.needed || left.name.localeCompare(right.name, "ru"));

  return (
    <main className="min-h-screen px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/" className="text-sm text-emerald-300 hover:underline">← В каталог</Link>
            <h1 className="mt-3 text-4xl font-semibold text-white">Потребности города</h1>
            <p className="mt-2 max-w-3xl text-slate-400">Остаток рассчитывается по активным постройкам. Собранное и доставленное покрытие не складываются повторно, затем вычитается общий склад.</p>
          </div>
          <Link href="/warehouse" className="rounded-full border border-emerald-500/50 px-4 py-2 text-sm text-emerald-200 hover:border-emerald-300">← Общий склад</Link>
        </header>
        <CityNeedsClient initialNeeds={needs} />
      </div>
    </main>
  );
}
