import type { Prisma } from '@prisma/client'
import {
  INVENTORY_SKU_CANDIDATE_STATUS,
  MAX_IMPORT_STOCK_QTY,
  jsonRows,
  strictSkuKey,
  type InventoryPreviewMatchedRow,
  type InventoryPreviewUnmatchedRow,
} from '@/lib/inventoryPurchasing'

export type ConfirmBatchInput = {
  id: string
  fileHash: string
  fileName: string
  stockCapturedAt: Date
  matchedRows: Prisma.JsonValue
  unmatchedRows: Prisma.JsonValue
  skuCandidates: Array<{
    rowNumber: number
    normalizedSku: string
    status: string
    resolvedProductId: string | null
    resolvedCanonicalSku: string | null
  }>
}

export function prepareInventoryConfirmRows(
  batch: ConfirmBatchInput,
  canonicalSkuByProductId?: Map<string, string>,
) {
  const matchedRows = jsonRows<InventoryPreviewMatchedRow>(batch.matchedRows)
  const unmatchedRows = jsonRows<InventoryPreviewUnmatchedRow>(batch.unmatchedRows)
  const duplicateRows = unmatchedRows.filter((row) => row.kind === 'duplicate_conflict' || row.reason.includes('重复 SKU 冲突'))
  if (duplicateRows.length > 0) {
    return {
      blocked: true as const,
      error: '存在未人工确认合并的重复 SKU 冲突，请先在预览中确认合并或修正库存文件',
      duplicateRows,
    }
  }

  const pendingCandidates = batch.skuCandidates.filter((candidate) => candidate.status === INVENTORY_SKU_CANDIDATE_STATUS.PENDING)
  if (pendingCandidates.length > 0) {
    return {
      blocked: true as const,
      error: '存在待处理的新 SKU 候选，请逐条创建、映射、恢复或忽略后再确认',
      pendingCandidates,
    }
  }

  const blockingUnmatchedRows = unmatchedRows.filter((row) => {
    const candidate = batch.skuCandidates.find((item) => (
      item.rowNumber === row.rowNumber && item.normalizedSku === strictSkuKey(row.inputSku)
    ))
    return candidate?.status !== INVENTORY_SKU_CANDIDATE_STATUS.IGNORED
  })
  if (blockingUnmatchedRows.length > 0) {
    return {
      blocked: true as const,
      error: '仍存在未解决的库存预览异常，请处理后再确认',
      unmatchedRows: blockingUnmatchedRows,
    }
  }

  const inconsistentResolvedCandidates = batch.skuCandidates.filter((candidate) => {
    if (![INVENTORY_SKU_CANDIDATE_STATUS.CREATED, INVENTORY_SKU_CANDIDATE_STATUS.MAPPED].includes(candidate.status as any)) return false
    return !matchedRows.some((row) => (
      row.rowNumber === candidate.rowNumber &&
      row.productId === candidate.resolvedProductId &&
      strictSkuKey(row.canonicalSku) === strictSkuKey(candidate.resolvedCanonicalSku)
    ))
  })
  if (inconsistentResolvedCandidates.length > 0) {
    return {
      blocked: true as const,
      error: '新 SKU 候选与 matchedRows 状态不一致，请重新生成库存 PREVIEW',
      inconsistentResolvedCandidates,
    }
  }

  const missingIgnoredEvidence = batch.skuCandidates.filter((candidate) => {
    if (candidate.status !== INVENTORY_SKU_CANDIDATE_STATUS.IGNORED) return false
    return !unmatchedRows.some((row) => (
      row.rowNumber === candidate.rowNumber && strictSkuKey(row.inputSku) === candidate.normalizedSku
    ))
  })
  if (missingIgnoredEvidence.length > 0) {
    return {
      blocked: true as const,
      error: '已忽略候选缺少原始 unmatched 审计证据，请重新生成库存 PREVIEW',
      missingIgnoredEvidence,
    }
  }

  const rowsWithDatabaseCanonicalSku = matchedRows.map((row) => ({
    ...row,
    canonicalSku: canonicalSkuByProductId?.get(row.productId) || row.canonicalSku,
  }))
  const missingProducts = canonicalSkuByProductId
    ? matchedRows.filter((row) => !canonicalSkuByProductId.get(row.productId))
    : []
  if (missingProducts.length > 0) {
    return {
      blocked: true as const,
      error: '存在无法重新确认 Product.sku 的匹配行，禁止确认导入',
      missingProducts: missingProducts.map((row) => ({
        rowNumber: row.rowNumber,
        canonicalSku: row.canonicalSku,
        productId: row.productId,
      })),
    }
  }

  const changedCanonicalSkus = canonicalSkuByProductId
    ? matchedRows.filter((row) => strictSkuKey(canonicalSkuByProductId.get(row.productId)) !== strictSkuKey(row.canonicalSku))
    : []
  if (changedCanonicalSkus.length > 0) {
    return {
      blocked: true as const,
      error: '候选处理后 Product canonical SKU 已变化，请刷新或重新生成库存 PREVIEW',
      changedCanonicalSkus,
    }
  }

  const matchedSkuCounts = new Map<string, number>()
  rowsWithDatabaseCanonicalSku.forEach((row) => {
    const key = strictSkuKey(row.canonicalSku)
    matchedSkuCounts.set(key, (matchedSkuCounts.get(key) || 0) + 1)
  })
  const duplicateMatchedSkus = Array.from(matchedSkuCounts.entries()).filter(([, count]) => count > 1)
  if (duplicateMatchedSkus.length > 0) {
    return {
      blocked: true as const,
      error: '预览中仍存在重复 canonical SKU，禁止确认导入',
      duplicateMatchedSkus: duplicateMatchedSkus.map(([sku, count]) => ({ sku, count })),
    }
  }

  const invalidRows = rowsWithDatabaseCanonicalSku.filter((row) => (
    !row.productId ||
    !row.canonicalSku ||
    !Number.isSafeInteger(row.totalQty) ||
    row.totalQty < 0 ||
    row.totalQty > MAX_IMPORT_STOCK_QTY
  ))
  if (invalidRows.length > 0) {
    return {
      blocked: true as const,
      error: '存在库存数量或 SKU 信息异常的匹配行，禁止确认导入',
      invalidRows: invalidRows.map((row) => ({
        rowNumber: row.rowNumber,
        canonicalSku: row.canonicalSku,
        totalQty: row.totalQty,
        productId: row.productId,
      })),
    }
  }

  const matchedSkus = Array.from(new Set(rowsWithDatabaseCanonicalSku.map((row) => row.canonicalSku).filter(Boolean)))
  const snapshotCreateData = rowsWithDatabaseCanonicalSku.map((row) => ({
    sku: row.canonicalSku,
    date: batch.stockCapturedAt,
    availableQty: 0,
    lockedQty: 0,
    totalQty: row.totalQty,
    sourceFileName: batch.fileName,
    importBatchId: batch.id,
  }))

  return {
    blocked: false as const,
    matchedRows: rowsWithDatabaseCanonicalSku,
    matchedSkus,
    snapshotCreateData,
  }
}
