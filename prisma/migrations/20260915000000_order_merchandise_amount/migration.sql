ALTER TABLE "ProductOrderItem"
ADD COLUMN "skuSubtotalAfterDiscount" DECIMAL(18,2);

ALTER TABLE "PerformanceDaily"
ADD COLUMN "merchandiseAmount" DECIMAL(18,2);
