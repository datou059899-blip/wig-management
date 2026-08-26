import { createHash } from 'crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  buildImportRowRecords,
  normalizeImportCell,
  parseImportFile,
  type ImportCellValue,
  type ParsedImportRowRecord,
} from '@/lib/import-file-parser'
import { normalizeSkuText } from '@/lib/product-sku-resolver'
import {
  buildEffectiveInventorySnapshotWhere,
  getCurrentInventoryByProduct,
  resolveInventorySnapshotQuantity,
} from '@/lib/productInventorySnapshots'

export const INVENTORY_BATCH_STATUS = {
  PREVIEW: 'PREVIEW',
  CONFIRMED: 'CONFIRMED',
  ROLLED_BACK: 'ROLLED_BACK',
} as const

export type InventoryBatchStatus = (typeof INVENTORY_BATCH_STATUS)[keyof typeof INVENTORY_BATCH_STATUS]

export type InventoryPreviewSourceRow = {
  rowNumber: number
  inputSku: string
  productName: string
  inputProductName?: string
  totalQty: number
}

export type InventoryPreviewMatchedRow = {
  rowNumber: number
  inputSku: string
  canonicalSku: string
  productId: string
  productName: string
  inputProductName?: string
  totalQty: number
  previousTotalQty: number | null
  diffQty: number | null
  sourceRows?: InventoryPreviewSourceRow[]
  resolution?: 'duplicate_merge_approved'
}

export type InventoryPreviewUnmatchedRow = {
  rowNumber: number
  inputSku: string
  totalQty: number | null
  reason: string
  kind?: 'unmatched' | 'duplicate_conflict'
  canonicalSku?: string
  productId?: string
  productName?: string
  inputProductName?: string
  previousTotalQty?: number | null
  diffQty?: number | null
}

export type InventorySummaryItem = {
  productId: string
  sku: string
  productName: string
  currentTotalStock: number | null
  previousTotalStock: number | null
  changeQty: number | null
  latestSnapshotAt: string | null
  source: 'snapshot' | 'product_stock_fallback' | 'none'
}

type StrictSkuProduct = {
  id: string
  name: string
  sku: string | null
  stock: number
  aliases: Array<{ aliasSku: string | null }>
}

type ParsedInventoryRows = {
  matchedRows: InventoryPreviewMatchedRow[]
  unmatchedRows: InventoryPreviewUnmatchedRow[]
  rowCount: number
  sheetName?: string
}

export const MAX_IMPORT_STOCK_QTY = 1_000_000

function strictSkuKey(value: string | null | undefined) {
  const normalized = normalizeSkuText(value)
  return normalized ? normalized.trim().toUpperCase() : ''
}

function parseInventoryQty(value: ImportCellValue) {
  const normalized = normalizeImportCell(value).replace(/,/g, '')
  if (!normalized) return { value: null, error: '总库存为空' }
  if (!/^-?\d+$/.test(normalized)) {
    return { value: null, error: '总库存必须是整数' }
  }

  const valueNumber = Number(normalized)
  if (!Number.isSafeInteger(valueNumber)) {
    return { value: null, error: '总库存数字格式异常' }
  }
  if (valueNumber < 0) {
    return { value: null, error: '总库存不能小于 0' }
  }
  if (valueNumber > MAX_IMPORT_STOCK_QTY) {
    return { value: null, error: `总库存超过安全上限 ${MAX_IMPORT_STOCK_QTY}，请人工检查` }
  }

  return { value: valueNumber, error: null }
}

function detectHeaderIndexes(rawRows: ImportCellValue[][]) {
  for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex += 1) {
    const row = rawRows[rowIndex] || []
    const headers = row.map((cell) => normalizeImportCell(cell))
    const skuIndex = headers.findIndex((header) =>
      ['商家 SKU', '商家SKU', 'SKU', 'seller sku', 'seller_sku'].some((target) =>
        header.toLowerCase() === target.toLowerCase(),
      ),
    )
    const totalIndex = headers.findIndex((header) =>
      ['总库存', 'total stock', 'totalqty', 'total qty', '库存'].some((target) =>
        header.replace(/\s+/g, '').toLowerCase() === target.replace(/\s+/g, '').toLowerCase(),
      ),
    )

    if (skuIndex >= 0 && totalIndex >= 0) {
      return { headerRowIndex: rowIndex, dataStartRowIndex: rowIndex + 1, skuIndex, totalIndex }
    }
  }

  return null
}


function isInventorySectionBoundary(row: ImportCellValue[], skuIndex: number) {
  const skuCell = normalizeImportCell(row[skuIndex])
  const nonEmptyCells = row.map((cell) => normalizeImportCell(cell)).filter(Boolean)
  const firstCell = nonEmptyCells[0] || ''
  const joined = nonEmptyCells.join(' ')

  if (!nonEmptyCells.length) return false
  if (/期货|订货/.test(firstCell)) return true
  if (/期货总数量|订货总数量/.test(joined)) return true
  if (skuCell === '产品/款式') return true

  return false
}

function sliceInventorySectionRows(
  rawRows: ImportCellValue[][],
  detected: { headerRowIndex: number; dataStartRowIndex: number; skuIndex: number },
) {
  const endRowIndex = rawRows.findIndex((row, rowIndex) => {
    if (rowIndex < detected.dataStartRowIndex) return false
    return isInventorySectionBoundary(row || [], detected.skuIndex)
  })

  if (endRowIndex < 0) return rawRows
  return rawRows.slice(0, endRowIndex)
}

function pickCell(record: Record<string, ImportCellValue>, names: string[]) {
  const entries = Object.entries(record)
  const matched = entries.find(([key]) =>
    names.some((name) => key.replace(/\s+/g, '').toLowerCase() === name.replace(/\s+/g, '').toLowerCase()),
  )
  return matched?.[1] ?? ''
}

function buildStrictSkuMap(products: StrictSkuProduct[]) {
  const map = new Map<string, StrictSkuProduct>()

  products.forEach((product) => {
    const productSkuKey = strictSkuKey(product.sku)
    if (productSkuKey && !map.has(productSkuKey)) {
      map.set(productSkuKey, product)
    }

    product.aliases.forEach((alias) => {
      const aliasKey = strictSkuKey(alias.aliasSku)
      if (aliasKey && !map.has(aliasKey)) {
        map.set(aliasKey, product)
      }
    })
  })

  return map
}

function uniqueStrictSkus(product: StrictSkuProduct) {
  const values = [product.sku, ...product.aliases.map((alias) => alias.aliasSku)]
  const seen = new Set<string>()
  return values.flatMap((value) => {
    const normalized = normalizeSkuText(value)
    const key = strictSkuKey(normalized)
    if (!normalized || !key || seen.has(key)) return []
    seen.add(key)
    return [normalized]
  })
}

export async function getInventoryFileHash(file: File) {
  const bytes = Buffer.from(await file.arrayBuffer())
  return createHash('sha256').update(bytes).digest('hex')
}

export function parseStockCapturedAt(value: FormDataEntryValue | null) {
  const text = String(value || '').trim()
  if (!text) return new Date()
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) {
    throw new Error('库存截点时间无效')
  }
  return date
}

export async function parseInventoryPreviewFile(file: File, stockCapturedAt: Date): Promise<ParsedInventoryRows> {
  const initial = await parseImportFile(file, {
    preferredSheetNames: ['SKU库存价格汇总', '库存汇总', 'Inventory', '库存'],
  })
  const detected = detectHeaderIndexes(initial.rawRows)
  if (!detected) {
    throw new Error('未找到包含“商家 SKU”和“总库存”的表头行')
  }

  const inventorySectionRows = sliceInventorySectionRows(initial.rawRows, detected)
  const built = buildImportRowRecords(inventorySectionRows, detected)
  const rowRecords = built.rowRecords
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      stock: true,
      aliases: { select: { aliasSku: true } },
    },
  })

  const skuMap = buildStrictSkuMap(products)
  const canonicalSkus = products.flatMap((product) => uniqueStrictSkus(product))
  const previousStockBySku = await getLatestEffectiveStockBySku(canonicalSkus, stockCapturedAt)
  const matchedRows: InventoryPreviewMatchedRow[] = []
  const unmatchedRows: InventoryPreviewUnmatchedRow[] = []

  rowRecords.forEach(({ rowNumber, record }) => {
    const inputSku = normalizeSkuText(String(pickCell(record, ['商家 SKU', '商家SKU', 'SKU', 'seller sku', 'seller_sku']) || ''))
    const inputProductName = normalizeImportCell(pickCell(record, ['SKU / 款式', 'SKU/款式', '款式', '产品', '产品名', '产品名称', '商品', '商品名', '商品名称', 'product', 'product name']))
    const totalQtyResult = parseInventoryQty(pickCell(record, ['总库存', 'total stock', 'totalqty', 'total qty', '库存']))

    if (!inputSku) {
      return
    }
    if (totalQtyResult.error || totalQtyResult.value === null) {
      unmatchedRows.push({ rowNumber, inputSku, totalQty: totalQtyResult.value, reason: totalQtyResult.error || '总库存异常', kind: 'unmatched' })
      return
    }

    const product = skuMap.get(strictSkuKey(inputSku))
    if (!product || !product.sku) {
      unmatchedRows.push({ rowNumber, inputSku, totalQty: totalQtyResult.value, reason: '未匹配到 canonical SKU 或明确 alias', kind: 'unmatched' })
      return
    }

    const canonicalSku = normalizeSkuText(product.sku)
    const previousTotalQty = previousStockBySku.get(canonicalSku) ?? null
    matchedRows.push({
      rowNumber,
      inputSku,
      canonicalSku,
      productId: product.id,
      productName: product.name,
      inputProductName,
      totalQty: totalQtyResult.value,
      previousTotalQty,
      diffQty: previousTotalQty === null ? null : totalQtyResult.value - previousTotalQty,
    })
  })

  const rowsByCanonicalSku = new Map<string, InventoryPreviewMatchedRow[]>()
  matchedRows.forEach((row) => {
    const key = strictSkuKey(row.canonicalSku)
    const bucket = rowsByCanonicalSku.get(key) || []
    bucket.push(row)
    rowsByCanonicalSku.set(key, bucket)
  })

  const dedupedMatchedRows: InventoryPreviewMatchedRow[] = []
  rowsByCanonicalSku.forEach((rows) => {
    if (rows.length === 1) {
      dedupedMatchedRows.push(rows[0])
      return
    }

    rows.forEach((row) => {
      unmatchedRows.push({
        rowNumber: row.rowNumber,
        inputSku: row.inputSku,
        totalQty: row.totalQty,
        reason: `重复 SKU 冲突：多行最终指向 canonical SKU ${row.canonicalSku}`,
        kind: 'duplicate_conflict',
        canonicalSku: row.canonicalSku,
        productId: row.productId,
        productName: row.productName,
        inputProductName: row.inputProductName,
        previousTotalQty: row.previousTotalQty,
        diffQty: row.diffQty,
      })
    })
  })

  return {
    matchedRows: dedupedMatchedRows,
    unmatchedRows,
    rowCount: rowRecords.length,
    sheetName: initial.sheetName,
  }
}

export async function getLatestEffectiveStockBySku(skus: string[], beforeDate?: Date) {
  const uniqueSkus = Array.from(new Set(skus.map((sku) => normalizeSkuText(sku)).filter(Boolean)))
  if (!uniqueSkus.length) return new Map<string, number | null>()

  const snapshots = await prisma.productInventorySnapshot.findMany({
    where: buildEffectiveInventorySnapshotWhere({
      sku: { in: uniqueSkus },
      ...(beforeDate ? { date: { lt: beforeDate } } : {}),
    }),
    select: {
      sku: true,
      date: true,
      totalQty: true,
      availableQty: true,
      lockedQty: true,
    },
    orderBy: [
      { sku: 'asc' },
      { date: 'desc' },
    ],
  })

  const result = new Map<string, number | null>()
  snapshots.forEach((snapshot) => {
    if (result.has(snapshot.sku)) return
    result.set(snapshot.sku, resolveInventorySnapshotQuantity(snapshot).quantity)
  })
  return result
}

export async function getInventorySummaryItems(): Promise<InventorySummaryItem[]> {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      stock: true,
      aliases: { select: { aliasSku: true } },
    },
    orderBy: { sku: 'asc' },
  })

  const currentInventoryByProductId = await getCurrentInventoryByProduct(products)

  return products.flatMap((product) => {
    if (!product.sku) return []
    const inventory = currentInventoryByProductId.get(product.id) || null
    const latest = inventory?.selectedSnapshot || null
    const previous = inventory?.previousSnapshot || null
    const latestQty = inventory ? inventory.currentStock : null
    const previousQty = previous ? resolveInventorySnapshotQuantity(previous).quantity : null

    return [{
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      currentTotalStock: latestQty ?? product.stock ?? null,
      previousTotalStock: previousQty,
      changeQty: latestQty === null || previousQty === null ? null : latestQty - previousQty,
      latestSnapshotAt: latest?.date.toISOString() ?? null,
      source: latest ? 'snapshot' as const : product.stock !== null ? 'product_stock_fallback' as const : 'none' as const,
    }]
  })
}

export function jsonRows<T>(value: Prisma.JsonValue | null | undefined): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}
