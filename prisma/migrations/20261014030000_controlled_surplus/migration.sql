-- Replace the unbounded surplus switch with a finite per-material quantity.
ALTER TABLE "Material"
  ADD COLUMN "surplusLimit" INTEGER NOT NULL DEFAULT 0;

UPDATE "Material"
SET "surplusLimit" = CASE
  WHEN "allowSurplus" THEN LEAST("stackSize", 2147483647 - "requiredQty")
  ELSE 0
END;

ALTER TABLE "Material"
  ADD CONSTRAINT "Material_surplusLimit_valid"
  CHECK ("surplusLimit" >= 0 AND "requiredQty" <= 2147483647 - "surplusLimit");

ALTER TABLE "Material"
  DROP COLUMN "allowSurplus";
