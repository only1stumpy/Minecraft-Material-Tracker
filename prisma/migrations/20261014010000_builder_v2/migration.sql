ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MODERATOR';

CREATE TYPE "BuildingStatus" AS ENUM (
  'DRAFT', 'PLANNED', 'COLLECTING', 'READY', 'BUILDING', 'COMPLETED', 'PAUSED', 'ARCHIVED'
);
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');
CREATE TYPE "MaterialActivityKind" AS ENUM ('RESERVED', 'RELEASED', 'GATHERED', 'DELIVERED', 'CORRECTED');
CREATE TYPE "NotificationKind" AS ENUM (
  'BUILDING_ASSIGNED', 'BUILDING_STATUS_CHANGED', 'MATERIAL_RESERVED', 'MATERIAL_GATHERED',
  'MATERIAL_DELIVERED', 'COMMENT_ADDED', 'ROLE_CHANGED'
);
CREATE TYPE "WarehouseMovementKind" AS ENUM ('RECEIVED', 'USED', 'ADJUSTED');

ALTER TABLE "Building"
  ALTER COLUMN "x" DROP NOT NULL,
  ALTER COLUMN "y" DROP NOT NULL,
  ALTER COLUMN "z" DROP NOT NULL,
  ALTER COLUMN "schematicFileName" DROP NOT NULL,
  ALTER COLUMN "materialsFileName" DROP NOT NULL,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "schematicPath" TEXT,
  ADD COLUMN "schematicSize" INTEGER,
  ADD COLUMN "schematicContentType" TEXT,
  ADD COLUMN "screenshotPath" TEXT,
  ADD COLUMN "screenshotSize" INTEGER,
  ADD COLUMN "status" "BuildingStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "responsibleId" TEXT;

ALTER TABLE "Building" ADD COLUMN IF NOT EXISTS "legacyChecklist" JSONB;

-- The original Prisma migrations created plural "Buildings"; stage one added
-- the v2 singular table for deployments that already used the later schema.
-- Copy old rows only when their stable ID is not already present.
DO $migration$
DECLARE
  source_has_checklist BOOLEAN;
BEGIN
  IF to_regclass('"Buildings"') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'Buildings' AND column_name = 'checklist'
    ) INTO source_has_checklist;
    IF source_has_checklist THEN
      INSERT INTO "Building" ("id", "name", "x", "y", "z", "schematicFileName", "materialsFileName", "screenshotDataUrl", "materials", "legacyChecklist", "createdAt")
      SELECT "id", "name", "x", "y", "z", "schematicFileName", "materialsFileName", "screenshotDataUrl", "materials", "checklist", "createdAt"
      FROM "Buildings" ON CONFLICT ("id") DO NOTHING;
    ELSE
      INSERT INTO "Building" ("id", "name", "x", "y", "z", "schematicFileName", "materialsFileName", "screenshotDataUrl", "materials", "createdAt")
      SELECT "id", "name", "x", "y", "z", "schematicFileName", "materialsFileName", "screenshotDataUrl", "materials", "createdAt"
      FROM "Buildings" ON CONFLICT ("id") DO NOTHING;
    END IF;
  END IF;
END
$migration$;

CREATE TABLE "Material" (
  "id" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "requiredQty" INTEGER NOT NULL,
  "stackSize" INTEGER NOT NULL DEFAULT 64,
  "allowSurplus" BOOLEAN NOT NULL DEFAULT false,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "legacySnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Material_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Material_requiredQty_nonnegative" CHECK ("requiredQty" >= 0),
  CONSTRAINT "Material_stackSize_positive" CHECK ("stackSize" > 0)
);

CREATE TABLE "MaterialContribution" (
  "id" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "gatheredQty" INTEGER NOT NULL DEFAULT 0,
  "deliveredQty" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaterialContribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaterialContribution_quantities_nonnegative" CHECK ("gatheredQty" >= 0 AND "deliveredQty" >= 0),
  CONSTRAINT "MaterialContribution_delivery_not_above_gathered" CHECK ("deliveredQty" <= "gatheredQty")
);

CREATE TABLE "MaterialReservation" (
  "id" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "gatheredQty" INTEGER NOT NULL DEFAULT 0,
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaterialReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaterialReservation_quantities_valid" CHECK ("quantity" > 0 AND "gatheredQty" >= 0 AND "gatheredQty" <= "quantity")
);

CREATE TABLE "MaterialActivity" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "reservationId" TEXT,
  "kind" "MaterialActivityKind" NOT NULL,
  "quantityDelta" INTEGER NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaterialActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BuildingRevision" (
  "id" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "actorId" TEXT,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuildingRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BuildingRevision_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "BuildingTask" (
  "id" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
  "assigneeId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuildingTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Comment" (
  "id" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "materialId" TEXT,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "hiddenAt" TIMESTAMP(3),
  "moderatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Favorite" (
  "userId" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId", "buildingId")
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "actorId" TEXT,
  "kind" "NotificationKind" NOT NULL,
  "buildingId" TEXT,
  "entityId" TEXT,
  "payload" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationPreference" (
  "userId" TEXT NOT NULL,
  "kind" "NotificationKind" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId", "kind")
);

CREATE TABLE "WarehouseStock" (
  "id" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "stackSize" INTEGER NOT NULL DEFAULT 64,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WarehouseStock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WarehouseStock_quantities_valid" CHECK ("stackSize" > 0 AND "quantity" >= 0)
);

CREATE TABLE "WarehouseMovement" (
  "id" TEXT NOT NULL,
  "stockId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "kind" "WarehouseMovementKind" NOT NULL,
  "delta" INTEGER NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WarehouseMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "fileName" TEXT,
  "success" BOOLEAN NOT NULL DEFAULT false,
  "error" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Material_buildingId_normalizedName_key" ON "Material"("buildingId", "normalizedName");
CREATE INDEX "Material_buildingId_sortOrder_name_idx" ON "Material"("buildingId", "sortOrder", "name");
CREATE UNIQUE INDEX "MaterialContribution_materialId_userId_key" ON "MaterialContribution"("materialId", "userId");
CREATE INDEX "MaterialContribution_userId_updatedAt_idx" ON "MaterialContribution"("userId", "updatedAt");
CREATE INDEX "MaterialReservation_materialId_releasedAt_idx" ON "MaterialReservation"("materialId", "releasedAt");
CREATE INDEX "MaterialReservation_userId_releasedAt_idx" ON "MaterialReservation"("userId", "releasedAt");
CREATE UNIQUE INDEX "MaterialActivity_operationId_key" ON "MaterialActivity"("operationId");
CREATE INDEX "MaterialActivity_materialId_createdAt_idx" ON "MaterialActivity"("materialId", "createdAt");
CREATE INDEX "MaterialActivity_actorId_createdAt_idx" ON "MaterialActivity"("actorId", "createdAt");
CREATE UNIQUE INDEX "BuildingRevision_buildingId_version_key" ON "BuildingRevision"("buildingId", "version");
CREATE INDEX "BuildingRevision_buildingId_createdAt_idx" ON "BuildingRevision"("buildingId", "createdAt");
CREATE INDEX "BuildingTask_buildingId_status_createdAt_idx" ON "BuildingTask"("buildingId", "status", "createdAt");
CREATE INDEX "BuildingTask_assigneeId_status_idx" ON "BuildingTask"("assigneeId", "status");
CREATE INDEX "Comment_buildingId_createdAt_idx" ON "Comment"("buildingId", "createdAt");
CREATE INDEX "Comment_materialId_createdAt_idx" ON "Comment"("materialId", "createdAt");
CREATE INDEX "Favorite_buildingId_idx" ON "Favorite"("buildingId");
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt");
CREATE UNIQUE INDEX "WarehouseStock_normalizedName_key" ON "WarehouseStock"("normalizedName");
CREATE INDEX "WarehouseMovement_stockId_createdAt_idx" ON "WarehouseMovement"("stockId", "createdAt");
CREATE INDEX "ImportLog_createdAt_idx" ON "ImportLog"("createdAt");
CREATE INDEX "ImportLog_actorId_createdAt_idx" ON "ImportLog"("actorId", "createdAt");
CREATE INDEX "Building_responsibleId_idx" ON "Building"("responsibleId");
CREATE INDEX "Building_status_updatedAt_idx" ON "Building"("status", "updatedAt");
ALTER TABLE "Building" ADD CONSTRAINT "Building_version_positive" CHECK ("version" > 0);
ALTER TABLE "Building" ADD CONSTRAINT "Building_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Material" ADD CONSTRAINT "Material_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialContribution" ADD CONSTRAINT "MaterialContribution_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialContribution" ADD CONSTRAINT "MaterialContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialReservation" ADD CONSTRAINT "MaterialReservation_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialReservation" ADD CONSTRAINT "MaterialReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialActivity" ADD CONSTRAINT "MaterialActivity_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialActivity" ADD CONSTRAINT "MaterialActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialActivity" ADD CONSTRAINT "MaterialActivity_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "MaterialReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuildingRevision" ADD CONSTRAINT "BuildingRevision_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuildingRevision" ADD CONSTRAINT "BuildingRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuildingTask" ADD CONSTRAINT "BuildingTask_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuildingTask" ADD CONSTRAINT "BuildingTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuildingTask" ADD CONSTRAINT "BuildingTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WarehouseMovement" ADD CONSTRAINT "WarehouseMovement_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "WarehouseStock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WarehouseMovement" ADD CONSTRAINT "WarehouseMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportLog" ADD CONSTRAINT "ImportLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Convert old JSON material rows to normalized records while retaining the source snapshot.
WITH source_rows AS (
  SELECT b."id" AS "buildingId", m.value AS value,
         btrim(normalize(m.value ->> 'item', NFKC)) AS "itemName",
         regexp_replace(
           replace(lower(btrim(normalize(m.value ->> 'item', NFKC))), 'ё', 'е'),
           E'\\s+', ' ', 'g'
         ) AS "normalizedName"
  FROM "Building" b
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(b."materials") = 'array' THEN b."materials" ELSE '[]'::jsonb END
  ) AS m(value)
  WHERE NULLIF(btrim(normalize(m.value ->> 'item', NFKC)), '') IS NOT NULL
), grouped_rows AS (
  SELECT "buildingId", "normalizedName", min("itemName") AS "itemName",
         LEAST(SUM(CASE WHEN value ->> 'total' ~ '^[0-9]{1,10}$'
                        THEN (value ->> 'total')::numeric ELSE 0 END), 2147483647)::INTEGER AS "requiredQty",
         jsonb_agg(value) AS "legacySnapshot"
  FROM source_rows
  GROUP BY "buildingId", "normalizedName"
)
INSERT INTO "Material" ("id", "buildingId", "name", "normalizedName", "requiredQty", "stackSize", "sortOrder", "legacySnapshot", "createdAt", "updatedAt")
SELECT 'legacy_' || md5("buildingId" || ':' || "normalizedName"), "buildingId", "itemName", "normalizedName", "requiredQty", 64, 0, "legacySnapshot", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM grouped_rows
ON CONFLICT ("buildingId", "normalizedName") DO NOTHING;
