CREATE TABLE "ProductExternalIdentifier" (
  "id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "shopKey" TEXT NOT NULL,
  "identifierType" TEXT NOT NULL,
  "identifierValue" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "evidence" TEXT NOT NULL,
  "approvedBy" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductExternalIdentifier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductExternalIdentifier_identifierType_check"
    CHECK ("identifierType" IN ('TIKTOK_SKU_ID', 'TIKTOK_PRODUCT_ID')),
  CONSTRAINT "ProductExternalIdentifier_nonempty_check"
    CHECK (
      btrim("platform") <> '' AND
      btrim("shopKey") <> '' AND
      btrim("identifierValue") <> '' AND
      btrim("evidence") <> '' AND
      btrim("approvedBy") <> ''
    )
);

CREATE TABLE "OrderLineClassificationRule" (
  "id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "shopKey" TEXT NOT NULL,
  "identityKey" TEXT NOT NULL,
  "classification" TEXT NOT NULL,
  "requireZeroAmount" BOOLEAN NOT NULL,
  "evidence" TEXT NOT NULL,
  "approvedBy" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrderLineClassificationRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderLineClassificationRule_classification_check"
    CHECK ("classification" = 'NON_MERCHANDISE_GIFT'),
  CONSTRAINT "OrderLineClassificationRule_nonempty_check"
    CHECK (
      btrim("platform") <> '' AND
      btrim("shopKey") <> '' AND
      btrim("identityKey") <> '' AND
      btrim("evidence") <> '' AND
      btrim("approvedBy") <> ''
    )
);

ALTER TABLE "ProductOrderItem"
  ADD COLUMN "lineClassification" TEXT,
  ADD COLUMN "tiktokProductId" TEXT,
  ADD COLUMN "shopKey" TEXT,
  ADD COLUMN "resolvedProductId" TEXT,
  ADD CONSTRAINT "ProductOrderItem_lineClassification_check"
    CHECK ("lineClassification" IS NULL OR "lineClassification" IN ('MERCHANDISE', 'NON_MERCHANDISE_GIFT'));

CREATE UNIQUE INDEX "ProductExternalIdentifier_platform_shopKey_identifierType_identifierValue_key"
  ON "ProductExternalIdentifier"("platform", "shopKey", "identifierType", "identifierValue");

CREATE INDEX "ProductExternalIdentifier_productId_idx"
  ON "ProductExternalIdentifier"("productId");

CREATE UNIQUE INDEX "OrderLineClassificationRule_platform_shopKey_identityKey_key"
  ON "OrderLineClassificationRule"("platform", "shopKey", "identityKey");

CREATE INDEX "ProductOrderItem_resolvedProductId_idx"
  ON "ProductOrderItem"("resolvedProductId");

ALTER TABLE "ProductExternalIdentifier"
  ADD CONSTRAINT "ProductExternalIdentifier_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductOrderItem"
  ADD CONSTRAINT "ProductOrderItem_resolvedProductId_fkey"
  FOREIGN KEY ("resolvedProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
