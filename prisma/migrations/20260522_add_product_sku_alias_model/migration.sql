-- CreateTable
CREATE TABLE "ProductSkuAlias" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "productId" TEXT NOT NULL,
    "aliasSku" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSkuAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductSkuAlias_aliasSku_key" ON "ProductSkuAlias"("aliasSku");

-- CreateIndex
CREATE INDEX "ProductSkuAlias_productId_idx" ON "ProductSkuAlias"("productId");

-- CreateIndex
CREATE INDEX "ProductSkuAlias_aliasSku_idx" ON "ProductSkuAlias"("aliasSku");

-- AddForeignKey
ALTER TABLE "ProductSkuAlias" ADD CONSTRAINT "ProductSkuAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
