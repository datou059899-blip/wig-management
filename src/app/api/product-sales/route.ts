import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type RangeKey = 'today' | '7' | '30' | 'custom'

type BaselineRow = {
  sku: string
  quantity: number
  baselineDate: Date
}

function startOfDay(date: Date) {
  const normalized = new Date(date)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value.trim() : String(value).trim()
}

function normalizeSkuForCompare(value: string) {
  return normalizeCell(value).replace(/\s+/g, '').toUpperCase()
}

function extractAliasSkusFromText(value: string | null | undefined) {
  const aliases = new Set<string>()
  const text = normalizeCell(value)
  if (!text) return []

  const pattern = /[（(]\s*([^()（）]+?)\s*[)）]/g
  let match = pattern.exec(text)
  while (match) {
    const alias = normalizeCell(match[1])
    if (alias) {
      aliases.add(alias)
    }
    match = pattern.exec(text)
  }

  return Array.from(aliases)
}

function resolveEffectiveStock(snapshot: {
  totalQty: number | null
  availableQty: number | null
  lockedQty: number | null
} | null | undefined, fallbackStock: number) {
  if (snapshot && snapshot.totalQty !== null && snapshot.totalQty !== undefined && snapshot.totalQty > 0) {
    return snapshot.totalQty
  }

  if (snapshot) {
    const availableAndLockedTotal = (snapshot.availableQty ?? 0) + (snapshot.lockedQty ?? 0)
    if (availableAndLockedTotal > 0) {
      return availableAndLockedTotal
    }
  }

  return fallbackStock
}

function parseDateInput(value: string) {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return null

  const [, yearText, monthText, dayText] = matched
  const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText), 0, 0, 0, 0)
  return Number.isNaN(date.getTime()) ? null : date
}

function resolveRange(searchParams: URLSearchParams) {
  const requestedRange = String(searchParams.get('range') || '7').trim()
  const today = startOfDay(new Date())
  const tomorrow = addDays(today, 1)

  if (requestedRange === 'today') {
    return {
      range: 'today' as RangeKey,
      startDate: today,
      endDate: today,
      endExclusive: tomorrow,
      startDateText: formatDateKey(today),
      endDateText: formatDateKey(today),
    }
  }

  if (requestedRange === '30') {
    const startDate = addDays(today, -29)
    return {
      range: '30' as RangeKey,
      startDate,
      endDate: today,
      endExclusive: tomorrow,
      startDateText: formatDateKey(startDate),
      endDateText: formatDateKey(today),
    }
  }

  if (requestedRange === 'custom') {
    const startDateText = String(searchParams.get('startDate') || '').trim()
    const endDateText = String(searchParams.get('endDate') || '').trim()
    const startDate = parseDateInput(startDateText)
    const endDate = parseDateInput(endDateText)

    if (!startDate || !endDate) {
      throw new Error('自定义时间范围缺少有效的开始日期或结束日期')
    }
    if (startDate.getTime() > endDate.getTime()) {
      throw new Error('开始日期不能大于结束日期')
    }

    return {
      range: 'custom' as RangeKey,
      startDate,
      endDate,
      endExclusive: addDays(endDate, 1),
      startDateText,
      endDateText,
    }
  }

  const startDate = addDays(today, -6)
  return {
    range: '7' as RangeKey,
    startDate,
    endDate: today,
    endExclusive: tomorrow,
    startDateText: formatDateKey(startDate),
    endDateText: formatDateKey(today),
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const selectedRange = resolveRange(searchParams)
    const today = startOfDay(new Date())
    const tomorrow = addDays(today, 1)
    const yesterday = addDays(today, -1)
    const sevenDaysAgo = addDays(today, -6)
    const thirtyDaysAgo = addDays(today, -29)
    const queryStartDate = selectedRange.startDate < thirtyDaysAgo ? selectedRange.startDate : thirtyDaysAgo
    const queryEndExclusive = selectedRange.endExclusive > tomorrow
      ? selectedRange.endExclusive
      : tomorrow

    const [products, aliases] = await Promise.all([
      prisma.product.findMany({
        where: { isActive: true },
        select: {
          id: true,
          sku: true,
          name: true,
          color: true,
          length: true,
          stock: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.productSkuAlias.findMany({
        where: {
          product: {
            isActive: true,
          },
        },
        select: {
          aliasSku: true,
          productId: true,
        },
      }),
    ])

    const relatedSkuSetByProductId = new Map<string, Set<string>>()
    const ensureRelatedSkuSet = (productId: string) => {
      if (!relatedSkuSetByProductId.has(productId)) {
        relatedSkuSetByProductId.set(productId, new Set<string>())
      }
      return relatedSkuSetByProductId.get(productId)!
    }
    const registerRelatedSku = (productId: string, sku: string | null | undefined) => {
      const value = normalizeCell(sku)
      if (!value) return
      ensureRelatedSkuSet(productId).add(value)
    }

    products.forEach((product) => {
      registerRelatedSku(product.id, product.sku)
      extractAliasSkusFromText(product.sku).forEach((aliasSku) => registerRelatedSku(product.id, aliasSku))
      extractAliasSkusFromText(product.name).forEach((aliasSku) => registerRelatedSku(product.id, aliasSku))
    })
    aliases.forEach((alias) => {
      registerRelatedSku(alias.productId, alias.aliasSku)
    })

    const relatedSkuToProductIdExact = new Map<string, string>()
    const relatedSkuToProductIdNormalized = new Map<string, string>()
    relatedSkuSetByProductId.forEach((skuSet, productId) => {
      skuSet.forEach((sku) => {
        relatedSkuToProductIdExact.set(sku, productId)
        const normalized = normalizeSkuForCompare(sku)
        if (normalized) {
          relatedSkuToProductIdNormalized.set(normalized, productId)
        }
      })
    })

    const productSkus = products
      .map((product) => normalizeCell(product.sku))
      .filter(Boolean)
    const latestSnapshots = productSkus.length
      ? await prisma.productInventorySnapshot.findMany({
          where: {
            sku: {
              in: productSkus,
            },
          },
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
      : []

    const latestSnapshotBySku = new Map<string, {
      totalQty: number | null
      availableQty: number | null
      lockedQty: number | null
    }>()
    latestSnapshots.forEach((snapshot) => {
      if (!latestSnapshotBySku.has(snapshot.sku)) {
        latestSnapshotBySku.set(snapshot.sku, {
          totalQty: snapshot.totalQty,
          availableQty: snapshot.availableQty,
          lockedQty: snapshot.lockedQty,
        })
      }
    })

    const baselineSkuList = Array.from(new Set(
      Array.from(relatedSkuSetByProductId.values()).flatMap((skuSet) => Array.from(skuSet.values())),
    ))
    const baselines = baselineSkuList.length
      ? await prisma.productStockBaseline.findMany({
          where: {
            sku: {
              in: baselineSkuList,
            },
            baselineDate: {
              lt: tomorrow,
            },
          },
          orderBy: [
            { sku: 'asc' },
            { baselineDate: 'asc' },
          ],
        })
      : []

    const exactBaselineMap = new Map<string, BaselineRow[]>()
    const normalizedBaselineMap = new Map<string, BaselineRow[]>()
    const registerBaseline = (sku: string, row: BaselineRow) => {
      const exactBucket = exactBaselineMap.get(sku) || []
      exactBucket.push(row)
      exactBaselineMap.set(sku, exactBucket)

      const normalizedSku = normalizeSkuForCompare(sku)
      if (!normalizedSku) return
      const normalizedBucket = normalizedBaselineMap.get(normalizedSku) || []
      normalizedBucket.push(row)
      normalizedBaselineMap.set(normalizedSku, normalizedBucket)
    }

    baselines.forEach((baseline) => {
      registerBaseline(baseline.sku, {
        sku: baseline.sku,
        quantity: baseline.quantity,
        baselineDate: startOfDay(new Date(baseline.baselineDate)),
      })
    })

    const inventoryConsumptionStartDate = baselines.reduce((earliest, baseline) => {
      const baselineDate = startOfDay(new Date(baseline.baselineDate))
      return baselineDate.getTime() < earliest.getTime() ? baselineDate : earliest
    }, today)

    const salesPerformanceData = await prisma.performanceDaily.findMany({
      where: {
        date: {
          gte: queryStartDate,
          lt: queryEndExclusive,
        },
      },
      select: {
        sku: true,
        orders: true,
        date: true,
      },
    })

    const inventoryPerformanceData = await prisma.performanceDaily.findMany({
      where: {
        date: {
          gte: inventoryConsumptionStartDate,
          lt: tomorrow,
        },
      },
      select: {
        sku: true,
        stockConsumedQty: true,
        date: true,
      },
    })

    const salesBySku: Record<string, {
      today: number
      yesterday: number
      week: number
      month: number
      selectedRange: number
    }> = {}

    products.forEach((product) => {
      if (product.sku) {
        salesBySku[product.sku] = { today: 0, yesterday: 0, week: 0, month: 0, selectedRange: 0 }
      }
    })

    const consumedRowsByProductId = new Map<string, Array<{ date: Date; qty: number }>>()

    salesPerformanceData.forEach((perf) => {
      if (!perf.sku) return

      if (!salesBySku[perf.sku]) {
        salesBySku[perf.sku] = { today: 0, yesterday: 0, week: 0, month: 0, selectedRange: 0 }
      }

      const perfDate = startOfDay(new Date(perf.date))
      if (perfDate.getTime() === today.getTime()) {
        salesBySku[perf.sku].today += perf.orders
      }
      if (perfDate.getTime() === yesterday.getTime()) {
        salesBySku[perf.sku].yesterday += perf.orders
      }
      if (perfDate >= sevenDaysAgo && perfDate <= today) {
        salesBySku[perf.sku].week += perf.orders
      }
      if (perfDate >= thirtyDaysAgo && perfDate <= today) {
        salesBySku[perf.sku].month += perf.orders
      }
      if (perfDate >= selectedRange.startDate && perfDate < selectedRange.endExclusive) {
        salesBySku[perf.sku].selectedRange += perf.orders
      }

    })

    inventoryPerformanceData.forEach((perf) => {
      if (!perf.sku) return

      const perfDate = startOfDay(new Date(perf.date))
      const productId = relatedSkuToProductIdExact.get(perf.sku)
        || relatedSkuToProductIdNormalized.get(normalizeSkuForCompare(perf.sku))
      if (!productId) return

      const bucket = consumedRowsByProductId.get(productId) || []
      bucket.push({
        date: perfDate,
        qty: perf.stockConsumedQty || 0,
      })
      consumedRowsByProductId.set(productId, bucket)
    })

    const tableData = products.map((product) => {
      const sales = salesBySku[product.sku || ''] || {
        today: 0,
        yesterday: 0,
        week: 0,
        month: 0,
        selectedRange: 0,
      }
      const currentStock = resolveEffectiveStock(
        product.sku ? latestSnapshotBySku.get(product.sku) : null,
        product.stock || 0,
      )

      const baselineCandidates = Array.from(new Map(
        Array.from(relatedSkuSetByProductId.get(product.id) || []).flatMap((sku) => {
          const normalizedSku = normalizeSkuForCompare(sku)
          const rows = [
            ...(exactBaselineMap.get(sku) || []),
            ...(normalizedSku ? (normalizedBaselineMap.get(normalizedSku) || []) : []),
          ]
          return rows.map((row) => [`${row.sku}:${row.baselineDate.getTime()}`, row] as const)
        }),
      ).values()).sort((a, b) => a.baselineDate.getTime() - b.baselineDate.getTime())

      const activeBaseline = baselineCandidates.length
        ? baselineCandidates[baselineCandidates.length - 1]
        : null

      const estimatedStock = activeBaseline
        ? Math.max(
            activeBaseline.quantity - (consumedRowsByProductId.get(product.id) || []).reduce((sum, row) => (
              row.date >= activeBaseline.baselineDate && row.date < tomorrow ? sum + row.qty : sum
            ), 0),
            0,
          )
        : currentStock

      let stockStatus = '正常'
      if (currentStock === 0) {
        stockStatus = '断货'
      } else if (currentStock <= 10) {
        stockStatus = '低库存'
      }

      return {
        id: product.id,
        sku: product.sku || '-',
        name: product.name,
        color: product.color || '-',
        length: product.length || '-',
        todaySales: sales.today,
        yesterdaySales: sales.yesterday,
        weekSales: sales.week,
        monthSales: sales.month,
        selectedRangeSales: sales.selectedRange,
        stock: currentStock,
        estimatedStock,
        stockStatus,
        updatedAt: product.updatedAt.toISOString(),
      }
    })

    const skuOptionsSet = new Set<string>()
    const skuOptions: Array<{ sku: string }> = []
    const registerSkuOption = (sku: string | null | undefined) => {
      const value = normalizeCell(sku)
      if (!value || skuOptionsSet.has(value)) return
      skuOptionsSet.add(value)
      skuOptions.push({ sku: value })
    }

    products.forEach((product) => {
      registerSkuOption(product.sku)
    })
    aliases.forEach((alias) => {
      registerSkuOption(alias.aliasSku)
    })
    products.forEach((product) => {
      extractAliasSkusFromText(product.sku).forEach((aliasSku) => registerSkuOption(aliasSku))
      extractAliasSkusFromText(product.name).forEach((aliasSku) => registerSkuOption(aliasSku))
    })

    const totalTodaySales = Object.values(salesBySku).reduce((sum, item) => sum + item.today, 0)
    const totalYesterdaySales = Object.values(salesBySku).reduce((sum, item) => sum + item.yesterday, 0)
    const totalWeekSales = Object.values(salesBySku).reduce((sum, item) => sum + item.week, 0)
    const totalMonthSales = Object.values(salesBySku).reduce((sum, item) => sum + item.month, 0)
    const effectiveStocks = products.map((product) => resolveEffectiveStock(
      product.sku ? latestSnapshotBySku.get(product.sku) : null,
      product.stock || 0,
    ))
    const totalStock = effectiveStocks.reduce((sum, stock) => sum + stock, 0)
    const lowStockCount = effectiveStocks.filter((stock) => stock > 0 && stock <= 10).length
    const outOfStockCount = effectiveStocks.filter((stock) => stock === 0).length

    return NextResponse.json({
      summary: {
        todaySales: totalTodaySales,
        yesterdaySales: totalYesterdaySales,
        weekSales: totalWeekSales,
        monthSales: totalMonthSales,
        totalStock,
        lowStockCount,
        outOfStockCount,
      },
      selectedRange: {
        range: selectedRange.range,
        startDate: selectedRange.startDateText,
        endDate: selectedRange.endDateText,
      },
      skuOptions,
      products: tableData,
    })
  } catch (error) {
    console.error('获取产品销售库存失败:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取数据失败' },
      { status: 500 },
    )
  }
}
