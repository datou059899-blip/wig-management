ALTER TABLE "Product"
ADD COLUMN "businessStatus" TEXT NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "Product"
ADD CONSTRAINT "Product_businessStatus_check"
CHECK ("businessStatus" IN ('ACTIVE', 'OUT_OF_STOCK_DELISTED', 'DISCONTINUED'));

CREATE INDEX "Product_businessStatus_idx" ON "Product"("businessStatus");
