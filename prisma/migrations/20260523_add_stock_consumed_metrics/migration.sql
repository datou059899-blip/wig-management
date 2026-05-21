-- AlterTable
ALTER TABLE "PerformanceDaily"
ADD COLUMN "stockConsumedQty" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProductOrderItem"
ADD COLUMN "stockConsumedQty" INTEGER NOT NULL DEFAULT 0;
