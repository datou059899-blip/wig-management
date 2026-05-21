-- CreateTable
CREATE TABLE "ProductStockBaseline" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "baselineDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductStockBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductStockBaseline_sku_baselineDate_key" ON "ProductStockBaseline"("sku", "baselineDate");

-- CreateIndex
CREATE INDEX "ProductStockBaseline_sku_idx" ON "ProductStockBaseline"("sku");

-- CreateIndex
CREATE INDEX "ProductStockBaseline_baselineDate_idx" ON "ProductStockBaseline"("baselineDate");
