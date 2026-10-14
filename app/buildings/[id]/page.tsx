import Link from "next/link";
import Image from "next/image";

import BuildingChecklist from "./BuildingChecklist";
import { prisma } from "@/lib/prisma";
import type { MaterialRow } from "@/lib/materials";

export const dynamic = "force-dynamic";

export default async function BuildingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const building = await prisma.building.findUnique({
    where: { id, deletedAt: null },
  });

  if (!building) {
    return (
      <div className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <div className="mx-auto max-w-4xl space-y-6">
          <Link href="/" className="text-sm text-emerald-300 hover:underline">
            ← Вернуться к списку
          </Link>
          <h1 className="text-3xl font-semibold">Постройка не найдена</h1>
          <p className="text-slate-400">
            Такой страницы нет в базе данных. Проверьте ссылку или создайте новую
            постройку.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <Link href="/" className="text-sm text-emerald-300 hover:underline">
          ← Вернуться к списку
        </Link>

        <header className="space-y-4">
          <h1 className="text-4xl font-semibold text-white">{building.name}</h1>
          <div className="flex flex-wrap gap-4 text-sm text-slate-300">
            <span>Координаты: {building.x}</span>
            <span>{building.y}</span>
            <span>{building.z}</span>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-slate-400">
            <span>Схема: {building.schematicFileName}</span>
            <span>Материалы: {building.materialsFileName}</span>
          </div>
        </header>

        {building.screenshotDataUrl ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-lg font-semibold">Скриншот постройки</h2>
            <Image
              src={building.screenshotDataUrl}
              alt={`Скриншот постройки ${building.name}`}
              width={1200}
              height={675}
              unoptimized
              className="mt-4 w-full rounded-2xl object-cover"
            />
          </section>
        ) : null}

        <BuildingChecklist materials={building.materials as MaterialRow[]} />
      </main>
    </div>
  );
}
