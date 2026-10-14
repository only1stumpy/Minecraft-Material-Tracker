-- CreateTable
CREATE TABLE "Buildings" (
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

    CONSTRAINT "Buildings_pkey" PRIMARY KEY ("id")
);
