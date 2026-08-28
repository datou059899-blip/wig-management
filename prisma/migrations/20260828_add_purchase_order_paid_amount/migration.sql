ALTER TABLE "PurchaseOrder"
ADD COLUMN "paidAmountRmb" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "PurchaseOrder"
ADD CONSTRAINT "PurchaseOrder_paidAmountRmb_nonnegative_check"
CHECK ("paidAmountRmb" >= 0);
