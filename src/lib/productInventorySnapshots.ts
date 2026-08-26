import { prisma } from '@/lib/prisma'

type SnapshotQuantitySource = 'totalQty' | 'availableLocked' | 'none'

export type InventorySnapshotProduct = {
  id: string
  sku: string | null
  stock: number | null
  aliases: Array<{ aliasSku: string | null }>
}

export type CurrentInventorySnapshot = {
  sku: string
  date: Date
  totalQty: number | null
  availableQty: number | null
  lockedQty: number | null
}

export type CurrentInventoryResult = {
  productId: string
  currentStock: number
  snapshotStock: number | null
  selectedSnapshot: CurrentInventorySnapshot | null
  previousSnapshot: CurrentInventorySnapshot | null
  snapshotAdjustmentAfterQty: number
  snapshotConsumedAfterQty: number
  hasSnapshot: boolean
  source: 'snapshot_total' | 'snapshot_available_locked' | 'product_stock_fallback' | 'none'
}

export function buildEffectiveInventorySnapshotWhere<T extends Record<string, unknown>>(where?: T) {
  const effectiveSnapshotWhere = {
    OR: [
      { importBatchId: null },
      { importBatch: { status: 'CONFIRMED' } },
    ],
  }

  if (!where || Object.keys(where).length === 0) {
    return effectiveSnapshotWhere
  }

  return {
    AND: [
      where,
      effectiveSnapshotWhere,
    ],
  }
}

export function resolveInventorySnapshotQuantity(snapshot: {
  totalQty: number | null
  availableQty: number | null
  lockedQty: number | null
}): { quantity: number | null; source: SnapshotQuantitySource } {
  if (snapshot.totalQty !== null && snapshot.totalQty !== undefined && snapshot.totalQty >= 0) {
    return { quantity: snapshot.totalQty, source: 'totalQty' }
  }

  if (snapshot.availableQty !== null || snapshot.lockedQty !== null) {
    return {
      quantity: Math.max((snapshot.availableQty ?? 0) + (snapshot.lockedQty ?? 0), 0),
      source: 'availableLocked',
    }
  }

  return { quantity: null, source: 'none' }
}

function strictInventorySkuKey(value: string | null | undefined) {
  const text = typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim()
  return text ? text.toUpperCase() : ''
}

function uniqueProductInventorySkus(product: InventorySnapshotProduct) {
  const seen = new Set<string>()
  return [product.sku, ...product.aliases.map((alias) => alias.aliasSku)].flatMap((value) => {
    const sku = typeof value === 'string' ? value.trim() : ''
    const key = strictInventorySkuKey(sku)
    if (!sku || !key || seen.has(key)) return []
    seen.add(key)
    return [sku]
  })
}

type SnapshotRow = CurrentInventorySnapshot & {
  importBatchId: string | null
  importBatch: { matchedRows: unknown } | null
}

type MatchedRowProductReference = {
  productId?: unknown
  canonicalSku?: unknown
}

function jsonMatchedRows(value: unknown): MatchedRowProductReference[] {
  return Array.isArray(value) ? value as MatchedRowProductReference[] : []
}

export async function getCurrentInventoryByProduct(
  products: InventorySnapshotProduct[],
  options: { endExclusive?: Date } = {},
) {
  const endExclusive = options.endExclusive || new Date()
  const skuToProductIds = new Map<string, Set<string>>()
  const skuCandidatesByProductId = new Map<string, string[]>()

  products.forEach((product) => {
    const skus = uniqueProductInventorySkus(product)
    skuCandidatesByProductId.set(product.id, skus)
    skus.forEach((sku) => {
      const key = strictInventorySkuKey(sku)
      if (!key) return
      const bucket = skuToProductIds.get(key) || new Set<string>()
      bucket.add(product.id)
      skuToProductIds.set(key, bucket)
    })
  })

  const allSkus = Array.from(new Set(Array.from(skuCandidatesByProductId.values()).flat()))
  const snapshots = allSkus.length
    ? await prisma.productInventorySnapshot.findMany({
        where: {
          OR: [
            buildEffectiveInventorySnapshotWhere({ sku: { in: allSkus } }),
            { importBatch: { status: 'CONFIRMED' } },
          ],
        },
        select: {
          sku: true,
          date: true,
          totalQty: true,
          availableQty: true,
          lockedQty: true,
          importBatchId: true,
          importBatch: { select: { matchedRows: true } },
        },
        orderBy: [
          { date: 'desc' },
          { sku: 'asc' },
        ],
      })
    : []

  const snapshotsByProductId = new Map<string, SnapshotRow[]>()
  snapshots.forEach((snapshot) => {
    const productIds = new Set<string>()
    const exactProductIds = skuToProductIds.get(strictInventorySkuKey(snapshot.sku))
    exactProductIds?.forEach((productId) => productIds.add(productId))

    if (snapshot.importBatch) {
      jsonMatchedRows(snapshot.importBatch.matchedRows).forEach((row) => {
        if (
          typeof row.productId === 'string'
          && typeof row.canonicalSku === 'string'
          && strictInventorySkuKey(row.canonicalSku) === strictInventorySkuKey(snapshot.sku)
        ) {
          productIds.add(row.productId)
        }
      })
    }

    productIds.forEach((productId) => {
      const bucket = snapshotsByProductId.get(productId) || []
      bucket.push(snapshot)
      snapshotsByProductId.set(productId, bucket)
    })
  })

  const latestSnapshotDates = Array.from(snapshotsByProductId.values())
    .flatMap((rows) => rows[0] ? [rows[0].date] : [])
  const earliestLatestSnapshotDate = latestSnapshotDates.reduce<Date | null>((earliest, date) => {
    if (!earliest || date.getTime() < earliest.getTime()) return date
    return earliest
  }, null)

  const adjustments = allSkus.length && earliestLatestSnapshotDate
    ? await prisma.productStockAdjustment.findMany({
        where: {
          sku: { in: allSkus },
          adjustmentDate: {
            gt: earliestLatestSnapshotDate,
            lt: endExclusive,
          },
        },
        select: {
          sku: true,
          quantity: true,
          adjustmentDate: true,
        },
      })
    : []

  const orderItems = allSkus.length && earliestLatestSnapshotDate
    ? await prisma.productOrderItem.findMany({
        where: {
          productMatched: true,
          stockConsumedQty: { gt: 0 },
          sellerSku: { in: allSkus },
          paidDate: {
            gt: earliestLatestSnapshotDate,
            lt: endExclusive,
          },
        },
        select: {
          sellerSku: true,
          paidDate: true,
          stockConsumedQty: true,
        },
      })
    : []

  const adjustmentsByProductId = new Map<string, typeof adjustments>()
  adjustments.forEach((adjustment) => {
    const productIds = skuToProductIds.get(strictInventorySkuKey(adjustment.sku))
    productIds?.forEach((productId) => {
      const bucket = adjustmentsByProductId.get(productId) || []
      bucket.push(adjustment)
      adjustmentsByProductId.set(productId, bucket)
    })
  })

  const orderItemsByProductId = new Map<string, typeof orderItems>()
  orderItems.forEach((item) => {
    const productIds = skuToProductIds.get(strictInventorySkuKey(item.sellerSku))
    productIds?.forEach((productId) => {
      const bucket = orderItemsByProductId.get(productId) || []
      bucket.push(item)
      orderItemsByProductId.set(productId, bucket)
    })
  })

  const result = new Map<string, CurrentInventoryResult>()
  products.forEach((product) => {
    const productSnapshots = (snapshotsByProductId.get(product.id) || [])
      .sort((a, b) => b.date.getTime() - a.date.getTime())
    const selectedSnapshot = productSnapshots[0] || null
    const previousSnapshot = productSnapshots[1] || null
    const resolved = selectedSnapshot ? resolveInventorySnapshotQuantity(selectedSnapshot) : null
    const snapshotStock = resolved?.quantity ?? null
    const snapshotAdjustmentAfterQty = selectedSnapshot
      ? (adjustmentsByProductId.get(product.id) || []).reduce((sum, row) => (
          row.adjustmentDate > selectedSnapshot.date && row.adjustmentDate < endExclusive
            ? sum + row.quantity
            : sum
        ), 0)
      : 0
    const snapshotConsumedAfterQty = selectedSnapshot
      ? (orderItemsByProductId.get(product.id) || []).reduce((sum, row) => (
          row.paidDate > selectedSnapshot.date && row.paidDate < endExclusive
            ? sum + (row.stockConsumedQty || 0)
            : sum
        ), 0)
      : 0
    const fallbackStock = product.stock ?? 0
    const currentStock = selectedSnapshot
      ? Math.max((snapshotStock ?? 0) + snapshotAdjustmentAfterQty - snapshotConsumedAfterQty, 0)
      : Math.max(fallbackStock, 0)
    const source = selectedSnapshot
      ? resolved?.source === 'totalQty' ? 'snapshot_total' : 'snapshot_available_locked'
      : product.stock !== null && product.stock !== undefined ? 'product_stock_fallback' : 'none'

    result.set(product.id, {
      productId: product.id,
      currentStock,
      snapshotStock,
      selectedSnapshot,
      previousSnapshot,
      snapshotAdjustmentAfterQty,
      snapshotConsumedAfterQty,
      hasSnapshot: Boolean(selectedSnapshot),
      source,
    })
  })

  return result
}
