-- CreateTable
CREATE TABLE "ProductStockAdjustment" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "adjustmentDate" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductStockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSalesRankSetting" (
    "id" TEXT NOT NULL,
    "aDailySalesThreshold" INTEGER NOT NULL DEFAULT 20,
    "bDailySalesThreshold" INTEGER NOT NULL DEFAULT 10,
    "cStockRatioThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "cOrderRatioThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "dActiveDaysThreshold" INTEGER NOT NULL DEFAULT 3,
    "windowDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSalesRankSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductStockAdjustment_sku_idx" ON "ProductStockAdjustment"("sku");

-- CreateIndex
CREATE INDEX "ProductStockAdjustment_adjustmentDate_idx" ON "ProductStockAdjustment"("adjustmentDate");
