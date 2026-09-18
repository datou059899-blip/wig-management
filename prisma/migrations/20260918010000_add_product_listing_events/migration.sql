CREATE TABLE "ProductListingEvent" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'TIKTOK',
  "shopKey" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "oldTikTokProductId" TEXT,
  "oldTikTokSkuId" TEXT,
  "newTikTokProductId" TEXT,
  "newTikTokSkuId" TEXT,
  "actualInventoryQty" INTEGER,
  "systemInventoryQty" INTEGER,
  "changedAt" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "recordedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProductListingEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductListingEvent_reason_check"
    CHECK ("reason" IN ('SOLD_OUT', 'LINK_CHANGED', 'OTHER')),
  CONSTRAINT "ProductListingEvent_nonempty_check"
    CHECK (
      btrim("platform") <> '' AND
      btrim("shopKey") <> '' AND
      btrim("recordedBy") <> ''
    ),
  CONSTRAINT "ProductListingEvent_reason_integrity_check"
    CHECK (
      (
        "reason" = 'LINK_CHANGED' AND
        "oldTikTokProductId" IS NOT NULL AND btrim("oldTikTokProductId") <> '' AND
        "oldTikTokSkuId" IS NOT NULL AND btrim("oldTikTokSkuId") <> '' AND
        "newTikTokProductId" IS NOT NULL AND btrim("newTikTokProductId") <> '' AND
        "newTikTokSkuId" IS NOT NULL AND btrim("newTikTokSkuId") <> '' AND
        ("oldTikTokProductId", "oldTikTokSkuId") <> ("newTikTokProductId", "newTikTokSkuId") AND
        "actualInventoryQty" IS NULL AND
        "systemInventoryQty" IS NULL
      ) OR
      (
        "reason" = 'SOLD_OUT' AND
        "oldTikTokProductId" IS NULL AND
        "oldTikTokSkuId" IS NULL AND
        "newTikTokProductId" IS NULL AND
        "newTikTokSkuId" IS NULL AND
        "actualInventoryQty" = 0 AND
        "systemInventoryQty" IS NOT NULL AND
        "systemInventoryQty" >= 0
      ) OR
      (
        "reason" = 'OTHER' AND
        "oldTikTokProductId" IS NULL AND
        "oldTikTokSkuId" IS NULL AND
        "newTikTokProductId" IS NULL AND
        "newTikTokSkuId" IS NULL AND
        "actualInventoryQty" IS NULL AND
        "systemInventoryQty" IS NULL AND
        "note" IS NOT NULL AND
        btrim("note") <> ''
      )
    )
);

CREATE INDEX "ProductListingEvent_productId_changedAt_idx"
  ON "ProductListingEvent"("productId", "changedAt");

CREATE INDEX "ProductListingEvent_old_listing_idx"
  ON "ProductListingEvent"("platform", "shopKey", "oldTikTokProductId", "oldTikTokSkuId");

CREATE INDEX "ProductListingEvent_new_listing_idx"
  ON "ProductListingEvent"("platform", "shopKey", "newTikTokProductId", "newTikTokSkuId");

CREATE UNIQUE INDEX "ProductListingEvent_link_changed_identity_key"
  ON "ProductListingEvent"(
    "productId",
    "platform",
    "shopKey",
    "oldTikTokProductId",
    "oldTikTokSkuId",
    "newTikTokProductId",
    "newTikTokSkuId"
  )
  WHERE "reason" = 'LINK_CHANGED';

ALTER TABLE "ProductListingEvent"
  ADD CONSTRAINT "ProductListingEvent_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductExternalIdentifier"
  DROP CONSTRAINT "ProductExternalIdentifier_identifierType_check",
  ADD CONSTRAINT "ProductExternalIdentifier_identifierType_check"
    CHECK ("identifierType" IN ('TIKTOK_SKU_ID', 'TIKTOK_PRODUCT_ID', 'TIKTOK_PRODUCT_SKU_PAIR'));
