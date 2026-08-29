-- Add optional one-to-one link from ProductOpportunity to PurchaseOrderItem.
ALTER TABLE "ProductOpportunity" ADD COLUMN "purchaseOrderItemId" TEXT;

CREATE UNIQUE INDEX "ProductOpportunity_purchaseOrderItemId_key" ON "ProductOpportunity"("purchaseOrderItemId");

ALTER TABLE "ProductOpportunity" ADD CONSTRAINT "ProductOpportunity_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
