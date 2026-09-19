CREATE TABLE "InventorySkuCandidate" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "inputSku" TEXT NOT NULL,
    "normalizedSku" TEXT NOT NULL,
    "totalQty" INTEGER NOT NULL,
    "productNameSnapshot" TEXT,
    "sourceFileName" TEXT NOT NULL,
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

    CONSTRAINT "InventorySkuCandidate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventorySkuCandidate_totalQty_check" CHECK ("totalQty" >= 0),
    CONSTRAINT "InventorySkuCandidate_status_check" CHECK ("status" IN ('PENDING', 'CREATED', 'MAPPED', 'IGNORED')),
    CONSTRAINT "InventorySkuCandidate_detectionType_check" CHECK ("detectionType" IN ('UNKNOWN_SKU', 'EXACT_INACTIVE_CANONICAL_FOUND', 'EXACT_INACTIVE_ALIAS_FOUND')),
    CONSTRAINT "InventorySkuCandidate_resolutionType_check" CHECK (
      "resolutionType" IS NULL OR "resolutionType" IN ('CREATE_NEW', 'MAP_EXISTING', 'REACTIVATE_INACTIVE', 'REFRESH_EXACT_MATCH', 'IGNORE')
    ),
    CONSTRAINT "InventorySkuCandidate_state_integrity_check" CHECK (
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
        AND "resolutionType" IN ('MAP_EXISTING', 'REACTIVATE_INACTIVE', 'REFRESH_EXACT_MATCH')
        AND "resolvedProductId" IS NOT NULL
        AND "resolvedCanonicalSku" IS NOT NULL
        AND "resolvedAt" IS NOT NULL
        AND "resolvedBy" IS NOT NULL
      ) OR (
        "status" = 'IGNORED'
        AND "resolutionType" = 'IGNORE'
        AND "resolvedProductId" IS NULL
        AND "resolvedCanonicalSku" IS NULL
        AND "resolvedAt" IS NOT NULL
        AND "resolvedBy" IS NOT NULL
        AND LENGTH(BTRIM(COALESCE("note", ''))) > 0
      )
    ),
    CONSTRAINT "InventorySkuCandidate_inactive_identity_check" CHECK (
      ("detectionType" = 'UNKNOWN_SKU' AND "inactiveProductId" IS NULL)
      OR
      ("detectionType" IN ('EXACT_INACTIVE_CANONICAL_FOUND', 'EXACT_INACTIVE_ALIAS_FOUND') AND "inactiveProductId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "InventorySkuCandidate_importBatchId_rowNumber_key"
ON "InventorySkuCandidate"("importBatchId", "rowNumber");

CREATE INDEX "InventorySkuCandidate_normalizedSku_idx"
ON "InventorySkuCandidate"("normalizedSku");

CREATE INDEX "InventorySkuCandidate_status_idx"
ON "InventorySkuCandidate"("status");

CREATE INDEX "InventorySkuCandidate_importBatchId_idx"
ON "InventorySkuCandidate"("importBatchId");

ALTER TABLE "InventorySkuCandidate"
ADD CONSTRAINT "InventorySkuCandidate_importBatchId_fkey"
FOREIGN KEY ("importBatchId") REFERENCES "InventoryImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventorySkuCandidate"
ADD CONSTRAINT "InventorySkuCandidate_inactiveProductId_fkey"
FOREIGN KEY ("inactiveProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventorySkuCandidate"
ADD CONSTRAINT "InventorySkuCandidate_resolvedProductId_fkey"
FOREIGN KEY ("resolvedProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
