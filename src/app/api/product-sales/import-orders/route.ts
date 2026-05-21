import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import * as XLSX from 'xlsx'
import { authOptions } from '@/lib/auth'
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
  row: number
  dedupeKey: string
  orderId: string
  skuId: string | null
  sellerSku: string
  paidDate: Date
  paidDateStr: string
  paidTime: Date | null
  rawPaidTime: string
  quantity: number
  returnQty: number
  netQty: number
  canceledQty: number
  refundAmount: number
  orderStatus: string
  cancelationReturnType: string
}

type ProductOrderItemWriteRow = {
  dedupeKey: string
  orderId: string
  skuId: string | null
  sellerSku: string
  paidDate: Date
  paidTime: Date | null
  quantity: number
  returnQty: number
  netQty: number
  canceledQty: number
  refundAmount: number
  orderStatus: string | null
  cancelationReturnType: string | null
  productMatched: boolean
  sourceFileName: string | null
  rawPaidTime: string | null
}

type AggregatedOrderStat = {
  sku: string
  dateStr: string
  productName: string | null
  grossOrders: number
  returnQty: number
  netOrders: number
  canceledQty: number
  refundAmount: number
}

type AffectedPair = {
  sku: string
  dateStr: string
}

const WRITE_BATCH_SIZE = 200
const LOOKUP_BATCH_SIZE = 500
const TIMEOUT_GUARD_MS = 45_000

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
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map((part) => Number(part))
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

function parseDateValue(value: unknown): { paidDate: Date; paidTime: Date | null; dateStr: string } | null {
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

function buildDedupeKey(orderId: string, skuId: string | null, sellerSku: string) {
  if (!orderId) return null
  if (skuId) return `${orderId}::${skuId}`
  if (sellerSku) return `${orderId}::${sellerSku}`
  return null
}

function getNormalizedRowsFromSheet(sheet: XLSX.WorkSheet) {
  const rawRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: '',
  })

  if (!rawRows.length) return []

  const headerRow = Array.isArray(rawRows[0]) ? rawRows[0] : []
  const headers = headerRow.map((cell) => normalizeHeader(cell))

  return rawRows.slice(1).map((row, index) => {
    const record = headers.reduce<Record<string, unknown>>((acc, header, headerIndex) => {
      if (header) {
        acc[header] = Array.isArray(row) ? row[headerIndex] : ''
      }
      return acc
    }, {})

    return {
      rowNumber: index + 2,
      record,
    }
  })
}

function parseCsvText(text: string) {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell)
      currentCell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1
      }
      currentRow.push(currentCell)
      rows.push(currentRow)
      currentRow = []
      currentCell = ''
      continue
    }

    currentCell += char
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell)
    rows.push(currentRow)
  }

  if (!rows.length) return []

  const headers = (rows[0] || []).map((cell) => normalizeHeader(cell))
  return rows.slice(1).map((row, index) => {
    const record = headers.reduce<Record<string, unknown>>((acc, header, headerIndex) => {
      if (header) {
        acc[header] = row[headerIndex] ?? ''
      }
      return acc
    }, {})

    return {
      rowNumber: index + 2,
      record,
    }
  })
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
  refundAmount: number
}>) {
  const summaryByDateMap = new Map<string, {
    date: string
    grossOrders: number
    returnQty: number
    netOrders: number
    canceledQty: number
    refundAmount: number
  }>()

  const summaryBySkuMap = new Map<string, {
    sku: string
    grossOrders: number
    returnQty: number
    netOrders: number
    canceledQty: number
    refundAmount: number
  }>()

  orderItems.forEach((item) => {
    const byDate = summaryByDateMap.get(item.paidDateStr) || {
      date: item.paidDateStr,
      grossOrders: 0,
      returnQty: 0,
      netOrders: 0,
      canceledQty: 0,
      refundAmount: 0,
    }
    byDate.grossOrders += item.quantity
    byDate.returnQty += item.returnQty
    byDate.netOrders += item.netQty
    byDate.canceledQty += item.canceledQty
    byDate.refundAmount += item.refundAmount
    summaryByDateMap.set(item.paidDateStr, byDate)

    const bySku = summaryBySkuMap.get(item.sellerSku) || {
      sku: item.sellerSku,
      grossOrders: 0,
      returnQty: 0,
      netOrders: 0,
      canceledQty: 0,
      refundAmount: 0,
    }
    bySku.grossOrders += item.quantity
    bySku.returnQty += item.returnQty
    bySku.netOrders += item.netQty
    bySku.canceledQty += item.canceledQty
    bySku.refundAmount += item.refundAmount
    summaryBySkuMap.set(item.sellerSku, bySku)
  })

  const summaryByDate = Array.from(summaryByDateMap.values()).sort((a, b) => a.date.localeCompare(b.date))
  const summaryBySku = Array.from(summaryBySkuMap.values()).sort((a, b) => a.sku.localeCompare(b.sku))
  const totalGrossOrders = summaryBySku.reduce((sum, item) => sum + item.grossOrders, 0)
  const totalReturnQty = summaryBySku.reduce((sum, item) => sum + item.returnQty, 0)
  const totalNetOrders = summaryBySku.reduce((sum, item) => sum + item.netOrders, 0)
  const totalCanceledQty = summaryBySku.reduce((sum, item) => sum + item.canceledQty, 0)
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
    totalRefundAmount,
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
    ${item.sellerSku},
    ${item.paidDate},
    ${item.paidTime},
    ${item.quantity},
    ${item.returnQty},
    ${item.netQty},
    ${item.canceledQty},
    ${item.refundAmount},
    ${item.orderStatus},
    ${item.cancelationReturnType},
    ${item.productMatched},
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
      "sellerSku",
      "paidDate",
      "paidTime",
      "quantity",
      "returnQty",
      "netQty",
      "canceledQty",
      "refundAmount",
      "orderStatus",
      "cancelationReturnType",
      "productMatched",
      "sourceFileName",
      "rawPaidTime",
      "createdAt",
      "updatedAt"
    )
    VALUES ${Prisma.join(rows)}
    ON CONFLICT ("dedupeKey") DO UPDATE SET
      "orderId" = EXCLUDED."orderId",
      "skuId" = EXCLUDED."skuId",
      "sellerSku" = EXCLUDED."sellerSku",
      "paidDate" = EXCLUDED."paidDate",
      "paidTime" = EXCLUDED."paidTime",
      "quantity" = EXCLUDED."quantity",
      "returnQty" = EXCLUDED."returnQty",
      "netQty" = EXCLUDED."netQty",
      "canceledQty" = EXCLUDED."canceledQty",
      "refundAmount" = EXCLUDED."refundAmount",
      "orderStatus" = EXCLUDED."orderStatus",
      "cancelationReturnType" = EXCLUDED."cancelationReturnType",
      "productMatched" = EXCLUDED."productMatched",
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
    ${item.refundAmount},
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
      "refundAmount",
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
      "refundAmount" = EXCLUDED."refundAmount",
      "updatedAt" = CURRENT_TIMESTAMP
  `)
}

async function deletePerformanceDailyPairs(pairs: AffectedPair[]) {
  if (!pairs.length) return

  const rows = pairs.map((item) => Prisma.sql`(${item.sku}, ${createDate(item.dateStr)})`)
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "PerformanceDaily" AS pd
    USING (
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
        },
      }),
    ),
  )

  return existing.flat()
}

async function loadAggregatedMatchedOrderItems(
  pairs: AffectedPair[],
  productNameMap: Map<string, string>,
) {
  if (!pairs.length) return [] as AggregatedOrderStat[]

  const rows = pairs.map((item) => Prisma.sql`(${item.sku}, ${createDate(item.dateStr)})`)
  const result = await prisma.$queryRaw<Array<{
    sku: string
    date: Date
    grossOrders: number | bigint | null
    returnQty: number | bigint | null
    netOrders: number | bigint | null
    canceledQty: number | bigint | null
    refundAmount: number | string | null
  }>>(Prisma.sql`
    WITH "affected"("sellerSku", "paidDate") AS (
      VALUES ${Prisma.join(rows)}
    )
    SELECT
      poi."sellerSku" AS "sku",
      poi."paidDate" AS "date",
      SUM(poi."quantity") AS "grossOrders",
      SUM(poi."returnQty") AS "returnQty",
      SUM(poi."netQty") AS "netOrders",
      SUM(poi."canceledQty") AS "canceledQty",
      SUM(poi."refundAmount") AS "refundAmount"
    FROM "ProductOrderItem" AS poi
    INNER JOIN "affected" AS a
      ON a."sellerSku" = poi."sellerSku"
     AND a."paidDate" = poi."paidDate"
    WHERE poi."productMatched" = true
    GROUP BY poi."sellerSku", poi."paidDate"
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
        refundAmount: Number(item.refundAmount || 0),
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

    const user = session.user as any
    const userRole = user?.role as string | undefined
    if (!userRole || (userRole !== 'admin' && userRole !== 'operator' && userRole !== 'optimizer')) {
      return NextResponse.json(
        {
          error: '无权限导入订单数据',
          detail: '当前账号没有导入订单表权限',
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
    const normalizedFileName = sourceFileName.toLowerCase()
    const bytes = await file.arrayBuffer()
    const fileSize = bytes.byteLength

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
      if (normalizedFileName.endsWith('.csv')) {
        const text = new TextDecoder('utf-8').decode(bytes)
        rows = parseCsvText(text)
      } else {
        const workbook = XLSX.read(bytes, { type: 'array' })
        const targetSheetName = workbook.SheetNames.includes('OrderSKUList')
          ? 'OrderSKUList'
          : workbook.SheetNames[0]

        if (!targetSheetName) {
          return NextResponse.json(
            {
              error: '订单文件没有可读取的工作表',
              stage,
            },
            { status: 400 },
          )
        }

        rows = getNormalizedRowsFromSheet(workbook.Sheets[targetSheetName])
      }
    } catch (parseError) {
      console.error('解析订单文件失败:', parseError)
      return NextResponse.json(
        {
          error: '导入订单表失败',
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

    const failures: OrderFailure[] = []
    const skippedRows: OrderFailure[] = []
    const parsedRows: ParsedOrderItem[] = []

    rows.forEach(({ rowNumber, record }) => {
      try {
        const orderId = normalizeCell(record['Order ID'])
        const skuId = normalizeCell(record['SKU ID']) || null
        const sellerSku = normalizeCell(record['Seller SKU'])
        const rawPaidTime = normalizeCell(record['Paid Time'])
        const quantity = Math.max(0, Math.round(parseNumber(record['Quantity'])))
        const returnQty = Math.max(0, Math.round(parseNumber(record['Sku Quantity of return'])))
        const orderStatus = normalizeCell(record['Order Status'])
        const cancelationReturnType = normalizeCell(record['Cancelation/Return Type'])
        const refundAmount = parseNumber(record['Order Refund Amount'])

        if (!sellerSku) {
          skippedRows.push({
            row: rowNumber,
            sku: '',
            paidTime: rawPaidTime,
            quantity,
            returnQty,
            reason: 'Seller SKU 为空，已跳过',
          })
          return
        }

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
            reason: 'Paid Time 为空',
          })
          return
        }

        const parsedDate = parseDateValue(record['Paid Time'])
        if (!parsedDate) {
          failures.push({
            row: rowNumber,
            sku: sellerSku,
            paidTime: rawPaidTime,
            quantity,
            returnQty,
            reason: 'Paid Time 无法解析',
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
        const canceledQty = canceled ? quantity : 0
        const netQty = canceled ? 0 : Math.max(quantity - returnQty, 0)

        parsedRows.push({
          row: rowNumber,
          dedupeKey,
          orderId,
          skuId,
          sellerSku,
          paidDate: parsedDate.paidDate,
          paidDateStr: parsedDate.dateStr,
          paidTime: parsedDate.paidTime,
          rawPaidTime,
          quantity,
          returnQty,
          netQty,
          canceledQty,
          refundAmount,
          orderStatus,
          cancelationReturnType,
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

    const latestItemsByDedupeKey = new Map<string, ParsedOrderItem>()
    let duplicateInFileCount = 0

    parsedRows.forEach((item) => {
      if (latestItemsByDedupeKey.has(item.dedupeKey)) {
        duplicateInFileCount += 1
      }
      latestItemsByDedupeKey.set(item.dedupeKey, item)
    })

    const dedupedItems = Array.from(latestItemsByDedupeKey.values())
    const uniqueSkus = Array.from(new Set(dedupedItems.map((item) => item.sellerSku)))
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
          totalRefundAmount: 0,
        },
        { status: 400 },
      )
    }

    if (isTimedOut()) {
      return createTimeoutResponse('parse-file', dedupeKeyCount, 0)
    }

    stage = 'aggregate'
    const fileSummary = buildSummary(dedupedItems)

    if (dryRun) {
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
        matchedSkuCount: 0,
        missingSkuCount: 0,
        missingSkuRows: 0,
        skippedCount: skippedRows.length,
        missingSkus: [],
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
        totalRefundAmount: fileSummary.totalRefundAmount,
      })
    }

    if (isTimedOut()) {
      return createTimeoutResponse('aggregate', dedupeKeyCount, 0)
    }

    stage = 'match-products'
    const products = await prisma.product.findMany({
      where: {
        sku: {
          in: uniqueSkus,
        },
      },
      select: {
        sku: true,
        name: true,
      },
    })

    const productSkuSet = new Set(
      products.map((product) => product.sku).filter((sku): sku is string => Boolean(sku)),
    )
    const productNameMap = new Map(
      products
        .filter((product): product is { sku: string; name: string } => Boolean(product.sku))
        .map((product) => [product.sku, product.name]),
    )
    const missingSkus = uniqueSkus.filter((sku) => !productSkuSet.has(sku))
    const missingSkuRows = dedupedItems.filter((item) => !productSkuSet.has(item.sellerSku)).length

    if (checkOnly) {
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
        matchedSkuCount: uniqueSkus.length - missingSkus.length,
        missingSkuCount: missingSkus.length,
        missingSkuRows,
        skippedCount: skippedRows.length,
        missingSkus,
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
        totalRefundAmount: fileSummary.totalRefundAmount,
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
      const key = `${item.sellerSku}__${dateStr}`
      affectedPairMap.set(key, {
        sku: item.sellerSku,
        dateStr,
      })
    })

    const orderItemWrites: ProductOrderItemWriteRow[] = dedupedItems.map((item) => {
      const pairKey = `${item.sellerSku}__${item.paidDateStr}`
      affectedPairMap.set(pairKey, {
        sku: item.sellerSku,
        dateStr: item.paidDateStr,
      })

      return {
        dedupeKey: item.dedupeKey,
        orderId: item.orderId,
        skuId: item.skuId,
        sellerSku: item.sellerSku,
        paidDate: item.paidDate,
        paidTime: item.paidTime,
        quantity: item.quantity,
        returnQty: item.returnQty,
        netQty: item.netQty,
        canceledQty: item.canceledQty,
        refundAmount: item.refundAmount,
        orderStatus: item.orderStatus || null,
        cancelationReturnType: item.cancelationReturnType || null,
        productMatched: productSkuSet.has(item.sellerSku),
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
    const aggregatedItems = await loadAggregatedMatchedOrderItems(affectedPairs, productNameMap)
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

      await deletePerformanceDailyPairs(staleBatches[batchIndex])
    }

    const writeSummary = buildSummary(
      aggregatedItems.map((item) => ({
        sellerSku: item.sku,
        paidDateStr: item.dateStr,
        quantity: item.grossOrders,
        returnQty: item.returnQty,
        netQty: item.netOrders,
        canceledQty: item.canceledQty,
        refundAmount: item.refundAmount,
      })),
    )

    stage = 'done'
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
      matchedSkuCount: uniqueSkus.length - missingSkus.length,
      missingSkuCount: missingSkus.length,
      missingSkuRows,
      skippedCount: skippedRows.length,
      missingSkus,
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
      totalRefundAmount: writeSummary.totalRefundAmount,
      staleRecordCount: stalePairs.length,
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
