-- CreateTable
CREATE TABLE "ProductInventorySnapshot" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "availableQty" INTEGER NOT NULL DEFAULT 0,
    "lockedQty" INTEGER NOT NULL DEFAULT 0,
    "sunnymayHairQty" INTEGER NOT NULL DEFAULT 0,
    "fc03Atl1Qty" INTEGER NOT NULL DEFAULT 0,
    "fc14Ewr4Qty" INTEGER NOT NULL DEFAULT 0,
    "fc09Atl2Qty" INTEGER NOT NULL DEFAULT 0,
    "totalQty" INTEGER NOT NULL DEFAULT 0,
    "sourceFileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductInventorySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductInventorySnapshot_sku_date_key" ON "ProductInventorySnapshot"("sku", "date");

-- CreateIndex
CREATE INDEX "ProductInventorySnapshot_sku_idx" ON "ProductInventorySnapshot"("sku");

-- CreateIndex
CREATE INDEX "ProductInventorySnapshot_date_idx" ON "ProductInventorySnapshot"("date");
