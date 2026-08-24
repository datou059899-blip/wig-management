import { prisma } from '@/lib/prisma'
import {
  buildProductSkuResolver,
  isSpecialLinkSku,
  normalizeCell,
} from '@/lib/product-sku-resolver'
import { buildEffectiveInventorySnapshotWhere } from '@/lib/productInventorySnapshots'

export type RangeKey = 'today' | '7' | '30' | 'custom'

export type SelectedRange = {
  range: RangeKey
  startDate: Date
  endDate: Date
  endExclusive: Date
  startDateText: string
  endDateText: string
}

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

type InventoryConsumptionRow = {
  date: Date
  qty: number
  sampleQty: number
}

type OrderInventoryConsumptionRow = {
  paidDate: Date
  qty: number
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

export type PlatformStockSource =
  | 'snapshot_total'
  | 'snapshot_available_locked'
  | 'product_stock_fallback'
  | 'none'

export type ProductSalesInventoryProduct = {
  id: string
  sku: string
  name: string
  color: string
  length: string
  todaySales: number
  yesterdaySales: number
  weekSales: number
  monthSales: number
  selectedRangeSales: number
  stock: number
  platformSnapshotStock: number | null
  platformCurrentStock: number
  currentAvailableStock: number
  platformStockSource: PlatformStockSource
  platformSnapshotDate: string | null
  platformAvailableQty: number | null
  platformLockedQty: number | null
  platformTotalQty: number | null
  hasPlatformSnapshot: boolean
  hasBaseline: boolean
  estimatedStock: number
  inventoryDiff: number | null
  baselineQty: number
  baselineDate: string | null
  adjustmentTotal: number
  cumulativeStockConsumedQty: number
  sampleConsumedQty: number
  snapshotAdjustmentAfterQty: number
  snapshotConsumedAfterQty: number
  snapshotAgeDays: number | null
  inventoryDiffAbnormal: boolean
  syncStale: boolean
  earliestConsumptionDate: string | null
  dataReminders: string[]
  recent3DaySales: number
  sevenDaySales: number
  sevenDayAvgSales: number
  salesToStockRatio: number
  orderShareRatio: number
  velocityScore: number
  avgDailySales: number
  activeSalesDays: number
  salesRank: string
  salesRankPriority: number
  salesRankReason: string
  stockStatus: string
  updatedAt: string
}

export type ProductSalesInventorySummary = {
  todaySales: number
  yesterdaySales: number
  weekSales: number
  monthSales: number
  totalStock: number
  platformCurrentStock: number
  currentAvailableTotalStock: number
  estimatedTotalStock: number
  inventoryDiff: number
  lowStockCount: number
  outOfStockCount: number
  noPlatformSnapshotCount: number
  staleSnapshotCount: number
  inventoryDiffAbnormalCount: number
}

export type ProductSalesInventoryData = {
  summary: ProductSalesInventorySummary
  products: ProductSalesInventoryProduct[]
  skuOptions: Array<{ sku: string; label: string }>
  rankSettings: RankSettings
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

function formatNumber(value: number, digits = 2) {
  if (Number.isInteger(value)) {
    return String(value)
  }
  return value.toFixed(digits).replace(/\.?0+$/, '')
}

function formatPercent(value: number) {
  return `${formatNumber(value * 100, 1)}%`
}

const SKU_OPTION_MAX_LABEL_LENGTH = 30
const SKU_OPTION_GENERIC_NAME_TOKENS = new Set([
  'SUNNYMAY',
  'WOMEN',
  'WOMAN',
  'FASHION',
  'SYNTHETIC',
  'WIG',
  'WIGS',
  'LAYERED',
  'STYLE',
  'INCHES',
  'INCH',
  'LACE',
  'FRONT',
  'GLUELESS',
  'KNOTLESS',
  'BUTTERFLY',
  'CUT',
  'LONG',
  'CURLY',
  'BOB',
  'HIGHLIGHT',
  'HIGHLIGHTS',
  'HONEY',
  'BLONDE',
  'BROWN',
  'ASH',
  'HD',
  'PRECUT',
  'DENSITY',
  'DESIGN',
  'GEL',
  'FRONTAL',
  'FASHIONABLE',
  'LAYER',
  'COLORED',
  'COLOUR',
  'COLOR',
  'COLORS',
  'FOR',
  'AND',
  'WITH',
])

function getShortSkuOptionName(sku: string, productName: string | null | undefined) {
  const normalizedName = normalizeCell(productName).replace(/\s+/g, ' ').trim()
  if (!normalizedName || normalizedName === '-') return null

  const maxNameLength = Math.max(SKU_OPTION_MAX_LABEL_LENGTH - sku.length - 3, 0)
  if (maxNameLength <= 0) return null

  const wordCount = normalizedName.split(' ').filter(Boolean).length
  if (normalizedName.length <= maxNameLength && wordCount <= 3) {
    return normalizedName
  }

  const uppercaseCandidates = Array.from(
    new Set(
      normalizedName
        .match(/[A-Z]{3,20}/g)
        ?.map((token) => token.trim())
        .filter((token) => !SKU_OPTION_GENERIC_NAME_TOKENS.has(token))
        || [],
    ),
  ).sort((a, b) => b.length - a.length)

  const matchedUppercaseName = uppercaseCandidates.find((token) => token.length <= maxNameLength)
  if (matchedUppercaseName) {
    return matchedUppercaseName
  }

  return null
}

function getDiffDays(later: Date, earlier: Date) {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / msPerDay))
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

function resolveSalesMetric(item: { netOrders?: number | null; orders?: number | null }) {
  if (item.netOrders !== null && item.netOrders !== undefined) {
    return item.netOrders
  }
  return item.orders || 0
}

function resolvePlatformStock(snapshot: {
  totalQty: number | null
  availableQty: number | null
  lockedQty: number | null
  date: Date
} | null | undefined, fallbackStock: number) {
  if (snapshot) {
    if (snapshot.totalQty !== null && snapshot.totalQty !== undefined) {
      return {
        stock: snapshot.totalQty,
        source: 'snapshot_total' as const,
        hasSnapshot: true,
      }
    }

    const hasAvailableLocked = snapshot.availableQty !== null || snapshot.lockedQty !== null
    if (hasAvailableLocked) {
      return {
        stock: (snapshot.availableQty ?? 0) + (snapshot.lockedQty ?? 0),
        source: 'snapshot_available_locked' as const,
        hasSnapshot: true,
      }
    }
  }

  if (fallbackStock > 0) {
    return {
      stock: fallbackStock,
      source: 'product_stock_fallback' as const,
      hasSnapshot: false,
    }
  }

  return {
    stock: 0,
    source: 'none' as const,
    hasSnapshot: false,
  }
}

export async function getProductSalesInventoryData(selectedRange: SelectedRange): Promise<ProductSalesInventoryData> {
  const today = startOfDay(new Date())
  const tomorrow = addDays(today, 1)
  const yesterday = addDays(today, -1)
  const sevenDaysAgo = addDays(today, -6)
  const thirtyDaysAgo = addDays(today, -29)
  const queryStartDate = selectedRange.startDate < thirtyDaysAgo ? selectedRange.startDate : thirtyDaysAgo
  const queryEndExclusive = selectedRange.endExclusive > tomorrow
    ? selectedRange.endExclusive
    : tomorrow

  const [rawProducts, aliases, rankSettingRecord] = await Promise.all([
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

  const products = rawProducts.filter((product) => !isSpecialLinkSku(product.sku))
  const rankWindowDays = Math.max(rankSettings.windowDays, 1)
  const rankWindowStart = addDays(today, -(rankWindowDays - 1))
  const recentThreeDayStart = addDays(today, -2)
  const fixedSevenDayStart = addDays(today, -6)
  const performanceWindowStart = rankWindowStart.getTime() < fixedSevenDayStart.getTime()
    ? rankWindowStart
    : fixedSevenDayStart

  const skuResolver = buildProductSkuResolver(products, aliases)
  const {
    getPrimarySku,
    getFilterPrimarySkuForProduct,
    resolveProductBySku,
  } = skuResolver

  const explicitAliasListByProductId = new Map<string, string[]>()
  aliases.forEach((alias) => {
    const normalizedAliasSku = normalizeCell(alias.aliasSku)
    if (!normalizedAliasSku) return
    const bucket = explicitAliasListByProductId.get(alias.productId) || []
    if (!bucket.includes(normalizedAliasSku)) {
      bucket.push(normalizedAliasSku)
      explicitAliasListByProductId.set(alias.productId, bucket)
    }
  })

  const inventorySkuListByProductId = new Map<string, string[]>()
  products.forEach((product) => {
    const canonicalSku = normalizeCell(getPrimarySku(product.id))
    const explicitAliasSkus = explicitAliasListByProductId.get(product.id) || []
    const inventorySkus = Array.from(new Set([
      canonicalSku,
      ...explicitAliasSkus,
    ].filter(Boolean)))
    inventorySkuListByProductId.set(product.id, inventorySkus)
  })

  const displayProducts = Array.from(new Map(
    products.map((product) => {
      const canonicalProduct = resolveProductBySku(product.sku)?.product || product
      return [canonicalProduct.id, canonicalProduct] as const
    }),
  ).values())

  const productSkus = Array.from(new Set(
    Array.from(inventorySkuListByProductId.values()).flatMap((skuList) => skuList),
  ))

  const latestSnapshots = productSkus.length
    ? await prisma.productInventorySnapshot.findMany({
        where: buildEffectiveInventorySnapshotWhere({
          sku: {
            in: productSkus,
          },
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
    : []

  const latestSnapshotBySku = new Map<string, {
    totalQty: number | null
    availableQty: number | null
    lockedQty: number | null
    date: Date
  }>()
  latestSnapshots.forEach((snapshot) => {
    if (!latestSnapshotBySku.has(snapshot.sku)) {
      latestSnapshotBySku.set(snapshot.sku, {
        totalQty: snapshot.totalQty,
        availableQty: snapshot.availableQty,
        lockedQty: snapshot.lockedQty,
        date: snapshot.date,
      })
    }
  })

  const baselineSkuList = Array.from(new Set(
    Array.from(inventorySkuListByProductId.values()).flatMap((skuList) => skuList),
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
  const exactAdjustmentMap = new Map<string, AdjustmentRow[]>()

  const registerBaseline = (sku: string, row: BaselineRow) => {
    const exactBucket = exactBaselineMap.get(sku) || []
    exactBucket.push(row)
    exactBaselineMap.set(sku, exactBucket)
  }

  const registerAdjustment = (sku: string, row: AdjustmentRow) => {
    const exactBucket = exactAdjustmentMap.get(sku) || []
    exactBucket.push(row)
    exactAdjustmentMap.set(sku, exactBucket)
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

  const earliestLatestSnapshotDate = Array.from(latestSnapshotBySku.values()).reduce<Date | null>((earliest, snapshot) => {
    if (!earliest || snapshot.date.getTime() < earliest.getTime()) return snapshot.date
    return earliest
  }, null)
  const productOrderItemStartDate = earliestLatestSnapshotDate || inventoryConsumptionStartDate

  const [salesPerformanceData, inventoryPerformanceData, rankPerformanceData, postSnapshotOrderItems] = await Promise.all([
    prisma.performanceDaily.findMany({
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
    }),
    prisma.performanceDaily.findMany({
      where: {
        date: {
          gte: inventoryConsumptionStartDate,
          lt: tomorrow,
        },
      },
      select: {
        sku: true,
        stockConsumedQty: true,
        sampleQty: true,
        date: true,
      },
    }),
    prisma.performanceDaily.findMany({
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
    }),
    productSkus.length
      ? prisma.productOrderItem.findMany({
          where: {
            productMatched: true,
            stockConsumedQty: { gt: 0 },
            sellerSku: { in: productSkus },
            paidDate: {
              gt: productOrderItemStartDate,
              lt: tomorrow,
            },
          },
          select: {
            sellerSku: true,
            paidDate: true,
            stockConsumedQty: true,
          },
        })
      : [],
  ])

  const salesByProductId = new Map<string, {
    today: number
    yesterday: number
    week: number
    month: number
    selectedRange: number
  }>()
  const consumedRowsByProductId = new Map<string, InventoryConsumptionRow[]>()
  const orderConsumedRowsByProductId = new Map<string, OrderInventoryConsumptionRow[]>()
  const rankDailySalesByProductId = new Map<string, Map<string, number>>()
  const storeSalesByDate = new Map<string, number>()

  salesPerformanceData.forEach((perf) => {
    if (!perf.sku) return
    const match = resolveProductBySku(perf.sku)
    if (!match) return
    const bucket = salesByProductId.get(match.product.id) || {
      today: 0,
      yesterday: 0,
      week: 0,
      month: 0,
      selectedRange: 0,
    }

    const perfDate = startOfDay(new Date(perf.date))
    if (perfDate.getTime() === today.getTime()) bucket.today += perf.orders
    if (perfDate.getTime() === yesterday.getTime()) bucket.yesterday += perf.orders
    if (perfDate >= sevenDaysAgo && perfDate <= today) bucket.week += perf.orders
    if (perfDate >= thirtyDaysAgo && perfDate <= today) bucket.month += perf.orders
    if (perfDate >= selectedRange.startDate && perfDate < selectedRange.endExclusive) bucket.selectedRange += perf.orders
    salesByProductId.set(match.product.id, bucket)
  })

  inventoryPerformanceData.forEach((perf) => {
    if (!perf.sku) return
    const perfDate = startOfDay(new Date(perf.date))
    const productId = resolveProductBySku(perf.sku)?.product.id
    if (!productId) return
    const bucket = consumedRowsByProductId.get(productId) || []
    bucket.push({
      date: perfDate,
      qty: perf.stockConsumedQty || 0,
      sampleQty: perf.sampleQty || 0,
    })
    consumedRowsByProductId.set(productId, bucket)
  })

  postSnapshotOrderItems.forEach((item) => {
    if (!item.sellerSku) return
    const productId = resolveProductBySku(item.sellerSku)?.product.id
    if (!productId) return
    const bucket = orderConsumedRowsByProductId.get(productId) || []
    bucket.push({
      paidDate: item.paidDate,
      qty: item.stockConsumedQty || 0,
    })
    orderConsumedRowsByProductId.set(productId, bucket)
  })

  rankPerformanceData.forEach((perf) => {
    if (!perf.sku) return
    const productId = resolveProductBySku(perf.sku)?.product.id
    if (!productId) return
    const dateKey = formatDateKey(startOfDay(new Date(perf.date)))
    const effectiveSales = Math.max(resolveSalesMetric(perf), 0)

    storeSalesByDate.set(dateKey, (storeSalesByDate.get(dateKey) || 0) + effectiveSales)

    const productDailySales = rankDailySalesByProductId.get(productId) || new Map<string, number>()
    productDailySales.set(dateKey, (productDailySales.get(dateKey) || 0) + effectiveSales)
    rankDailySalesByProductId.set(productId, productDailySales)
  })

  const tableData: ProductSalesInventoryProduct[] = displayProducts.map((product) => {
    const sales = salesByProductId.get(product.id) || {
      today: 0,
      yesterday: 0,
      week: 0,
      month: 0,
      selectedRange: 0,
    }

    const orderedCandidateSkus = inventorySkuListByProductId.get(product.id) || []

    let selectedSnapshot: {
      totalQty: number | null
      availableQty: number | null
      lockedQty: number | null
      date: Date
    } | null = null
    let selectedPlatformStock = 0
    let selectedPlatformSource: PlatformStockSource = 'none'
    let selectedHasPlatformSnapshot = false

    for (const candidateSku of orderedCandidateSkus) {
      const snapshot = latestSnapshotBySku.get(candidateSku)
      if (!snapshot) continue
      const resolvedStock = resolvePlatformStock(snapshot, product.stock || 0)
      selectedSnapshot = snapshot
      selectedPlatformStock = resolvedStock.stock
      selectedPlatformSource = resolvedStock.source
      selectedHasPlatformSnapshot = resolvedStock.hasSnapshot
      break
    }

    if (!selectedSnapshot) {
      const resolvedStock = resolvePlatformStock(null, product.stock || 0)
      selectedPlatformStock = resolvedStock.stock
      selectedPlatformSource = resolvedStock.source
      selectedHasPlatformSnapshot = resolvedStock.hasSnapshot
    }

    const baselineCandidates = Array.from(new Map(
      orderedCandidateSkus.flatMap((sku) => {
        const rows = exactBaselineMap.get(sku) || []
        return rows.map((row) => [`${row.sku}:${row.baselineDate.getTime()}`, row] as const)
      }),
    ).values()).sort((a, b) => a.baselineDate.getTime() - b.baselineDate.getTime())

    const activeBaseline = baselineCandidates.length
      ? baselineCandidates[baselineCandidates.length - 1]
      : null

    const adjustmentCandidates = Array.from(new Map(
      orderedCandidateSkus.flatMap((sku) => {
        const rows = exactAdjustmentMap.get(sku) || []
        return rows.map((row) => [`${row.sku}:${row.adjustmentDate.getTime()}:${row.quantity}:${row.type}`, row] as const)
      }),
    ).values()).sort((a, b) => a.adjustmentDate.getTime() - b.adjustmentDate.getTime())

    const hasBaseline = Boolean(activeBaseline)
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
      : 0
    const baselineQty = activeBaseline ? activeBaseline.quantity : 0
    const baselineDate = activeBaseline ? activeBaseline.baselineDate : null
    const adjustmentTotal = activeBaseline
      ? adjustmentCandidates.reduce((sum, row) => (
          row.adjustmentDate >= activeBaseline.baselineDate && row.adjustmentDate < tomorrow
            ? sum + row.quantity
            : sum
        ), 0)
      : 0
    const cumulativeStockConsumedQty = activeBaseline
      ? (consumedRowsByProductId.get(product.id) || []).reduce((sum, row) => (
          row.date >= activeBaseline.baselineDate && row.date < tomorrow ? sum + row.qty : sum
        ), 0)
      : 0
    const sampleConsumedQty = activeBaseline
      ? (consumedRowsByProductId.get(product.id) || []).reduce((sum, row) => (
          row.date >= activeBaseline.baselineDate && row.date < tomorrow ? sum + row.sampleQty : sum
        ), 0)
      : 0
    const postSnapshotAdjustmentRows = selectedSnapshot
      ? adjustmentCandidates.filter((row) => row.adjustmentDate > selectedSnapshot.date && row.adjustmentDate < tomorrow)
      : []
    const snapshotAdjustmentAfterQty = postSnapshotAdjustmentRows.reduce((sum, row) => sum + row.quantity, 0)
    const postSnapshotConsumedRows = selectedSnapshot
      ? (orderConsumedRowsByProductId.get(product.id) || []).filter((row) => row.paidDate > selectedSnapshot.date && row.paidDate < tomorrow)
      : []
    const snapshotConsumedAfterQty = postSnapshotConsumedRows.reduce((sum, row) => sum + row.qty, 0)
    const platformSnapshotStock = selectedHasPlatformSnapshot ? selectedPlatformStock : null
    const currentAvailableStock = selectedHasPlatformSnapshot
      ? Math.max(selectedPlatformStock + snapshotAdjustmentAfterQty - snapshotConsumedAfterQty, 0)
      : selectedPlatformStock
    const inventoryDiff = hasBaseline ? estimatedStock - currentAvailableStock : null
    const snapshotAgeDays = selectedSnapshot ? getDiffDays(today, selectedSnapshot.date) : null
    const syncStale = Boolean(selectedHasPlatformSnapshot && snapshotAgeDays !== null && snapshotAgeDays > 3)
    const inventoryDiffAbnormal = Boolean(inventoryDiff !== null && Math.abs(inventoryDiff) > 10)
    const earliestConsumptionDateValue = (consumedRowsByProductId.get(product.id) || []).reduce<Date | null>((earliest, row) => {
      if (!earliest || row.date.getTime() < earliest.getTime()) return row.date
      return earliest
    }, null)
    const dataReminders: string[] = []

    if (!selectedHasPlatformSnapshot) {
      dataReminders.push('无平台快照')
    } else if (syncStale) {
      dataReminders.push('平台库存未同步')
    }

    if (inventoryDiffAbnormal) {
      dataReminders.push('库存差异较大')
    }

    if (baselineDate && earliestConsumptionDateValue && baselineDate.getTime() > earliestConsumptionDateValue.getTime()) {
      dataReminders.push('入库日期可能异常')
    }

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
          cReason = `C 潜力品：${dateKey.slice(5)} 单日销量 ${formatNumber(dailySales)}，占当前系统预计库存 ${formatPercent(dailySales / estimatedStock)}`
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
    if (currentAvailableStock === 0) {
      stockStatus = '缺货'
    } else if (currentAvailableStock <= 10) {
      stockStatus = '低库存'
    }

    return {
      id: product.id,
      sku: getFilterPrimarySkuForProduct(product) || getPrimarySku(product.id) || product.sku || '-',
      name: product.name,
      color: product.color || '-',
      length: product.length || '-',
      todaySales: sales.today,
      yesterdaySales: sales.yesterday,
      weekSales: sales.week,
      monthSales: sales.month,
      selectedRangeSales: sales.selectedRange,
      stock: product.stock || 0,
      platformSnapshotStock,
      platformCurrentStock: currentAvailableStock,
      currentAvailableStock,
      platformStockSource: selectedPlatformSource,
      platformSnapshotDate: selectedSnapshot ? selectedSnapshot.date.toISOString() : null,
      platformAvailableQty: selectedSnapshot?.availableQty ?? null,
      platformLockedQty: selectedSnapshot?.lockedQty ?? null,
      platformTotalQty: selectedSnapshot?.totalQty ?? null,
      hasPlatformSnapshot: selectedHasPlatformSnapshot,
      hasBaseline,
      estimatedStock,
      inventoryDiff,
      baselineQty,
      baselineDate: baselineDate ? baselineDate.toISOString() : null,
      adjustmentTotal,
      cumulativeStockConsumedQty,
      sampleConsumedQty,
      snapshotAdjustmentAfterQty,
      snapshotConsumedAfterQty,
      snapshotAgeDays,
      inventoryDiffAbnormal,
      syncStale,
      earliestConsumptionDate: earliestConsumptionDateValue ? earliestConsumptionDateValue.toISOString() : null,
      dataReminders,
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
  const registerSkuOption = (sku: string | null | undefined, productName: string | null | undefined) => {
    const value = normalizeCell(sku)
    if (!value || value === '-' || skuOptionsSet.has(value)) return
    skuOptionsSet.add(value)
    const shortName = getShortSkuOptionName(value, productName)
    const label = shortName ? `${value} - ${shortName}` : value
    skuOptions.push({ sku: value, label })
  }

  tableData.forEach((row) => {
    registerSkuOption(row.sku, row.name)
  })

  skuOptions.sort((a, b) => a.sku.localeCompare(b.sku))

  const totalTodaySales = tableData.reduce((sum, item) => sum + item.todaySales, 0)
  const totalYesterdaySales = tableData.reduce((sum, item) => sum + item.yesterdaySales, 0)
  const totalWeekSales = tableData.reduce((sum, item) => sum + item.weekSales, 0)
  const totalMonthSales = tableData.reduce((sum, item) => sum + item.monthSales, 0)
  const currentAvailableTotalStock = tableData.reduce((sum, product) => sum + product.currentAvailableStock, 0)
  const forecastableProducts = tableData.filter((product) => product.hasBaseline)
  const estimatedTotalStock = forecastableProducts.reduce((sum, product) => sum + product.estimatedStock, 0)
  const inventoryDiff = forecastableProducts.reduce((sum, product) => sum + (product.inventoryDiff || 0), 0)
  const lowStockCount = tableData.filter((product) => product.currentAvailableStock > 0 && product.currentAvailableStock <= 10).length
  const outOfStockCount = tableData.filter((product) => product.currentAvailableStock === 0).length
  const noPlatformSnapshotCount = tableData.filter((product) => !product.hasPlatformSnapshot).length
  const staleSnapshotCount = tableData.filter((product) => product.syncStale).length
  const inventoryDiffAbnormalCount = tableData.filter((product) => product.inventoryDiffAbnormal).length

  return {
    summary: {
      todaySales: totalTodaySales,
      yesterdaySales: totalYesterdaySales,
      weekSales: totalWeekSales,
      monthSales: totalMonthSales,
      totalStock: currentAvailableTotalStock,
      platformCurrentStock: currentAvailableTotalStock,
      currentAvailableTotalStock,
      estimatedTotalStock,
      inventoryDiff,
      lowStockCount,
      outOfStockCount,
      noPlatformSnapshotCount,
      staleSnapshotCount,
      inventoryDiffAbnormalCount,
    },
    products: tableData,
    skuOptions,
    rankSettings,
  }
}
