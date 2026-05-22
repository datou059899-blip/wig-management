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

type AdjustmentRow = {
  sku: string
  quantity: number
  adjustmentDate: Date
  type: string
}

type RankSettings = {
  aDailySalesThreshold: number
  bDailySalesThreshold: number
  cStockRatioThreshold: number
  cOrderRatioThreshold: number
  dActiveDaysThreshold: number
  windowDays: number
}

const DEFAULT_RANK_SETTINGS: RankSettings = {
  aDailySalesThreshold: 20,
  bDailySalesThreshold: 10,
  cStockRatioThreshold: 0.1,
  cOrderRatioThreshold: 0.2,
  dActiveDaysThreshold: 3,
  windowDays: 7,
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

function resolveSalesMetric(item: { netOrders?: number | null; orders?: number | null }) {
  if (item.netOrders !== null && item.netOrders !== undefined) {
    return item.netOrders
  }
  return item.orders || 0
}

function formatNumber(value: number, digits = 2) {
  if (Number.isInteger(value)) {
    return String(value)
  }
  return value.toFixed(digits).replace(/\.?0+$/, '')
}

function formatPercent(value: number) {
  return `${formatNumber(value * 100, 1)}%`
}

function getSalesRankPriority(rank: string) {
  switch (rank) {
    case 'A':
      return 1
    case 'B':
      return 2
    case 'C':
      return 3
    case 'D':
      return 4
    case 'E':
      return 5
    default:
      return 6
  }
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

    const [products, aliases, rankSettingRecord] = await Promise.all([
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
      prisma.productSalesRankSetting.findFirst({
        orderBy: { updatedAt: 'desc' },
      }),
    ])

    const rankSettings: RankSettings = rankSettingRecord
      ? {
          aDailySalesThreshold: rankSettingRecord.aDailySalesThreshold,
          bDailySalesThreshold: rankSettingRecord.bDailySalesThreshold,
          cStockRatioThreshold: rankSettingRecord.cStockRatioThreshold,
          cOrderRatioThreshold: rankSettingRecord.cOrderRatioThreshold,
          dActiveDaysThreshold: rankSettingRecord.dActiveDaysThreshold,
          windowDays: rankSettingRecord.windowDays,
        }
      : DEFAULT_RANK_SETTINGS
    const rankWindowDays = Math.max(rankSettings.windowDays, 1)
    const rankWindowStart = addDays(today, -(rankWindowDays - 1))
    const recentThreeDayStart = addDays(today, -2)
    const fixedSevenDayStart = addDays(today, -6)
    const performanceWindowStart = rankWindowStart.getTime() < fixedSevenDayStart.getTime()
      ? rankWindowStart
      : fixedSevenDayStart

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

    const adjustments = baselineSkuList.length
      ? await prisma.productStockAdjustment.findMany({
          where: {
            sku: {
              in: baselineSkuList,
            },
            adjustmentDate: {
              lt: tomorrow,
            },
          },
          select: {
            sku: true,
            quantity: true,
            adjustmentDate: true,
            type: true,
          },
          orderBy: [
            { adjustmentDate: 'asc' },
            { createdAt: 'asc' },
          ],
        })
      : []

    const exactBaselineMap = new Map<string, BaselineRow[]>()
    const normalizedBaselineMap = new Map<string, BaselineRow[]>()
    const exactAdjustmentMap = new Map<string, AdjustmentRow[]>()
    const normalizedAdjustmentMap = new Map<string, AdjustmentRow[]>()
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
    const registerAdjustment = (sku: string, row: AdjustmentRow) => {
      const exactBucket = exactAdjustmentMap.get(sku) || []
      exactBucket.push(row)
      exactAdjustmentMap.set(sku, exactBucket)

      const normalizedSku = normalizeSkuForCompare(sku)
      if (!normalizedSku) return
      const normalizedBucket = normalizedAdjustmentMap.get(normalizedSku) || []
      normalizedBucket.push(row)
      normalizedAdjustmentMap.set(normalizedSku, normalizedBucket)
    }

    baselines.forEach((baseline) => {
      registerBaseline(baseline.sku, {
        sku: baseline.sku,
        quantity: baseline.quantity,
        baselineDate: startOfDay(new Date(baseline.baselineDate)),
      })
    })

    adjustments.forEach((adjustment) => {
      registerAdjustment(adjustment.sku, {
        sku: adjustment.sku,
        quantity: adjustment.quantity,
        adjustmentDate: startOfDay(new Date(adjustment.adjustmentDate)),
        type: adjustment.type,
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

    const rankPerformanceData = await prisma.performanceDaily.findMany({
      where: {
        date: {
          gte: performanceWindowStart,
          lt: tomorrow,
        },
      },
      select: {
        sku: true,
        netOrders: true,
        orders: true,
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
    const rankDailySalesByProductId = new Map<string, Map<string, number>>()
    const storeSalesByDate = new Map<string, number>()

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

    rankPerformanceData.forEach((perf) => {
      if (!perf.sku) return

      const productId = relatedSkuToProductIdExact.get(perf.sku)
        || relatedSkuToProductIdNormalized.get(normalizeSkuForCompare(perf.sku))
      if (!productId) return

      const dateKey = formatDateKey(startOfDay(new Date(perf.date)))
      const effectiveSales = Math.max(resolveSalesMetric(perf), 0)

      storeSalesByDate.set(dateKey, (storeSalesByDate.get(dateKey) || 0) + effectiveSales)

      const productDailySales = rankDailySalesByProductId.get(productId) || new Map<string, number>()
      productDailySales.set(dateKey, (productDailySales.get(dateKey) || 0) + effectiveSales)
      rankDailySalesByProductId.set(productId, productDailySales)
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

      const adjustmentCandidates = Array.from(new Map(
        Array.from(relatedSkuSetByProductId.get(product.id) || []).flatMap((sku) => {
          const normalizedSku = normalizeSkuForCompare(sku)
          const rows = [
            ...(exactAdjustmentMap.get(sku) || []),
            ...(normalizedSku ? (normalizedAdjustmentMap.get(normalizedSku) || []) : []),
          ]
          return rows.map((row) => [`${row.sku}:${row.adjustmentDate.getTime()}:${row.quantity}:${row.type}`, row] as const)
        }),
      ).values()).sort((a, b) => a.adjustmentDate.getTime() - b.adjustmentDate.getTime())

      const estimatedStock = activeBaseline
        ? Math.max(
            activeBaseline.quantity
              + adjustmentCandidates.reduce((sum, row) => (
                row.adjustmentDate >= activeBaseline.baselineDate && row.adjustmentDate < tomorrow
                  ? sum + row.quantity
                  : sum
              ), 0)
              - (consumedRowsByProductId.get(product.id) || []).reduce((sum, row) => (
                row.date >= activeBaseline.baselineDate && row.date < tomorrow ? sum + row.qty : sum
              ), 0),
            0,
          )
        : currentStock

      const rankDailySales = rankDailySalesByProductId.get(product.id) || new Map<string, number>()
      const orderedRankDailySales = Array.from(rankDailySales.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      const rankWindowStartKey = formatDateKey(rankWindowStart)
      const fixedSevenDayStartKey = formatDateKey(fixedSevenDayStart)
      const recentThreeDayStartKey = formatDateKey(recentThreeDayStart)
      const rankWindowDailySales = orderedRankDailySales.filter(([dateKey]) => dateKey >= rankWindowStartKey)
      const sevenDayDailySales = orderedRankDailySales.filter(([dateKey]) => dateKey >= fixedSevenDayStartKey)
      const totalRankSales = rankWindowDailySales.reduce((sum, [, dailySales]) => sum + dailySales, 0)
      const rankWindowAvgDailySales = Number((totalRankSales / rankWindowDays).toFixed(2))
      const rankWindowActiveSalesDays = rankWindowDailySales.filter(([, dailySales]) => dailySales > 0).length
      const sevenDaySales = sevenDayDailySales.reduce((sum, [, dailySales]) => sum + dailySales, 0)
      const sevenDayAvgSales = Number((sevenDaySales / 7).toFixed(2))
      const sevenDayActiveSalesDays = sevenDayDailySales.filter(([, dailySales]) => dailySales > 0).length
      const recent3DaySales = sevenDayDailySales.reduce((sum, [dateKey, dailySales]) => (
        dateKey >= recentThreeDayStartKey ? sum + dailySales : sum
      ), 0)
      const sevenDaySalesToStockRatio = estimatedStock > 0 ? sevenDaySales / estimatedStock : 0
      let matchedStockRatio = 0
      let matchedOrderShareRatio = 0
      let maxOrderShareRatio = 0

      let salesRank = 'F'
      let salesRankReason = `F 不出单：近${rankWindowDays}天无销量`

      if (rankWindowAvgDailySales >= rankSettings.aDailySalesThreshold) {
        salesRank = 'A'
        salesRankReason = `A 大爆品：近${rankWindowDays}天日均销量 ${formatNumber(rankWindowAvgDailySales)}，达到 A 标准`
      } else if (rankWindowAvgDailySales >= rankSettings.bDailySalesThreshold) {
        salesRank = 'B'
        salesRankReason = `B 小爆品：近${rankWindowDays}天日均销量 ${formatNumber(rankWindowAvgDailySales)}，达到 B 标准`
      } else {
        const recentOrderedDailySales = [...rankWindowDailySales].sort((a, b) => b[0].localeCompare(a[0]))
        let cReason = ''

        for (const [dateKey, dailySales] of recentOrderedDailySales) {
          if (dailySales <= 0) continue

          if (estimatedStock > 0 && dailySales >= estimatedStock * rankSettings.cStockRatioThreshold) {
            matchedStockRatio = dailySales / estimatedStock
            cReason = `C 潜力品：${dateKey.slice(5)} 单日销量 ${formatNumber(dailySales)}，占当前预计库存 ${formatPercent(dailySales / estimatedStock)}`
            break
          }

          const storeDailySales = storeSalesByDate.get(dateKey) || 0
          if (storeDailySales > 0) {
            maxOrderShareRatio = Math.max(maxOrderShareRatio, dailySales / storeDailySales)
          }
          if (storeDailySales > 0 && dailySales >= storeDailySales * rankSettings.cOrderRatioThreshold) {
            matchedOrderShareRatio = dailySales / storeDailySales
            cReason = `C 潜力品：${dateKey.slice(5)} 单日销量 ${formatNumber(dailySales)}，占当天全店订单 ${formatPercent(dailySales / storeDailySales)}`
            break
          }
        }

        sevenDayDailySales.forEach(([dateKey, dailySales]) => {
          if (dailySales <= 0) return
          const storeDailySales = storeSalesByDate.get(dateKey) || 0
          if (storeDailySales > 0) {
            maxOrderShareRatio = Math.max(maxOrderShareRatio, dailySales / storeDailySales)
          }
        })

        if (cReason) {
          salesRank = 'C'
          salesRankReason = cReason
        } else if (rankWindowActiveSalesDays >= rankSettings.dActiveDaysThreshold) {
          salesRank = 'D'
          salesRankReason = `D 稳定动销：近${rankWindowDays}天有${rankWindowActiveSalesDays}天出单`
        } else if (rankWindowActiveSalesDays > 0) {
          salesRank = 'E'
          salesRankReason = `E 弱动销：近${rankWindowDays}天有销量，但未达到 A/B/C/D`
        }
      }

      const salesToStockRatio = Number((
        matchedStockRatio > 0 ? matchedStockRatio : sevenDaySalesToStockRatio
      ).toFixed(4))
      const orderShareRatio = Number((
        matchedOrderShareRatio > 0 ? matchedOrderShareRatio : maxOrderShareRatio
      ).toFixed(4))
      const velocityScore = Number((
        recent3DaySales * 3
        + sevenDayAvgSales * 5
        + salesToStockRatio * 20
        + orderShareRatio * 20
      ).toFixed(2))

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
        recent3DaySales,
        sevenDaySales,
        sevenDayAvgSales,
        salesToStockRatio,
        orderShareRatio,
        velocityScore,
        avgDailySales: sevenDayAvgSales,
        activeSalesDays: sevenDayActiveSalesDays,
        salesRank,
        salesRankPriority: getSalesRankPriority(salesRank),
        salesRankReason,
        stockStatus,
        updatedAt: product.updatedAt.toISOString(),
      }
    })

    const skuOptionsSet = new Set<string>()
    const skuOptions: Array<{ sku: string; label: string }> = []
    const registerSkuOption = (sku: string | null | undefined) => {
      const value = normalizeCell(sku)
      if (!value || skuOptionsSet.has(value)) return
      skuOptionsSet.add(value)
      skuOptions.push({ sku: value, label: value })
    }

    products.forEach((product) => {
      const mainSku = normalizeCell(product.sku)
      if (!mainSku) return
      registerSkuOption(mainSku)
    })
    aliases.forEach((alias) => {
      const aliasSku = normalizeCell(alias.aliasSku)
      if (!aliasSku) return
      registerSkuOption(aliasSku)
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
