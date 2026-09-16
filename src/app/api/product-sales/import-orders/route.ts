import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import * as XLSX from 'xlsx'
import { authOptions } from '@/lib/auth'
import { buildImportRowRecords, parseImportFile } from '@/lib/import-file-parser'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { buildOrderLineIdentityResolver, findOrderFileDuplicates, ORDER_LINE_CLASSIFICATION, ORDER_PLATFORM, OrderLineClassification, parseOrderCalendarDate, parseOrderMerchandiseAmount } from '@/lib/order-data-closure'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Stage =
  | 'start'
  | 'receive-file'
  | 'parse-file'
  | 'aggregate'
  | 'match-products'
  | 'upsert-order-items'
  | 'rebuild-performance'
  | 'write-performance'
  | 'done'

type ImportMode = 'import' | 'dryRun' | 'checkOnly'

type OrderFailure = {
  row: number
  sku: string
  paidTime: string
  quantity: number
  returnQty: number
  reason: string
}

type ParsedOrderItem = {
  skuSubtotalAfterDiscount: Prisma.Decimal
  row: number
  dedupeKey: string
  orderId: string
  skuId: string | null
  tiktokProductId: string | null
  sellerSku: string
  paidDate: Date
  paidDateStr: string
  paidTime: Date | null
  rawPaidTime: string
  quantity: number
  returnQty: number
  netQty: number
  canceledQty: number
  stockConsumedQty: number
  isSample: boolean
  sampleQty: number
  buyerUsername: string
  buyerNickname: string
  recipient: string
  refundAmount: number
  orderStatus: string
  cancelationReturnType: string
  lineClassification: OrderLineClassification | null
  resolvedProductId: string | null
  canonicalSku: string | null
}

type ProductOrderItemWriteRow = {
  skuSubtotalAfterDiscount: Prisma.Decimal
  dedupeKey: string
  orderId: string
  skuId: string | null
  tiktokProductId: string | null
  sellerSku: string
  paidDate: Date
  paidTime: Date | null
  quantity: number
  returnQty: number
  netQty: number
  canceledQty: number
  stockConsumedQty: number
  isSample: boolean
  sampleQty: number
  buyerUsername: string | null
  buyerNickname: string | null
  recipient: string | null
  refundAmount: number
  orderStatus: string | null
  cancelationReturnType: string | null
  productMatched: boolean
  lineClassification: OrderLineClassification
  shopKey: string
  resolvedProductId: string | null
  sourceFileName: string | null
  rawPaidTime: string | null
}

type AggregatedOrderStat = {
  merchandiseAmount: Prisma.Decimal | null
  sku: string
  dateStr: string
  productName: string | null
  grossOrders: number
  returnQty: number
  netOrders: number
  canceledQty: number
  stockConsumedQty: number
  sampleQty: number
  refundAmount: number
}

type AffectedPair = {
  sku: string
  dateStr: string
}

const WRITE_BATCH_SIZE = 200
const LOOKUP_BATCH_SIZE = 500
const TIMEOUT_GUARD_MS = 45_000
const EXPECTED_TIKTOK_SHOP_KEY = 'tiktok-us-sunnymay-primary'
const SAMPLE_ORDER_AMOUNT_FIELDS = [
  'Order Amount',
  'SKU Unit Original Price',
  'SKU Subtotal Before Discount',
  'SKU Subtotal After Discount',
]
const SAMPLE_ORDER_KEYWORD_FIELDS = [
  'Order Type',
  'Order Note',
  'Seller Note',
  'Buyer Message',
  'Remark',
  'Remarks',
  'Tags',
  'Promotion Name',
  'Campaign Name',
]
const SAMPLE_ORDER_EMPTY_FIELDS = [
  'Payment Method',
  'Normal or Pre-order',
]

function normalizeHeader(value: unknown) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim()
}

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value.trim() : String(value).trim()
}

function parseNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  const text = normalizeCell(value)
  if (!text || text === '/' || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') {
    return 0
  }

  const parsed = Number(text.replace(/[\$,]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function formatDateKey(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map((part) => Number(part))
  return new Date(Date.UTC(year, month - 1, day))
}

function parseDateValue(value: unknown): { paidDate: Date; paidTime: Date | null; dateStr: string } | null {
  if (typeof value === 'string') return parseOrderCalendarDate(value)
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const paidTime = new Date(value)
    const dateStr = formatDateKey(paidTime)
    return {
      paidDate: createDate(dateStr),
      paidTime,
      dateStr,
    }
  }

  if (typeof value === 'number') {
    const code = XLSX.SSF?.parse_date_code ? XLSX.SSF.parse_date_code(value) : null
    if (code) {
      const paidTime = new Date(
        code.y,
        (code.m || 1) - 1,
        code.d || 1,
        code.H || 0,
        code.M || 0,
        Math.floor(code.S || 0),
        0,
      )
      const dateStr = formatDateKey(paidTime)
      return {
        paidDate: createDate(dateStr),
        paidTime,
        dateStr,
      }
    }
  }

  const text = normalizeCell(value).replace(/\t/g, '').trim()
  if (!text) return null

  const slashMatched = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?/i,
  )
  if (slashMatched) {
    const [, monthText, dayText, yearText, hourText, minuteText, secondText, meridiem] = slashMatched
    let hour = Number(hourText || 0)
    const minute = Number(minuteText || 0)
    const second = Number(secondText || 0)

    if (meridiem) {
      const normalizedMeridiem = meridiem.toLowerCase()
      if (normalizedMeridiem === 'pm' && hour < 12) hour += 12
      if (normalizedMeridiem === 'am' && hour === 12) hour = 0
    }

    const paidTime = new Date(
      Number(yearText),
      Number(monthText) - 1,
      Number(dayText),
      hour,
      minute,
      second,
      0,
    )
    if (!Number.isNaN(paidTime.getTime())) {
      const dateStr = formatDateKey(paidTime)
      return {
        paidDate: createDate(dateStr),
        paidTime,
        dateStr,
      }
    }
  }

  const dashMatched = text.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  )
  if (dashMatched) {
    const [, yearText, monthText, dayText, hourText, minuteText, secondText] = dashMatched
    const paidTime = new Date(
      Number(yearText),
      Number(monthText) - 1,
      Number(dayText),
      Number(hourText || 0),
      Number(minuteText || 0),
      Number(secondText || 0),
      0,
    )
    if (!Number.isNaN(paidTime.getTime())) {
      const dateStr = formatDateKey(paidTime)
      return {
        paidDate: createDate(dateStr),
        paidTime,
        dateStr,
      }
    }
  }

  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) {
    const dateStr = formatDateKey(parsed)
    return {
      paidDate: createDate(dateStr),
      paidTime: parsed,
      dateStr,
    }
  }

  return null
}

function isCanceledOrder(orderStatus: string, cancelReturnType: string) {
  const status = normalizeCell(orderStatus).toLowerCase()
  const cancelType = normalizeCell(cancelReturnType).toLowerCase()

  return (
    status === '已取消' ||
    status === 'cancelled' ||
    status === 'canceled' ||
    cancelType === 'cancel'
  )
}

function isPreShipmentCancellation(orderStatus: string, cancelReturnType: string) {
  const status = normalizeCell(orderStatus).toLowerCase()
  const cancelType = normalizeCell(cancelReturnType).toLowerCase()

  const canceledStatus = (
    status === '已取消' ||
    status === 'cancelled' ||
    status === 'canceled'
  )

  return canceledStatus && cancelType === 'cancel'
}

function resolveStockConsumedQty(quantity: number, orderStatus: string, cancelReturnType: string) {
  return isPreShipmentCancellation(orderStatus, cancelReturnType) ? 0 : quantity
}

function resolveOrderDate(record: Record<string, unknown>) {
  const rawPaidTime = normalizeCell(record['Paid Time'])
  const rawCreatedTime = normalizeCell(record['Created Time'])

  if (rawPaidTime) {
    return {
      rawTime: rawPaidTime,
      source: 'Paid Time',
      parsedDate: parseDateValue(record['Paid Time']),
    }
  }

  if (rawCreatedTime) {
    return {
      rawTime: rawCreatedTime,
      source: 'Created Time',
      parsedDate: parseDateValue(record['Created Time']),
    }
  }

  return {
    rawTime: '',
    source: 'Paid Time / Created Time',
    parsedDate: null,
  }
}

function looksLikeSampleKeyword(value: string) {
  return /(sample|free sample|gift|寄样|样品|赠品)/i.test(value)
}

function resolveSampleOrder(record: Record<string, unknown>) {
  const strongZeroAmountMatched = SAMPLE_ORDER_AMOUNT_FIELDS.every((field) => {
    const rawValue = record[field]
    const text = normalizeCell(rawValue)
    if (!text && rawValue !== 0) return false
    return parseNumber(rawValue) === 0
  })
  const strongEmptyFieldMatched = SAMPLE_ORDER_EMPTY_FIELDS.every((field) => !normalizeCell(record[field]))

  if (strongZeroAmountMatched && strongEmptyFieldMatched) {
    return {
      isSample: true,
      reason: 'zero-amount-strong-rule',
    }
  }

  const keywordMatched = SAMPLE_ORDER_KEYWORD_FIELDS.some((field) => {
    const value = normalizeCell(record[field])
    return value ? looksLikeSampleKeyword(value) : false
  })

  return {
    isSample: keywordMatched,
    reason: keywordMatched ? 'keyword' : '',
  }
}

function buildSampleRecipientKey(item: {
  buyerUsername?: string | null
  buyerNickname?: string | null
  recipient?: string | null
}) {
  const buyerUsername = normalizeCell(item.buyerUsername).toLowerCase()
  const buyerNickname = normalizeCell(item.buyerNickname).toLowerCase()
  const recipient = normalizeCell(item.recipient).toLowerCase()

  if (!buyerUsername && !buyerNickname && !recipient) {
    return 'unknown'
  }

  return `${buyerUsername}__${buyerNickname}__${recipient}`
}

function buildDedupeKey(orderId: string, skuId: string | null, sellerSku: string) {
  if (!orderId) return null
  if (skuId) return `${orderId}::${skuId}`
  if (sellerSku) return `${orderId}::${sellerSku}`
  return null
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function createTimeoutResponse(stage: Stage, processedCount: number, remainingCount: number) {
  return NextResponse.json(
    {
      error: '导入订单表超时保护',
      detail: `已处理到 ${stage} 阶段，建议分批导入或使用后台任务`,
      stage,
      processedCount,
      remainingCount,
    },
    { status: 408 },
  )
}

function buildSummary(orderItems: Array<{
  sellerSku: string
  paidDateStr: string
  quantity: number
  returnQty: number
  netQty: number
  canceledQty: number
  stockConsumedQty: number
  isSample?: boolean
  refundAmount: number
}>) {
  const summaryByDateMap = new Map<string, {
    date: string
    grossOrders: number
    returnQty: number
    netOrders: number
    canceledQty: number
    stockConsumedQty: number
    refundAmount: number
  }>()

  const summaryBySkuMap = new Map<string, {
    sku: string
    grossOrders: number
    returnQty: number
    netOrders: number
    canceledQty: number
    stockConsumedQty: number
    refundAmount: number
  }>()

  orderItems.forEach((item) => {
    const byDate = summaryByDateMap.get(item.paidDateStr) || {
      date: item.paidDateStr,
      grossOrders: 0,
      returnQty: 0,
      netOrders: 0,
      canceledQty: 0,
      stockConsumedQty: 0,
      refundAmount: 0,
    }
    byDate.grossOrders += item.isSample ? 0 : item.quantity
    byDate.returnQty += item.returnQty
    byDate.netOrders += item.netQty
    byDate.canceledQty += item.canceledQty
    byDate.stockConsumedQty += item.stockConsumedQty
    byDate.refundAmount += item.refundAmount
    summaryByDateMap.set(item.paidDateStr, byDate)

    const bySku = summaryBySkuMap.get(item.sellerSku) || {
      sku: item.sellerSku,
      grossOrders: 0,
      returnQty: 0,
      netOrders: 0,
      canceledQty: 0,
      stockConsumedQty: 0,
      refundAmount: 0,
    }
    bySku.grossOrders += item.isSample ? 0 : item.quantity
    bySku.returnQty += item.returnQty
    bySku.netOrders += item.netQty
    bySku.canceledQty += item.canceledQty
    bySku.stockConsumedQty += item.stockConsumedQty
    bySku.refundAmount += item.refundAmount
    summaryBySkuMap.set(item.sellerSku, bySku)
  })

  const summaryByDate = Array.from(summaryByDateMap.values()).sort((a, b) => a.date.localeCompare(b.date))
  const summaryBySku = Array.from(summaryBySkuMap.values()).sort((a, b) => a.sku.localeCompare(b.sku))
  const totalGrossOrders = summaryBySku.reduce((sum, item) => sum + item.grossOrders, 0)
  const totalReturnQty = summaryBySku.reduce((sum, item) => sum + item.returnQty, 0)
  const totalNetOrders = summaryBySku.reduce((sum, item) => sum + item.netOrders, 0)
  const totalCanceledQty = summaryBySku.reduce((sum, item) => sum + item.canceledQty, 0)
  const totalStockConsumedQty = summaryBySku.reduce((sum, item) => sum + item.stockConsumedQty, 0)
  const totalRefundAmount = Number(
    summaryBySku.reduce((sum, item) => sum + item.refundAmount, 0).toFixed(2),
  )

  return {
    summaryByDate,
    summaryBySku,
    totalGrossOrders,
    totalReturnQty,
    totalNetOrders,
    totalCanceledQty,
    totalStockConsumedQty,
    totalRefundAmount,
  }
}

function buildSampleSummary(orderItems: Array<{
  sellerSku: string
  quantity: number
  isSample: boolean
  sampleQty: number
  buyerUsername: string
  buyerNickname: string
  recipient: string
}>) {
  const sampleItems = orderItems.filter((item) => item.isSample && item.sampleQty > 0)
  const sampleBySkuMap = new Map<string, {
    sku: string
    sampleQty: number
    sampleRows: number
  }>()
  const sampleByRecipientMap = new Map<string, {
    buyerUsername: string
    buyerNickname: string
    recipient: string
    sampleQty: number
    sampleRows: number
    skus: Set<string>
  }>()
  const sampleByRecipientAndSkuMap = new Map<string, {
    buyerUsername: string
    buyerNickname: string
    recipient: string
    sku: string
    sampleQty: number
    sampleRows: number
  }>()

  sampleItems.forEach((item) => {
    const sampleBySku = sampleBySkuMap.get(item.sellerSku) || {
      sku: item.sellerSku,
      sampleQty: 0,
      sampleRows: 0,
    }
    sampleBySku.sampleQty += item.sampleQty
    sampleBySku.sampleRows += 1
    sampleBySkuMap.set(item.sellerSku, sampleBySku)

    const recipientKey = buildSampleRecipientKey(item)
    const sampleByRecipient = sampleByRecipientMap.get(recipientKey) || {
      buyerUsername: normalizeCell(item.buyerUsername),
      buyerNickname: normalizeCell(item.buyerNickname),
      recipient: normalizeCell(item.recipient),
      sampleQty: 0,
      sampleRows: 0,
      skus: new Set<string>(),
    }
    sampleByRecipient.sampleQty += item.sampleQty
    sampleByRecipient.sampleRows += 1
    sampleByRecipient.skus.add(item.sellerSku)
    sampleByRecipientMap.set(recipientKey, sampleByRecipient)

    const recipientSkuKey = `${recipientKey}__${item.sellerSku}`
    const sampleByRecipientAndSku = sampleByRecipientAndSkuMap.get(recipientSkuKey) || {
      buyerUsername: normalizeCell(item.buyerUsername),
      buyerNickname: normalizeCell(item.buyerNickname),
      recipient: normalizeCell(item.recipient),
      sku: item.sellerSku,
      sampleQty: 0,
      sampleRows: 0,
    }
    sampleByRecipientAndSku.sampleQty += item.sampleQty
    sampleByRecipientAndSku.sampleRows += 1
    sampleByRecipientAndSkuMap.set(recipientSkuKey, sampleByRecipientAndSku)
  })

  const sampleBySku = Array.from(sampleBySkuMap.values()).sort((a, b) => (
    b.sampleQty - a.sampleQty || b.sampleRows - a.sampleRows || a.sku.localeCompare(b.sku)
  ))
  const sampleByRecipient = Array.from(sampleByRecipientMap.values())
    .map((item) => ({
      buyerUsername: item.buyerUsername || 'unknown',
      buyerNickname: item.buyerNickname || '',
      recipient: item.recipient || '',
      sampleQty: item.sampleQty,
      sampleRows: item.sampleRows,
      skus: Array.from(item.skus).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => (
      b.sampleQty - a.sampleQty
      || b.sampleRows - a.sampleRows
      || a.buyerUsername.localeCompare(b.buyerUsername)
      || a.recipient.localeCompare(b.recipient)
    ))
  const sampleByRecipientAndSku = Array.from(sampleByRecipientAndSkuMap.values())
    .map((item) => ({
      buyerUsername: item.buyerUsername || 'unknown',
      buyerNickname: item.buyerNickname || '',
      recipient: item.recipient || '',
      sku: item.sku,
      sampleQty: item.sampleQty,
      sampleRows: item.sampleRows,
    }))
    .sort((a, b) => (
      b.sampleQty - a.sampleQty
      || b.sampleRows - a.sampleRows
      || a.buyerUsername.localeCompare(b.buyerUsername)
      || a.sku.localeCompare(b.sku)
    ))

  return {
    sampleRows: sampleItems.length,
    sampleQty: sampleItems.reduce((sum, item) => sum + item.sampleQty, 0),
    sampleSkuCount: sampleBySku.length,
    sampleRecipientCount: sampleByRecipient.length,
    sampleBySku,
    sampleByRecipient,
    sampleByRecipientAndSku,
  }
}

async function bulkUpsertProductOrderItems(batch: ProductOrderItemWriteRow[]) {
  if (!batch.length) return

  const now = new Date()
  const rows = batch.map((item) => Prisma.sql`(
    ${randomUUID()},
    ${item.dedupeKey},
    ${item.orderId},
    ${item.skuId},
    ${item.tiktokProductId},
    ${item.sellerSku},
    ${item.paidDate},
    ${item.paidTime},
    ${item.quantity},
    ${item.returnQty},
    ${item.netQty},
    ${item.canceledQty},
    ${item.stockConsumedQty},
    ${item.isSample},
    ${item.sampleQty},
    ${item.buyerUsername},
    ${item.buyerNickname},
    ${item.recipient},
    ${item.refundAmount},
    ${item.skuSubtotalAfterDiscount},
    ${item.orderStatus},
    ${item.cancelationReturnType},
    ${item.productMatched},
    ${item.lineClassification},
    ${item.shopKey},
    ${item.resolvedProductId},
    ${item.sourceFileName},
    ${item.rawPaidTime},
    ${now},
    ${now}
  )`)

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "ProductOrderItem" (
      "id",
      "dedupeKey",
      "orderId",
      "skuId",
      "tiktokProductId",
      "sellerSku",
      "paidDate",
      "paidTime",
      "quantity",
      "returnQty",
      "netQty",
      "canceledQty",
      "stockConsumedQty",
      "isSample",
      "sampleQty",
      "buyerUsername",
      "buyerNickname",
      "recipient",
      "refundAmount",
      "skuSubtotalAfterDiscount",
      "orderStatus",
      "cancelationReturnType",
      "productMatched",
      "lineClassification",
      "shopKey",
      "resolvedProductId",
      "sourceFileName",
      "rawPaidTime",
      "createdAt",
      "updatedAt"
    )
    VALUES ${Prisma.join(rows)}
    ON CONFLICT ("dedupeKey") DO UPDATE SET
      "orderId" = EXCLUDED."orderId",
      "skuId" = EXCLUDED."skuId",
      "tiktokProductId" = EXCLUDED."tiktokProductId",
      "sellerSku" = EXCLUDED."sellerSku",
      "paidDate" = EXCLUDED."paidDate",
      "paidTime" = EXCLUDED."paidTime",
      "quantity" = EXCLUDED."quantity",
      "returnQty" = EXCLUDED."returnQty",
      "netQty" = EXCLUDED."netQty",
      "canceledQty" = EXCLUDED."canceledQty",
      "stockConsumedQty" = EXCLUDED."stockConsumedQty",
      "isSample" = EXCLUDED."isSample",
      "sampleQty" = EXCLUDED."sampleQty",
      "buyerUsername" = EXCLUDED."buyerUsername",
      "buyerNickname" = EXCLUDED."buyerNickname",
      "recipient" = EXCLUDED."recipient",
      "refundAmount" = EXCLUDED."refundAmount",
      "skuSubtotalAfterDiscount" = EXCLUDED."skuSubtotalAfterDiscount",
      "orderStatus" = EXCLUDED."orderStatus",
      "cancelationReturnType" = EXCLUDED."cancelationReturnType",
      "productMatched" = EXCLUDED."productMatched",
      "lineClassification" = EXCLUDED."lineClassification",
      "shopKey" = EXCLUDED."shopKey",
      "resolvedProductId" = EXCLUDED."resolvedProductId",
      "sourceFileName" = EXCLUDED."sourceFileName",
      "rawPaidTime" = EXCLUDED."rawPaidTime",
      "updatedAt" = CURRENT_TIMESTAMP
  `)
}

async function bulkUpsertPerformanceDaily(batch: AggregatedOrderStat[]) {
  if (!batch.length) return

  const now = new Date()
  const rows = batch.map((item) => Prisma.sql`(
    ${randomUUID()},
    ${item.sku},
    ${createDate(item.dateStr)},
    ${item.productName},
    ${item.netOrders},
    ${item.grossOrders},
    ${item.returnQty},
    ${item.netOrders},
    ${item.canceledQty},
    ${item.stockConsumedQty},
    ${item.sampleQty},
    ${item.refundAmount},
    ${item.merchandiseAmount},
    ${now},
    ${now}
  )`)

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "PerformanceDaily" (
      "id",
      "sku",
      "date",
      "productName",
      "orders",
      "grossOrders",
      "returnQty",
      "netOrders",
      "canceledQty",
      "stockConsumedQty",
      "sampleQty",
      "refundAmount",
      "merchandiseAmount",
      "createdAt",
      "updatedAt"
    )
    VALUES ${Prisma.join(rows)}
    ON CONFLICT ("date", "sku") DO UPDATE SET
      "productName" = EXCLUDED."productName",
      "orders" = EXCLUDED."orders",
      "grossOrders" = EXCLUDED."grossOrders",
      "returnQty" = EXCLUDED."returnQty",
      "netOrders" = EXCLUDED."netOrders",
      "canceledQty" = EXCLUDED."canceledQty",
      "stockConsumedQty" = EXCLUDED."stockConsumedQty",
      "sampleQty" = EXCLUDED."sampleQty",
      "refundAmount" = EXCLUDED."refundAmount",
      "merchandiseAmount" = EXCLUDED."merchandiseAmount",
      "updatedAt" = CURRENT_TIMESTAMP
  `)
}

async function clearPerformanceDailyOrderFacts(pairs: AffectedPair[]) {
  if (!pairs.length) return

  const rows = pairs.map((item) => Prisma.sql`(${item.sku}, ${createDate(item.dateStr)})`)
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "PerformanceDaily" AS pd SET
      "orders" = 0,
      "grossOrders" = 0,
      "returnQty" = 0,
      "netOrders" = 0,
      "canceledQty" = 0,
      "stockConsumedQty" = 0,
      "sampleQty" = 0,
      "refundAmount" = 0,
      "merchandiseAmount" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    FROM (
      VALUES ${Prisma.join(rows)}
    ) AS stale("sku", "date")
    WHERE pd."sku" = stale."sku"
      AND pd."date" = stale."date"
  `)
}

async function loadExistingOrderItems(dedupeKeys: string[]) {
  const existing = await Promise.all(
    chunkArray(dedupeKeys, LOOKUP_BATCH_SIZE).map((batch) =>
      prisma.productOrderItem.findMany({
        where: {
          dedupeKey: {
            in: batch,
          },
        },
        select: {
          dedupeKey: true,
          sellerSku: true,
          paidDate: true,
          resolvedProductId: true,
          lineClassification: true,
        },
      }),
    ),
  )

  return existing.flat()
}

async function loadAggregatedMatchedOrderItems(
  pairs: AffectedPair[],
  productNameMap: Map<string, string>,
  sourceSkuMap: Map<string, string>,
  productSkuById: Map<string, string>,
) {
  if (!pairs.length) return [] as AggregatedOrderStat[]

  const rows = pairs.map((item) => Prisma.sql`(${item.sku}, ${createDate(item.dateStr)})`)
  const skuRows = Array.from(sourceSkuMap).map(([sourceSku, canonicalSku]) => Prisma.sql`(${sourceSku}, ${canonicalSku})`)
  const productRows = Array.from(productSkuById).map(([productId, canonicalSku]) => Prisma.sql`(${productId}, ${canonicalSku})`)
  const result = await prisma.$queryRaw<Array<{
    sku: string
    date: Date
    grossOrders: number | bigint | null
    returnQty: number | bigint | null
    netOrders: number | bigint | null
    canceledQty: number | bigint | null
    stockConsumedQty: number | bigint | null
    sampleQty: number | bigint | null
    refundAmount: number | string | null
    merchandiseAmount: Prisma.Decimal | null
    missingAmountCount: number | bigint
  }>>(Prisma.sql`
    WITH "affected"("sellerSku", "paidDate") AS (
      VALUES ${Prisma.join(rows)}
    ), "skuMap"("sourceSku", "canonicalSku") AS (
      VALUES ${Prisma.join(skuRows)}
    ), "productMap"("productId", "canonicalSku") AS (
      VALUES ${Prisma.join(productRows)}
    )
    SELECT
      COALESCE(pm."canonicalSku", sm."canonicalSku") AS "sku",
      poi."paidDate" AS "date",
      SUM(CASE WHEN poi."isSample" THEN 0 ELSE poi."quantity" END) AS "grossOrders",
      SUM(poi."returnQty") AS "returnQty",
      SUM(poi."netQty") AS "netOrders",
      SUM(poi."canceledQty") AS "canceledQty",
      SUM(poi."stockConsumedQty") AS "stockConsumedQty",
      SUM(poi."sampleQty") AS "sampleQty",
      SUM(poi."refundAmount") AS "refundAmount",
      SUM(poi."skuSubtotalAfterDiscount") AS "merchandiseAmount",
      COUNT(*) FILTER (WHERE poi."skuSubtotalAfterDiscount" IS NULL) AS "missingAmountCount"
    FROM "ProductOrderItem" AS poi
    LEFT JOIN "skuMap" AS sm
      ON sm."sourceSku" = poi."sellerSku"
    LEFT JOIN "productMap" AS pm
      ON pm."productId" = poi."resolvedProductId"
    INNER JOIN "affected" AS a
      ON a."sellerSku" = COALESCE(pm."canonicalSku", sm."canonicalSku")
     AND a."paidDate" = poi."paidDate"
    WHERE poi."productMatched" = true
      AND poi."lineClassification" IS DISTINCT FROM 'NON_MERCHANDISE_GIFT'
    GROUP BY COALESCE(pm."canonicalSku", sm."canonicalSku"), poi."paidDate"
  `)

  return result
    .map((item) => {
      const dateStr = formatDateKey(new Date(item.date))
      return {
        sku: item.sku,
        dateStr,
        productName: productNameMap.get(item.sku) || null,
        grossOrders: Number(item.grossOrders || 0),
        returnQty: Number(item.returnQty || 0),
        netOrders: Number(item.netOrders || 0),
        canceledQty: Number(item.canceledQty || 0),
        stockConsumedQty: Number(item.stockConsumedQty || 0),
        sampleQty: Number(item.sampleQty || 0),
        refundAmount: Number(item.refundAmount || 0),
        merchandiseAmount: Number(item.missingAmountCount) > 0
          ? null
          : item.merchandiseAmount || new Prisma.Decimal('0'),
      }
    })
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.sku.localeCompare(b.sku))
}

export async function POST(request: NextRequest) {
  let stage: Stage = 'start'
  const startedAt = Date.now()

  const isTimedOut = () => Date.now() - startedAt > TIMEOUT_GUARD_MS

  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json(
        {
          error: '未登录或登录已过期',
          detail: '请重新登录后再导入订单表',
          stage,
        },
        { status: 401 },
      )
    }

    const permissionContext = getSessionPermissionContext(session)
    if (!canManagePage(permissionContext, 'productSales')) {
      return NextResponse.json(
        {
          error: '无权限操作销售库存',
          detail: '当前账号没有销售库存页面操作权限',
          stage,
        },
        { status: 403 },
      )
    }

    const dryRun = request.nextUrl.searchParams.get('dryRun') === '1'
    const checkOnly = request.nextUrl.searchParams.get('checkOnly') === '1'
    const mode: ImportMode = dryRun ? 'dryRun' : checkOnly ? 'checkOnly' : 'import'

    stage = 'receive-file'
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        {
          error: '请上传订单文件',
          stage,
        },
        { status: 400 },
      )
    }

    const sourceFileName = String(file.name || '').trim()
    const fileSize = typeof file.size === 'number' ? file.size : 0

    console.log('[import-orders] start', {
      fileName: sourceFileName,
      fileSize,
      mode,
    })

    if (isTimedOut()) {
      return createTimeoutResponse(stage, 0, 0)
    }

    stage = 'parse-file'
    let rows: Array<{ rowNumber: number; record: Record<string, unknown> }> = []

    try {
      const parsed = await parseImportFile(file, {
        preferredSheetNames: ['OrderSKUList'],
      })
      const built = buildImportRowRecords(parsed.rawRows, {
        headerRowIndex: 0,
        dataStartRowIndex: parsed.fileType === 'csv' ? 1 : 2,
      })
      rows = built.rowRecords as Array<{ rowNumber: number; record: Record<string, unknown> }>
    } catch (parseError) {
      console.error('解析订单文件失败:', parseError)
      return NextResponse.json(
        {
          error: parseError instanceof Error ? parseError.message : '导入订单表失败',
          detail: `解析订单文件失败：${String((parseError as Error)?.message || parseError)}`,
          stage,
        },
        { status: 400 },
      )
    }

    if (!rows.length) {
      return NextResponse.json(
        {
          error: '订单文件中没有可导入的数据',
          stage,
        },
        { status: 400 },
      )
    }

    const shopConfig = await prisma.config.findUnique({
      where: { key: 'tiktok_shop_key' },
      select: { value: true },
    })
    const shopKey = normalizeCell(shopConfig?.value)
    if (shopKey !== EXPECTED_TIKTOK_SHOP_KEY) {
      return NextResponse.json({
        success: false,
        mode,
        stage: 'parse-file',
        error: 'TikTok 店铺上下文未配置或不符合已批准配置，整批已停止且未写入数据库',
      }, { status: 422 })
    }

    const failures: OrderFailure[] = []
    const skippedRows: OrderFailure[] = []
    const parsedRows: ParsedOrderItem[] = []

    rows.forEach(({ rowNumber, record }) => {
      try {
        const orderId = normalizeCell(record['Order ID'])
        const skuId = normalizeCell(record['SKU ID']) || null
        const tiktokProductId = normalizeCell(record['Product ID']) || null
        const sellerSku = normalizeCell(record['Seller SKU'])
        const orderDate = resolveOrderDate(record)
        const rawPaidTime = orderDate.rawTime
        const quantity = Math.max(0, Math.round(parseNumber(record['Quantity'])))
        const returnQty = Math.max(0, Math.round(parseNumber(record['Sku Quantity of return'])))
        const orderStatus = normalizeCell(record['Order Status'])
        const cancelationReturnType = normalizeCell(record['Cancelation/Return Type'])
        const buyerUsername = normalizeCell(record['Buyer Username'])
        const buyerNickname = normalizeCell(record['Buyer Nickname'])
        const recipient = normalizeCell(record['Recipient'])
        const { isSample } = resolveSampleOrder(record)
        const refundAmount = isSample ? 0 : parseNumber(record['Order Refund Amount'])
        const skuSubtotalAfterDiscount = parseOrderMerchandiseAmount(record['SKU Subtotal After Discount'])

        if (!orderId) {
          failures.push({
            row: rowNumber,
            sku: sellerSku,
            paidTime: rawPaidTime,
            quantity,
            returnQty,
            reason: 'Order ID 为空，无法生成订单去重键',
          })
          return
        }

        if (!rawPaidTime) {
          failures.push({
            row: rowNumber,
            sku: sellerSku,
            paidTime: '',
            quantity,
            returnQty,
            reason: 'Paid Time / Created Time 为空',
          })
          return
        }

        if (!orderDate.parsedDate) {
          failures.push({
            row: rowNumber,
            sku: sellerSku,
            paidTime: rawPaidTime,
            quantity,
            returnQty,
            reason: `${orderDate.source} 无法解析`,
          })
          return
        }

        const dedupeKey = buildDedupeKey(orderId, skuId, sellerSku)
        if (!dedupeKey) {
          failures.push({
            row: rowNumber,
            sku: sellerSku,
            paidTime: rawPaidTime,
            quantity,
            returnQty,
            reason: '缺少可用的订单去重键',
          })
          return
        }

        const canceled = isCanceledOrder(orderStatus, cancelationReturnType)
        const canceledQty = isSample ? 0 : canceled ? quantity : 0
        const netQty = isSample ? 0 : canceled ? 0 : Math.max(quantity - returnQty, 0)
        const stockConsumedQty = resolveStockConsumedQty(quantity, orderStatus, cancelationReturnType)
        const sampleQty = isSample ? quantity : 0

        parsedRows.push({
          skuSubtotalAfterDiscount,
          row: rowNumber,
          dedupeKey,
          orderId,
          skuId,
          tiktokProductId,
          sellerSku,
          paidDate: orderDate.parsedDate.paidDate,
          paidDateStr: orderDate.parsedDate.dateStr,
          paidTime: orderDate.parsedDate.paidTime,
          rawPaidTime,
          quantity,
          returnQty: isSample ? 0 : returnQty,
          netQty,
          canceledQty,
          stockConsumedQty,
          isSample,
          sampleQty,
          buyerUsername,
          buyerNickname,
          recipient,
          refundAmount,
          orderStatus,
          cancelationReturnType,
          lineClassification: null,
          resolvedProductId: null,
          canonicalSku: null,
        })
      } catch (rowError) {
        console.error(`解析订单行失败: row ${rowNumber}`, rowError)
        failures.push({
          row: rowNumber,
          sku: normalizeCell(record['Seller SKU']),
          paidTime: normalizeCell(record['Paid Time']),
          quantity: Math.max(0, Math.round(parseNumber(record['Quantity']))),
          returnQty: Math.max(0, Math.round(parseNumber(record['Sku Quantity of return']))),
          reason: `订单行解析失败：${String((rowError as Error)?.message || rowError)}`,
        })
      }
    })

    const totalOrderRows = rows.length
    const validRows = parsedRows.length

    const duplicateDiagnostic = findOrderFileDuplicates(parsedRows)
    const duplicateInFileCount = duplicateDiagnostic.duplicateCount
    if (duplicateInFileCount > 0) {
      return NextResponse.json({
        success: false,
        mode,
        stage: 'parse-file',
        error: '上传文件内部存在重复订单行去重键，整批已停止且未写入数据库',
        duplicateInFileCount,
        keyTypes: duplicateDiagnostic.keyTypes,
      }, { status: 400 })
    }
    if (failures.length > 0 || skippedRows.length > 0) {
      return NextResponse.json({
        success: false,
        mode,
        stage: 'parse-file',
        error: '订单文件存在无效行，整批已停止且未写入数据库',
        failedCount: failures.length,
        skippedCount: skippedRows.length,
        failedRows: failures.slice(0, 20),
        skippedRows: skippedRows.slice(0, 20),
      }, { status: 400 })
    }

    const dedupedItems = parsedRows
    const uniqueSkus = Array.from(new Set(dedupedItems.map((item) => item.sellerSku).filter(Boolean)))
    const dedupeKeyCount = dedupedItems.length

    if (!dedupedItems.length) {
      return NextResponse.json(
        {
          success: false,
          mode,
          stage: 'parse-file',
          fileName: sourceFileName,
          fileSize,
          totalOrderRows,
          parsedRows: totalOrderRows,
          validRows: 0,
          orderItemCount: 0,
          dedupeKeyCount: 0,
          duplicateInFileCount,
          uniqueSkuCount: 0,
          matchedSkuCount: 0,
          missingSkuCount: 0,
          missingSkuRows: 0,
          skippedCount: skippedRows.length,
          missingSkus: [],
          successCount: 0,
          insertedOrderItemCount: 0,
          updatedOrderItemCount: 0,
          aggregatedRecordCount: 0,
          skippedRows: skippedRows.slice(0, 20),
          failedCount: failures.length,
          failedRows: failures.slice(0, 20),
          summaryByDate: [],
          summaryBySku: [],
          totalGrossOrders: 0,
          totalReturnQty: 0,
          totalNetOrders: 0,
          totalCanceledQty: 0,
          totalStockConsumedQty: 0,
          totalRefundAmount: 0,
          sampleRows: 0,
          sampleQty: 0,
          sampleSkuCount: 0,
          sampleRecipientCount: 0,
          sampleBySku: [],
          sampleByRecipient: [],
          sampleByRecipientAndSku: [],
          hint: null,
        },
        { status: 400 },
      )
    }

    if (isTimedOut()) {
      return createTimeoutResponse('parse-file', dedupeKeyCount, 0)
    }

    stage = 'match-products'
    const [products, aliases, externalIdentifiers, classificationRules] = await Promise.all([
      prisma.product.findMany({
        select: {
          id: true,
          sku: true,
          name: true,
        },
      }),
      prisma.productSkuAlias.findMany({
        include: {
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.productExternalIdentifier.findMany({
        where: { platform: ORDER_PLATFORM, shopKey },
        select: { platform: true, shopKey: true, identifierType: true, identifierValue: true, productId: true },
      }),
      prisma.orderLineClassificationRule.findMany({
        where: { platform: ORDER_PLATFORM, shopKey },
        select: { platform: true, shopKey: true, identityKey: true, classification: true, requireZeroAmount: true },
      }),
    ])

    const identityResolver = buildOrderLineIdentityResolver({
      products,
      aliases: aliases.map(alias => ({ productId: alias.productId, aliasSku: alias.aliasSku })),
      externalIdentifiers,
      classificationRules,
      platform: ORDER_PLATFORM,
      shopKey,
    })
    const sourceSkuMap = new Map(Array.from(identityResolver.strictSkuResolver.matched).map(([sourceSku, match]) => [sourceSku, match.sku]))
    const matchedSkuNameMap = new Map(products.flatMap(product => product.sku ? [[product.sku, product.name] as const] : []))
    const productSkuById = new Map(products.flatMap(product => product.sku ? [[product.id, product.sku] as const] : []))
    const identityFailures: Array<{ row: number; status: string; sku: string; skuId: string | null; tiktokProductId: string | null }> = []
    let missingProductIdCorroborationRows = 0

    dedupedItems.forEach(item => {
      const result = identityResolver.resolve(item)
      if (result.missingProductIdCorroboration) missingProductIdCorroborationRows += 1
      if (result.status === ORDER_LINE_CLASSIFICATION.MERCHANDISE) {
        item.lineClassification = ORDER_LINE_CLASSIFICATION.MERCHANDISE
        item.resolvedProductId = result.product.id
        item.canonicalSku = result.product.sku
        return
      }
      if (result.status === ORDER_LINE_CLASSIFICATION.GIFT) {
        item.lineClassification = ORDER_LINE_CLASSIFICATION.GIFT
        item.resolvedProductId = null
        item.canonicalSku = null
        item.netQty = 0
        item.stockConsumedQty = 0
        item.isSample = false
        item.sampleQty = 0
        return
      }
      identityFailures.push({
        row: item.row,
        status: result.status,
        sku: item.sellerSku,
        skuId: item.skuId,
        tiktokProductId: item.tiktokProductId,
      })
    })

    const unresolvedRows = identityFailures.filter(item => item.status === 'UNRESOLVED').length
    const ambiguousRows = identityFailures.filter(item => item.status === 'AMBIGUOUS').length
    const identityConflictRows = identityFailures.filter(item => item.status === 'IDENTITY_CONFLICT').length
    const amountConstraintFailedRows = identityFailures.filter(item => item.status === 'AMOUNT_CONSTRAINT_FAILED').length
    if (identityFailures.length > 0) {
      return NextResponse.json({
        success: false,
        mode,
        stage,
        error: '存在未解析、歧义、身份冲突或分类约束失败的订单行，整批已停止且未写入数据库',
        unresolvedRows,
        ambiguousRows,
        identityConflictRows,
        amountConstraintFailedRows,
        identityFailures: identityFailures.slice(0, 100),
      }, { status: 422 })
    }

    stage = 'aggregate'
    const merchandiseItems = dedupedItems.filter(item => item.lineClassification === ORDER_LINE_CLASSIFICATION.MERCHANDISE)
    const fileSummary = buildSummary(merchandiseItems)
    const sampleSummary = buildSampleSummary(dedupedItems)
    const merchandiseRows = merchandiseItems.length
    const giftRows = dedupedItems.filter(item => item.lineClassification === ORDER_LINE_CLASSIFICATION.GIFT).length
    const jyRows = dedupedItems.filter(item => item.skuId === '1732135082434531723' && item.tiktokProductId === '1732135060990824843')
    const fgRows = dedupedItems.filter(item => item.sellerSku === 'FG+GQ')
    const giaRows = dedupedItems.filter(item => !item.sellerSku && item.skuId === '1732408361669792139' && item.tiktokProductId === '1732408351320740235')
    const sumAmount = (items: ParsedOrderItem[]) => items.reduce((sum, item) => sum.plus(item.skuSubtotalAfterDiscount), new Prisma.Decimal('0'))

    if (isTimedOut()) {
      return createTimeoutResponse('aggregate', dedupeKeyCount, 0)
    }

    if (checkOnly || dryRun) {
      return NextResponse.json({
        success: true,
        mode,
        stage,
        fileName: sourceFileName,
        fileSize,
        totalOrderRows,
        parsedRows: totalOrderRows,
        validRows,
        orderItemCount: dedupeKeyCount,
        dedupeKeyCount,
        duplicateInFileCount,
        uniqueSkuCount: uniqueSkus.length,
        matchedSkuCount: uniqueSkus.length,
        missingSkuCount: 0,
        missingSkuRows: 0,
        skippedCount: skippedRows.length,
        missingSkus: [],
        merchandiseRows,
        giftRows,
        unresolvedRows,
        ambiguousRows,
        identityConflictRows,
        amountConstraintFailedRows,
        missingProductIdCorroborationRows,
        giaMaxi: { rows: giaRows.length, resolvedSku: giaRows[0]?.canonicalSku || null, rawAmount: sumAmount(giaRows).toFixed(2) },
        jy37037: { rows: jyRows.length, rawAmount: sumAmount(jyRows).toFixed(2), operatingContribution: '0.00' },
        fgGq: { rows: fgRows.length, rawAmount: sumAmount(fgRows).toFixed(2), operatingContribution: '0.00' },
        successCount: 0,
        insertedOrderItemCount: 0,
        updatedOrderItemCount: 0,
        aggregatedRecordCount: fileSummary.summaryByDate.length,
        skippedRows: skippedRows.slice(0, 20),
        failedCount: failures.length,
        failedRows: failures.slice(0, 20),
        summaryByDate: fileSummary.summaryByDate,
        summaryBySku: fileSummary.summaryBySku,
        totalGrossOrders: fileSummary.totalGrossOrders,
        totalReturnQty: fileSummary.totalReturnQty,
        totalNetOrders: fileSummary.totalNetOrders,
        totalCanceledQty: fileSummary.totalCanceledQty,
        totalStockConsumedQty: fileSummary.totalStockConsumedQty,
        totalRefundAmount: fileSummary.totalRefundAmount,
        sampleRows: sampleSummary.sampleRows,
        sampleQty: sampleSummary.sampleQty,
        sampleSkuCount: sampleSummary.sampleSkuCount,
        sampleRecipientCount: sampleSummary.sampleRecipientCount,
        sampleBySku: sampleSummary.sampleBySku,
        sampleByRecipient: sampleSummary.sampleByRecipient,
        sampleByRecipientAndSku: sampleSummary.sampleByRecipientAndSku,
        hint: null,
      })
    }

    if (isTimedOut()) {
      return createTimeoutResponse('match-products', dedupeKeyCount, 0)
    }

    stage = 'upsert-order-items'
    const existingItems = await loadExistingOrderItems(dedupedItems.map((item) => item.dedupeKey))
    const existingDedupeSet = new Set(existingItems.map((item) => item.dedupeKey))
    const insertedOrderItemCount = dedupedItems.filter((item) => !existingDedupeSet.has(item.dedupeKey)).length
    const updatedOrderItemCount = dedupedItems.length - insertedOrderItemCount

    const affectedPairMap = new Map<string, AffectedPair>()
    existingItems.forEach((item) => {
      const dateStr = formatDateKey(new Date(item.paidDate))
      const canonicalSku = item.resolvedProductId
        ? productSkuById.get(item.resolvedProductId)
        : sourceSkuMap.get(item.sellerSku)
      if (!canonicalSku) return
      const key = `${canonicalSku}__${dateStr}`
      affectedPairMap.set(key, {
        sku: canonicalSku,
        dateStr,
      })
    })

    const orderItemWrites: ProductOrderItemWriteRow[] = dedupedItems.map((item) => {
      if (item.lineClassification === ORDER_LINE_CLASSIFICATION.MERCHANDISE && item.canonicalSku) {
        const pairKey = `${item.canonicalSku}__${item.paidDateStr}`
        affectedPairMap.set(pairKey, {
          sku: item.canonicalSku,
          dateStr: item.paidDateStr,
        })
      }

      return {
        dedupeKey: item.dedupeKey,
        orderId: item.orderId,
        skuId: item.skuId,
        tiktokProductId: item.tiktokProductId,
        sellerSku: item.sellerSku,
        paidDate: item.paidDate,
        paidTime: item.paidTime,
        quantity: item.quantity,
        returnQty: item.returnQty,
        netQty: item.netQty,
        canceledQty: item.canceledQty,
        stockConsumedQty: item.stockConsumedQty,
        isSample: item.isSample,
        sampleQty: item.sampleQty,
        buyerUsername: item.buyerUsername,
        buyerNickname: item.buyerNickname,
        recipient: item.recipient,
        refundAmount: item.refundAmount,
        orderStatus: item.orderStatus || null,
        cancelationReturnType: item.cancelationReturnType || null,
        productMatched: item.lineClassification === ORDER_LINE_CLASSIFICATION.MERCHANDISE,
        lineClassification: item.lineClassification!,
        shopKey,
        resolvedProductId: item.resolvedProductId,
        skuSubtotalAfterDiscount: item.skuSubtotalAfterDiscount,
        sourceFileName: sourceFileName || null,
        rawPaidTime: item.rawPaidTime || null,
      }
    })

    const orderItemBatches = chunkArray(orderItemWrites, WRITE_BATCH_SIZE)
    for (let batchIndex = 0; batchIndex < orderItemBatches.length; batchIndex += 1) {
      if (isTimedOut()) {
        const processedCount = batchIndex * WRITE_BATCH_SIZE
        const remainingCount = orderItemWrites.length - processedCount
        return createTimeoutResponse(stage, processedCount, remainingCount)
      }

      await bulkUpsertProductOrderItems(orderItemBatches[batchIndex])
    }

    if (isTimedOut()) {
      return createTimeoutResponse('upsert-order-items', orderItemWrites.length, 0)
    }

    stage = 'rebuild-performance'
    const affectedPairs = Array.from(affectedPairMap.values())
    const aggregatedItems = await loadAggregatedMatchedOrderItems(affectedPairs, matchedSkuNameMap, sourceSkuMap, productSkuById)
    const aggregatedPairSet = new Set(aggregatedItems.map((item) => `${item.sku}__${item.dateStr}`))
    const stalePairs = affectedPairs.filter((item) => !aggregatedPairSet.has(`${item.sku}__${item.dateStr}`))

    if (isTimedOut()) {
      return createTimeoutResponse(stage, aggregatedItems.length, stalePairs.length)
    }

    stage = 'write-performance'
    const performanceBatches = chunkArray(aggregatedItems, WRITE_BATCH_SIZE)
    let successCount = 0

    for (let batchIndex = 0; batchIndex < performanceBatches.length; batchIndex += 1) {
      if (isTimedOut()) {
        const processedCount = batchIndex * WRITE_BATCH_SIZE
        const remainingCount = aggregatedItems.length - processedCount
        return createTimeoutResponse(stage, processedCount, remainingCount)
      }

      await bulkUpsertPerformanceDaily(performanceBatches[batchIndex])
      successCount += performanceBatches[batchIndex].length
    }

    const staleBatches = chunkArray(stalePairs, WRITE_BATCH_SIZE)
    for (let batchIndex = 0; batchIndex < staleBatches.length; batchIndex += 1) {
      if (isTimedOut()) {
        const processedCount = successCount + batchIndex * WRITE_BATCH_SIZE
        const remainingCount = stalePairs.length - batchIndex * WRITE_BATCH_SIZE
        return createTimeoutResponse(stage, processedCount, remainingCount)
      }

      await clearPerformanceDailyOrderFacts(staleBatches[batchIndex])
    }

    const writeSummary = buildSummary(
      aggregatedItems.map((item) => ({
        sellerSku: item.sku,
        paidDateStr: item.dateStr,
        quantity: item.grossOrders,
        returnQty: item.returnQty,
        netQty: item.netOrders,
        canceledQty: item.canceledQty,
        stockConsumedQty: item.stockConsumedQty,
        isSample: false,
        sampleQty: item.sampleQty,
        buyerUsername: '',
        buyerNickname: '',
        recipient: '',
        refundAmount: item.refundAmount,
      })),
    )

    stage = 'done'
    const importedBy = session.user?.name || session.user?.email || '系统'
    await prisma.performanceMeta.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', lastOrdersImportAt: new Date(), lastImportedBy: importedBy },
      update: { lastOrdersImportAt: new Date(), lastImportedBy: importedBy },
    })
    return NextResponse.json({
      success: true,
      mode,
      stage,
      fileName: sourceFileName,
      fileSize,
      totalOrderRows,
      parsedRows: totalOrderRows,
      validRows,
      orderItemCount: dedupeKeyCount,
      dedupeKeyCount,
      duplicateInFileCount,
      uniqueSkuCount: uniqueSkus.length,
      matchedSkuCount: uniqueSkus.length,
      missingSkuCount: 0,
      missingSkuRows: 0,
      skippedCount: skippedRows.length,
      missingSkus: [],
      merchandiseRows,
      giftRows,
      unresolvedRows,
      ambiguousRows,
      identityConflictRows,
      amountConstraintFailedRows,
      missingProductIdCorroborationRows,
      successCount,
      insertedOrderItemCount,
      updatedOrderItemCount,
      aggregatedRecordCount: aggregatedItems.length,
      skippedRows: skippedRows.slice(0, 20),
      failedCount: failures.length,
      failedRows: failures,
      summaryByDate: writeSummary.summaryByDate,
      summaryBySku: writeSummary.summaryBySku,
      totalGrossOrders: writeSummary.totalGrossOrders,
      totalReturnQty: writeSummary.totalReturnQty,
      totalNetOrders: writeSummary.totalNetOrders,
      totalCanceledQty: writeSummary.totalCanceledQty,
      totalStockConsumedQty: writeSummary.totalStockConsumedQty,
      totalRefundAmount: writeSummary.totalRefundAmount,
      sampleRows: sampleSummary.sampleRows,
      sampleQty: sampleSummary.sampleQty,
      sampleSkuCount: sampleSummary.sampleSkuCount,
      sampleRecipientCount: sampleSummary.sampleRecipientCount,
      sampleBySku: sampleSummary.sampleBySku,
      sampleByRecipient: sampleSummary.sampleByRecipient,
      sampleByRecipientAndSku: sampleSummary.sampleByRecipientAndSku,
      staleRecordCount: stalePairs.length,
      hint: null,
    })
  } catch (error) {
    console.error('导入订单数据失败:', error)
    return NextResponse.json(
      {
        error: '导入订单表失败',
        detail: String((error as Error)?.message || error),
        stage,
      },
      { status: 500 },
    )
  }
}
