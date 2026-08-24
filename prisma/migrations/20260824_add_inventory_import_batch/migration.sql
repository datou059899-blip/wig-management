-- CreateTable
CREATE TABLE "InventoryImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "stockCapturedAt" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3),
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "unmatchedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "note" TEXT,
    "matchedRows" JSONB NOT NULL DEFAULT '[]',
    "unmatchedRows" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryImportBatch_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ProductInventorySnapshot" ADD COLUMN "importBatchId" TEXT;

-- CreateIndex
CREATE INDEX "InventoryImportBatch_fileHash_idx" ON "InventoryImportBatch"("fileHash");

-- CreateIndex
CREATE INDEX "InventoryImportBatch_status_idx" ON "InventoryImportBatch"("status");

-- CreateIndex
CREATE INDEX "InventoryImportBatch_stockCapturedAt_idx" ON "InventoryImportBatch"("stockCapturedAt");

-- CreateIndex
CREATE INDEX "ProductInventorySnapshot_importBatchId_idx" ON "ProductInventorySnapshot"("importBatchId");

-- AddForeignKey
ALTER TABLE "ProductInventorySnapshot" ADD CONSTRAINT "ProductInventorySnapshot_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "InventoryImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
