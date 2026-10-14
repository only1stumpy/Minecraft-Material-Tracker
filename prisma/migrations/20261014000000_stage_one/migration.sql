-- Additive PostgreSQL migration. Existing Building rows and material progress
-- remain intact; legacy rows intentionally have no owner until verified.
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PLAYER');

CREATE TABLE IF NOT EXISTS "Building" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "x" INTEGER NOT NULL,
  "y" INTEGER NOT NULL,
  "z" INTEGER NOT NULL,
  "schematicFileName" TEXT NOT NULL,
  "materialsFileName" TEXT NOT NULL,
  "screenshotDataUrl" TEXT,
  "materials" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "minecraftNickname" TEXT NOT NULL,
  "normalizedNickname" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'PLAYER',
  "isBlocked" BOOLEAN NOT NULL DEFAULT false,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
  "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastActiveAt" TIMESTAMP(3),
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthThrottle" (
  "key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "Building" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Building" SET "updatedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP);
ALTER TABLE "Building" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "Building" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Building" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_minecraftNickname_key" ON "User"("minecraftNickname");
CREATE UNIQUE INDEX "User_normalizedNickname_key" ON "User"("normalizedNickname");
CREATE INDEX "User_role_isBlocked_idx" ON "User"("role", "isBlocked");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuthThrottle_resetAt_idx" ON "AuthThrottle"("resetAt");
CREATE INDEX "Building_ownerId_idx" ON "Building"("ownerId");
CREATE INDEX "Building_deletedAt_createdAt_idx" ON "Building"("deletedAt", "createdAt");

ALTER TABLE "Building" ADD CONSTRAINT "Building_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
