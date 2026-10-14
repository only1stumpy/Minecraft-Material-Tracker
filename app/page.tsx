import Link from "next/link";

import type { MaterialRow } from "@/lib/materials";
import { prisma } from "@/lib/prisma";

const numberFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 2,
});

const sumMaterials = (materials: MaterialRow[]) =>
  materials.reduce((sum, row) => sum + row.total, 0);

export const dynamic = "force-dynamic";

export default async function Home() {
  const buildings = await prisma.buildings.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12">
        <header className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Antville Builder
          </p>
          <h1 className="text-4xl font-semibold text-white md:text-5xl">
            Каталог построек Антвилля
          </h1>
          <p className="max-w-3xl text-base text-slate-300 md:text-lg">
            Все постройки доступны по ссылкам. Добавляйте новые карточки, чтобы
            поделиться чек-листом материалов с жителями.
          </p>
          <Link
            href="/buildings/new"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300"
          >
            + Добавить постройку
          </Link>
        </header>

        {buildings.length === 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 text-sm text-slate-300">
            Пока нет ни одной постройки. Нажмите «Добавить постройку», чтобы
            создать первую страницу.
          </div>
        ) : (
          <div className="grid gap-4">
            {buildings.map((building) => {
              const totalBlocks = sumMaterials(
                building.materials as MaterialRow[],
              );
              return (
                <Link
                  key={building.id}
                  href={`/buildings/${building.id}`}
                  className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 transition hover:border-emerald-400/60"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-white">
                        {building.name}
                      </h2>
                      <p className="text-sm text-slate-400">
                        Координаты: {building.x}, {building.y}, {building.z}
                      </p>
                    </div>
                    <div className="text-sm text-slate-300">
                      Всего блоков: {numberFormatter.format(totalBlocks)}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                    <span>Схема: {building.schematicFileName}</span>
                    <span>Материалы: {building.materialsFileName}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
