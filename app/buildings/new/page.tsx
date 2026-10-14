import Link from "next/link";

import BuildingForm from "../BuildingForm";
import { requireReadyUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Новая постройка" };

export default async function NewBuildingPage() {
  const user = await requireReadyUser();
  const assignableUsers = await prisma.user.findMany({
    where: { isBlocked: false },
    orderBy: { minecraftNickname: "asc" },
    select: { id: true, minecraftNickname: true },
  });
  return <main className="min-h-screen px-4 py-8 text-slate-100 sm:px-6 md:py-12"><div className="mx-auto max-w-5xl space-y-8"><Link href="/" className="inline-flex text-sm text-rose-200 transition hover:text-white hover:underline">← Вернуться к каталогу</Link><header className="space-y-3"><p className="glass-eyebrow">Antville Builder 2.0</p><h1 className="text-4xl font-semibold text-white md:text-5xl">Новая постройка</h1><p className="max-w-3xl text-slate-400">Координаты, схема и скриншот необязательны. Список ресурсов можно загрузить, вставить или собрать вручную.</p></header><BuildingForm userId={user.id} assignableUsers={assignableUsers} initial={{ name: "", description: "", x: null, y: null, z: null, status: "DRAFT", schematicPath: null, schematicFileName: null, screenshotPath: null, materialsFileName: null, materials: [], ownerId: user.id, responsibleId: null }} /></div></main>;
}
