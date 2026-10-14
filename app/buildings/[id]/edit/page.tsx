import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import BuildingForm from "../../BuildingForm";
import { requireReadyUser } from "@/lib/auth";
import { canManageBuilding, canModerateContent } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Редактирование постройки" };

export default async function EditBuildingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireReadyUser();
  const building = await prisma.building.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      version: true,
      name: true,
      description: true,
      x: true,
      y: true,
      z: true,
      status: true,
      schematicPath: true,
      schematicFileName: true,
      screenshotPath: true,
      legacyScreenshotDataUrl: true,
      materialsFileName: true,
      ownerId: true,
      responsibleId: true,
      materials: {
        where: { isArchived: false },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { name: true, requiredQty: true, stackSize: true, allowSurplus: true },
      },
      _count: { select: { materials: true } },
    },
  });
  if (!building) notFound();
  if (!canManageBuilding(user, { ownerId: building.ownerId })) redirect(`/buildings/${encodeURIComponent(id)}`);

  const assignableUsers = await prisma.user.findMany({
    where: { isBlocked: false },
    orderBy: { minecraftNickname: "asc" },
    select: { id: true, minecraftNickname: true },
  });

  const gathered = await prisma.materialContribution.aggregate({
    where: { material: { buildingId: id } },
    _sum: { gatheredQty: true },
  });

  return <main className="min-h-screen px-6 py-10 text-slate-100 md:py-12"><div className="mx-auto max-w-5xl space-y-7"><Link href={`/buildings/${building.id}`} className="text-sm text-emerald-300 hover:underline">← К постройке</Link><header><h1 className="text-4xl font-semibold text-white">Редактирование</h1><p className="mt-2 text-slate-400">Изменения создают версию карточки; вклад игроков и история материалов остаются привязаны к стабильным ID.</p></header><BuildingForm userId={user.id} assignableUsers={assignableUsers} canChangeOwner={canModerateContent(user)} hasProgress={(gathered._sum.gatheredQty ?? 0) > 0} initial={{ id: building.id, version: building.version, name: building.name, description: building.description ?? "", x: building.x, y: building.y, z: building.z, status: building.status, schematicPath: building.schematicPath, schematicFileName: building.schematicFileName, screenshotPath: building.screenshotPath, legacyScreenshotDataUrl: building.legacyScreenshotDataUrl, materialsFileName: building.materialsFileName, materials: building.materials, ownerId: building.ownerId, responsibleId: building.responsibleId }} /></div></main>;
}
