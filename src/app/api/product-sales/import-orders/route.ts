import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
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
  | 'write-performance'
  | 'done'

type OrderFailure = {
  row: number
  sku: string
  paidTime: string
  quantity: number
  returnQty: number
  reason: string
}

type ParsedOrderRow = {
  row: number
  sku: string
  productName: string
  quantity: number
  returnQty: number
  paidTime: string
  dateStr: string
  isCanceled: boolean
  refundAmount: number
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

const WRITE_BATCH_SIZE = 5
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

function parseDateString(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  if (typeof value === 'number') {
    const code = XLSX.SSF?.parse_date_code ? XLSX.SSF.parse_date_code(value) : null
    if (code) {
      const month = String(code.m).padStart(2, '0')
      const day = String(code.d).padStart(2, '0')
      return `${code.y}-${month}-${day}`
    }
  }

  const text = normalizeCell(value)
  if (!text) return null

  const normalizedText = text.replace(/\t/g, '').trim()
  if (!normalizedText) return null

  const slashMatched = normalizedText.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (slashMatched) {
    const [, month, day, year] = slashMatched
    return `${year}-${month}-${day}`
  }

  const dashMatched = normalizedText.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (dashMatched) {
    const [, year, month, day] = dashMatched
    return `${year}-${month}-${day}`
  }

  const parsed = new Date(normalizedText)
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear()
    const month = String(parsed.getMonth() + 1).padStart(2, '0')
    const day = String(parsed.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return null
}

function createDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map((part) => Number(part))
  return new Date(year, month - 1, day)
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

function createTimeoutResponse(
  stage: Stage,
  processedCount: number,
  remainingCount: number,
) {
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

function buildSummary(aggregatedItems: AggregatedOrderStat[]) {
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

  aggregatedItems.forEach((item) => {
    const byDate = summaryByDateMap.get(item.dateStr) || {
      date: item.dateStr,
      grossOrders: 0,
      returnQty: 0,
      netOrders: 0,
      canceledQty: 0,
      refundAmount: 0,
    }
    byDate.grossOrders += item.grossOrders
    byDate.returnQty += item.returnQty
    byDate.netOrders += item.netOrders
    byDate.canceledQty += item.canceledQty
    byDate.refundAmount += item.refundAmount
    summaryByDateMap.set(item.dateStr, byDate)

    const bySku = summaryBySkuMap.get(item.sku) || {
      sku: item.sku,
      grossOrders: 0,
      returnQty: 0,
      netOrders: 0,
      canceledQty: 0,
      refundAmount: 0,
    }
    bySku.grossOrders += item.grossOrders
    bySku.returnQty += item.returnQty
    bySku.netOrders += item.netOrders
    bySku.canceledQty += item.canceledQty
    bySku.refundAmount += item.refundAmount
    summaryBySkuMap.set(item.sku, bySku)
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

    const bytes = await file.arrayBuffer()
    const fileName = String(file.name || '').toLowerCase()
    const fileSize = bytes.byteLength

    console.log('[import-orders] start', {
      fileName,
      fileSize,
      dryRun,
      checkOnly,
    })

    if (isTimedOut()) {
      return createTimeoutResponse(stage, 0, 0)
    }

    stage = 'parse-file'
    let rows: Array<{ rowNumber: number; record: Record<string, unknown> }> = []

    try {
      if (fileName.endsWith('.csv')) {
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

    console.log('[import-orders] parsed rows', {
      rowCount: rows.length,
    })

    if (isTimedOut()) {
      return createTimeoutResponse(stage, rows.length, 0)
    }

    const failures: OrderFailure[] = []
    const parsedRows: ParsedOrderRow[] = []

    rows.forEach(({ rowNumber, record }) => {
      try {
        const sku = normalizeCell(record['Seller SKU'])
        const paidTime = normalizeCell(record['Paid Time'])
        const quantity = Math.max(0, Math.round(parseNumber(record['Quantity'])))
        const returnQty = Math.max(0, Math.round(parseNumber(record['Sku Quantity of return'])))
        const dateStr = parseDateString(record['Paid Time'])

        if (!sku) {
          failures.push({
            row: rowNumber,
            sku: '',
            paidTime,
            quantity,
            returnQty,
            reason: 'Seller SKU 为空',
          })
          return
        }

        if (!paidTime) {
          failures.push({
            row: rowNumber,
            sku,
            paidTime: '',
            quantity,
            returnQty,
            reason: 'Paid Time 为空',
          })
          return
        }

        if (!dateStr) {
          failures.push({
            row: rowNumber,
            sku,
            paidTime,
            quantity,
            returnQty,
            reason: 'Paid Time 无法解析',
          })
          return
        }

        parsedRows.push({
          row: rowNumber,
          sku,
          productName: normalizeCell(record['Product Name']),
          quantity,
          returnQty,
          paidTime,
          dateStr,
          isCanceled: isCanceledOrder(
            normalizeCell(record['Order Status']),
            normalizeCell(record['Cancelation/Return Type']),
          ),
          refundAmount: parseNumber(record['Order Refund Amount']),
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
    const uniqueSkus = Array.from(new Set(parsedRows.map((item) => item.sku).filter(Boolean)))

    console.log('[import-orders] parsed valid rows', {
      parsedRowCount: parsedRows.length,
      uniqueSkuCount: uniqueSkus.length,
      parseFailureCount: failures.length,
    })

    if (!parsedRows.length) {
      return NextResponse.json({
        success: false,
        stage: 'parse-file',
        fileName,
        fileSize,
        parsedRows: totalOrderRows,
        validRows: 0,
        failedRows: failures.slice(0, 20),
        uniqueSkuCount: 0,
        aggregatedRecordCount: 0,
        summaryByDate: [],
        summaryBySku: [],
        totalGrossOrders: 0,
        totalReturnQty: 0,
        totalNetOrders: 0,
        totalCanceledQty: 0,
        totalRefundAmount: 0,
      }, { status: 400 })
    }

    if (isTimedOut()) {
      return createTimeoutResponse('parse-file', parsedRows.length, 0)
    }

    stage = 'aggregate'
    const aggregated = new Map<string, AggregatedOrderStat>()

    for (const item of parsedRows) {
      const key = `${item.sku}__${item.dateStr}`
      const current = aggregated.get(key) || {
        sku: item.sku,
        dateStr: item.dateStr,
        productName: item.productName || null,
        grossOrders: 0,
        returnQty: 0,
        netOrders: 0,
        canceledQty: 0,
        refundAmount: 0,
      }

      const safeReturnQty = Math.max(0, item.returnQty)
      const canceledQty = item.isCanceled ? item.quantity : 0
      const netOrders = item.isCanceled ? 0 : Math.max(item.quantity - safeReturnQty, 0)

      current.grossOrders += item.quantity
      current.returnQty += safeReturnQty
      current.netOrders += netOrders
      current.canceledQty += canceledQty
      current.refundAmount += item.refundAmount

      if (!current.productName && item.productName) {
        current.productName = item.productName
      }

      aggregated.set(key, current)
    }

    const aggregatedItems = Array.from(aggregated.values())
    const aggregatedSummary = buildSummary(aggregatedItems)

    console.log('[import-orders] aggregated records', {
      aggregatedCount: aggregatedItems.length,
    })

    if (dryRun) {
      return NextResponse.json({
        success: true,
        stage,
        fileName,
        fileSize,
        parsedRows: totalOrderRows,
        validRows: parsedRows.length,
        totalOrderRows,
        successCount: 0,
        failedCount: failures.length,
        failedRows: failures.slice(0, 20),
        uniqueSkuCount: uniqueSkus.length,
        aggregatedRecordCount: aggregatedItems.length,
        summaryByDate: aggregatedSummary.summaryByDate,
        summaryBySku: aggregatedSummary.summaryBySku.slice(0, 50),
        totalGrossOrders: aggregatedSummary.totalGrossOrders,
        totalReturnQty: aggregatedSummary.totalReturnQty,
        totalNetOrders: aggregatedSummary.totalNetOrders,
        totalCanceledQty: aggregatedSummary.totalCanceledQty,
        totalRefundAmount: aggregatedSummary.totalRefundAmount,
      })
    }

    if (isTimedOut()) {
      return createTimeoutResponse('aggregate', aggregatedItems.length, 0)
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
      },
    })

    const productSkuSet = new Set(
      products.map((product) => product.sku).filter((sku): sku is string => Boolean(sku)),
    )
    const missingSkus: string[] = []
    const matchedAggregatedItems: AggregatedOrderStat[] = []

    for (const item of aggregatedItems) {
      if (!productSkuSet.has(item.sku)) {
        if (!missingSkus.includes(item.sku)) {
          missingSkus.push(item.sku)
        }
        failures.push({
          row: 0,
          sku: item.sku,
          paidTime: item.dateStr,
          quantity: item.grossOrders,
          returnQty: item.returnQty,
          reason: '未找到匹配的 Product.sku',
        })
        continue
      }

      matchedAggregatedItems.push(item)
    }

    console.log('[import-orders] matched product sku', {
      matchedSkuCount: productSkuSet.size,
      missingSkuCount: missingSkus.length,
      matchedAggregatedCount: matchedAggregatedItems.length,
    })

    if (checkOnly) {
      return NextResponse.json({
        success: true,
        stage,
        fileName,
        fileSize,
        totalOrderRows,
        parsedRows: totalOrderRows,
        validRows: parsedRows.length,
        successCount: 0,
        failedCount: failures.length,
        uniqueSkuCount: uniqueSkus.length,
        matchedSkuCount: uniqueSkus.length - missingSkus.length,
        missingSkuCount: missingSkus.length,
        missingSkus: missingSkus.slice(0, 100),
        aggregatedRecordCount: aggregatedItems.length,
        failedRows: failures.slice(0, 20),
      })
    }

    if (isTimedOut()) {
      return createTimeoutResponse('match-products', matchedAggregatedItems.length, 0)
    }

    stage = 'write-performance'
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

    let successCount = 0
    const writeErrors: Array<{ sku: string; dateStr: string; reason: string }> = []
    const batches = chunkArray(matchedAggregatedItems, WRITE_BATCH_SIZE)

    console.log('[import-orders] write start', {
      batchSize: WRITE_BATCH_SIZE,
      batchCount: batches.length,
      writeRecordCount: matchedAggregatedItems.length,
    })

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex]

      if (isTimedOut()) {
        const processedCount = batchIndex * WRITE_BATCH_SIZE
        const remainingCount = matchedAggregatedItems.length - processedCount
        return createTimeoutResponse(stage, processedCount, remainingCount)
      }

      const results = await Promise.allSettled(
        batch.map(async (item) => {
          await prisma.performanceDaily.upsert({
            where: {
              date_sku: {
                sku: item.sku,
                date: createDate(item.dateStr),
              },
            },
            create: {
              sku: item.sku,
              date: createDate(item.dateStr),
              productName: item.productName,
              orders: item.netOrders,
              grossOrders: item.grossOrders,
              returnQty: item.returnQty,
              netOrders: item.netOrders,
              canceledQty: item.canceledQty,
              refundAmount: item.refundAmount,
            },
            update: {
              productName: item.productName ?? undefined,
              orders: item.netOrders,
              grossOrders: item.grossOrders,
              returnQty: item.returnQty,
              netOrders: item.netOrders,
              canceledQty: item.canceledQty,
              refundAmount: item.refundAmount,
            },
          })

          return item
        }),
      )

      results.forEach((result, index) => {
        const item = batch[index]

        if (result.status === 'fulfilled') {
          const byDate = summaryByDateMap.get(item.dateStr) || {
            date: item.dateStr,
            grossOrders: 0,
            returnQty: 0,
            netOrders: 0,
            canceledQty: 0,
            refundAmount: 0,
          }
          byDate.grossOrders += item.grossOrders
          byDate.returnQty += item.returnQty
          byDate.netOrders += item.netOrders
          byDate.canceledQty += item.canceledQty
          byDate.refundAmount += item.refundAmount
          summaryByDateMap.set(item.dateStr, byDate)

          const bySku = summaryBySkuMap.get(item.sku) || {
            sku: item.sku,
            grossOrders: 0,
            returnQty: 0,
            netOrders: 0,
            canceledQty: 0,
            refundAmount: 0,
          }
          bySku.grossOrders += item.grossOrders
          bySku.returnQty += item.returnQty
          bySku.netOrders += item.netOrders
          bySku.canceledQty += item.canceledQty
          bySku.refundAmount += item.refundAmount
          summaryBySkuMap.set(item.sku, bySku)

          successCount += 1
          return
        }

        const reason = String((result.reason as Error)?.message || result.reason)
        console.error('导入订单汇总失败:', {
          sku: item.sku,
          dateStr: item.dateStr,
          error: reason,
        })
        writeErrors.push({
          sku: item.sku,
          dateStr: item.dateStr,
          reason,
        })
        failures.push({
          row: 0,
          sku: item.sku,
          paidTime: item.dateStr,
          quantity: item.grossOrders,
          returnQty: item.returnQty,
          reason: `${item.dateStr} 写入 PerformanceDaily 失败：${reason}`,
        })
      })
    }

    console.log('[import-orders] write end', {
      successCount,
      writeErrorCount: writeErrors.length,
      totalFailureCount: failures.length,
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

    if (successCount === 0 && matchedAggregatedItems.length > 0 && writeErrors.length > 0) {
      return NextResponse.json(
        {
          error: '导入订单表失败',
          detail: writeErrors[0].reason,
          stage,
        },
        { status: 500 },
      )
    }

    stage = 'done'
    return NextResponse.json({
      success: true,
      stage,
      fileName,
      fileSize,
      totalOrderRows,
      parsedRows: totalOrderRows,
      validRows: parsedRows.length,
      uniqueSkuCount: uniqueSkus.length,
      matchedSkuCount: uniqueSkus.length - missingSkus.length,
      missingSkuCount: missingSkus.length,
      missingSkus: missingSkus.slice(0, 100),
      aggregatedRecordCount: aggregatedItems.length,
      successCount,
      failedCount: failures.length,
      failedRows: failures,
      summaryByDate,
      summaryBySku,
      totalGrossOrders,
      totalReturnQty,
      totalNetOrders,
      totalCanceledQty,
      totalRefundAmount,
      writeErrors,
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
