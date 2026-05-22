-- AlterTable
ALTER TABLE "PerformanceDaily"
ADD COLUMN "sampleQty" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProductOrderItem"
ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sampleQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "buyerUsername" TEXT,
ADD COLUMN "buyerNickname" TEXT,
ADD COLUMN "recipient" TEXT;
