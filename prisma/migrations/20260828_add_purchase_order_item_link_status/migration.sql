-- AlterTable
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "linkStatus" TEXT;

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_linkStatus_idx" ON "PurchaseOrderItem"("linkStatus");
