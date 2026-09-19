CREATE TABLE "OrderSkuCandidate" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'TIKTOK',
    "shopKey" TEXT NOT NULL,
    "inputSku" TEXT NOT NULL,
    "normalizedSku" TEXT NOT NULL,
    "tiktokProductId" TEXT NOT NULL,
    "tiktokSkuId" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "occurrenceCount" INTEGER NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "detectionType" TEXT NOT NULL DEFAULT 'UNKNOWN_SKU',
    "inactiveProductId" TEXT,
    "resolvedProductId" TEXT,
    "resolvedCanonicalSku" TEXT,
    "resolutionType" TEXT,
    "note" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSkuCandidate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrderSkuCandidate_occurrenceCount_check" CHECK ("occurrenceCount" > 0),
    CONSTRAINT "OrderSkuCandidate_status_check" CHECK ("status" IN ('PENDING', 'CREATED', 'MAPPED')),
    CONSTRAINT "OrderSkuCandidate_detectionType_check" CHECK ("detectionType" IN ('UNKNOWN_SKU', 'EXACT_INACTIVE_CANONICAL_FOUND', 'EXACT_INACTIVE_ALIAS_FOUND')),
    CONSTRAINT "OrderSkuCandidate_resolutionType_check" CHECK (
      "resolutionType" IS NULL OR "resolutionType" IN ('CREATE_NEW', 'MAP_EXISTING', 'REACTIVATE_INACTIVE')
    ),
    CONSTRAINT "OrderSkuCandidate_state_integrity_check" CHECK (
      (
        "status" = 'PENDING'
        AND "resolutionType" IS NULL
        AND "resolvedProductId" IS NULL
        AND "resolvedCanonicalSku" IS NULL
        AND "resolvedAt" IS NULL
        AND "resolvedBy" IS NULL
      ) OR (
        "status" = 'CREATED'
        AND "resolutionType" = 'CREATE_NEW'
        AND "resolvedProductId" IS NOT NULL
        AND "resolvedCanonicalSku" IS NOT NULL
        AND "resolvedAt" IS NOT NULL
        AND "resolvedBy" IS NOT NULL
      ) OR (
        "status" = 'MAPPED'
        AND "resolutionType" IN ('MAP_EXISTING', 'REACTIVATE_INACTIVE')
        AND "resolvedProductId" IS NOT NULL
        AND "resolvedCanonicalSku" IS NOT NULL
        AND "resolvedAt" IS NOT NULL
        AND "resolvedBy" IS NOT NULL
      )
    ),
    CONSTRAINT "OrderSkuCandidate_inactive_identity_check" CHECK (
      ("detectionType" = 'UNKNOWN_SKU' AND "inactiveProductId" IS NULL)
      OR
      ("detectionType" IN ('EXACT_INACTIVE_CANONICAL_FOUND', 'EXACT_INACTIVE_ALIAS_FOUND') AND "inactiveProductId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "OrderSkuCandidate_platform_shopKey_normalizedSku_tiktokProductId_tiktokSkuId_key"
ON "OrderSkuCandidate"("platform", "shopKey", "normalizedSku", "tiktokProductId", "tiktokSkuId");

CREATE INDEX "OrderSkuCandidate_shopKey_normalizedSku_idx"
ON "OrderSkuCandidate"("shopKey", "normalizedSku");

CREATE INDEX "OrderSkuCandidate_status_idx"
ON "OrderSkuCandidate"("status");

ALTER TABLE "OrderSkuCandidate"
ADD CONSTRAINT "OrderSkuCandidate_inactiveProductId_fkey"
FOREIGN KEY ("inactiveProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderSkuCandidate"
ADD CONSTRAINT "OrderSkuCandidate_resolvedProductId_fkey"
FOREIGN KEY ("resolvedProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
