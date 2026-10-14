-- Keep the denormalized reservation counter on the stock row so a reservation
-- can lock one row and enforce the available quantity atomically.
ALTER TABLE "WarehouseStock"
  ADD COLUMN "reserved" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "WarehouseStock"
  ADD CONSTRAINT "WarehouseStock_reserved_valid"
  CHECK ("reserved" >= 0 AND "reserved" <= "quantity");

CREATE TABLE "WarehouseReservation" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "stockId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WarehouseReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WarehouseReservation_operationId_key" UNIQUE ("operationId"),
  CONSTRAINT "WarehouseReservation_quantity_positive" CHECK ("quantity" > 0)
);

CREATE INDEX "WarehouseReservation_stockId_releasedAt_idx"
  ON "WarehouseReservation"("stockId", "releasedAt");
CREATE INDEX "WarehouseReservation_userId_releasedAt_idx"
  ON "WarehouseReservation"("userId", "releasedAt");

ALTER TABLE "WarehouseReservation"
  ADD CONSTRAINT "WarehouseReservation_stockId_fkey"
  FOREIGN KEY ("stockId") REFERENCES "WarehouseStock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WarehouseReservation"
  ADD CONSTRAINT "WarehouseReservation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
