-- CreateTable
CREATE TABLE "MaterialItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "initialQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "warningQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialTransaction" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "materialName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "beforeQty" DOUBLE PRECISION NOT NULL,
    "afterQty" DOUBLE PRECISION NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaterialItem_name_key" ON "MaterialItem"("name");

-- CreateIndex
CREATE INDEX "MaterialItem_isActive_idx" ON "MaterialItem"("isActive");

-- CreateIndex
CREATE INDEX "MaterialTransaction_materialId_idx" ON "MaterialTransaction"("materialId");

-- CreateIndex
CREATE INDEX "MaterialTransaction_transactionDate_idx" ON "MaterialTransaction"("transactionDate");

-- CreateIndex
CREATE INDEX "MaterialTransaction_type_idx" ON "MaterialTransaction"("type");

-- AddForeignKey
ALTER TABLE "MaterialTransaction"
ADD CONSTRAINT "MaterialTransaction_materialId_fkey"
FOREIGN KEY ("materialId") REFERENCES "MaterialItem"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
