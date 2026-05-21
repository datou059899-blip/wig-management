-- CreateTable
CREATE TABLE "ProductOrderItem" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "dedupeKey" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "skuId" TEXT,
    "sellerSku" TEXT NOT NULL,
    "paidDate" TIMESTAMP(3) NOT NULL,
    "paidTime" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "returnQty" INTEGER NOT NULL DEFAULT 0,
    "netQty" INTEGER NOT NULL DEFAULT 0,
    "canceledQty" INTEGER NOT NULL DEFAULT 0,
    "refundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orderStatus" TEXT,
    "cancelationReturnType" TEXT,
    "productMatched" BOOLEAN NOT NULL DEFAULT false,
    "sourceFileName" TEXT,
    "rawPaidTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductOrderItem_dedupeKey_key" ON "ProductOrderItem"("dedupeKey");

-- CreateIndex
CREATE INDEX "ProductOrderItem_sellerSku_idx" ON "ProductOrderItem"("sellerSku");

-- CreateIndex
CREATE INDEX "ProductOrderItem_paidDate_idx" ON "ProductOrderItem"("paidDate");

-- CreateIndex
CREATE INDEX "ProductOrderItem_orderId_idx" ON "ProductOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "ProductOrderItem_productMatched_idx" ON "ProductOrderItem"("productMatched");
