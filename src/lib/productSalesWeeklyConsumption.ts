import { prisma } from '@/lib/prisma'
import {
  buildProductSkuResolver,
  extractMainSkuFromText,
  normalizeCell,
  normalizeSkuForCompare,
  normalizeSkuText,
} from '@/lib/product-sku-resolver'

export type WeeklyConsumptionMode = 'summary' | 'detail'

export type WeeklyConsumptionTrendPoint = {
  weekStart: string
  weekEnd: string
  label: string
  openingStock: number | null
  openingStockStatus: 'ok' | 'missing' | 'zero'
  ordinarySalesConsumedQty: number
  salesConsumptionRate: number | null
  sampleConsumedQty: number
  hasReplenishment: boolean
  hasManualAdjustment: boolean
  flags: string[]
}

export type WeeklyConsumptionStoreTrendPoint = {
  weekStart: string
  weekEnd: string
  label: string
  ordinarySalesConsumedQty: number
  denominatorOpeningStock: number
  weightedSalesConsumedQty: number
  weightedSalesConsumptionRate: number | null
  validSkuCount: number
  missingOpeningStockSkuCount: number
  zeroOpeningStockSkuCount: number
}

export type WeeklyConsumptionRankingItem = {
  sku: string
  productId: string
  productName: string
  currentAvailableStock: number | null
  latestCompleteWeek: WeeklyConsumptionTrendPoint
  previousCompleteWeek: WeeklyConsumptionTrendPoint | null
  deltaQty: number
  growthRate: number | null
  growthLabel: string
  stockoutImpactLikely: boolean
}

export type WeeklyConsumptionSkuMetric = {
  sku: string
  productId: string
  productName: string
  currentAvailableStock: number | null
  currentWeek: WeeklyConsumptionTrendPoint | null
  previousComparable: WeeklyConsumptionTrendPoint | null
  unitChange: number | null
  ratePointChange: number | null
  latestCompleteWeek: WeeklyConsumptionTrendPoint | null
  previousCompleteWeek: WeeklyConsumptionTrendPoint | null
  recent4WeekAverageSales: number | null
  estimatedWeeksOfSupply: number | null
  trendSummary: string[]
  earliestValidOpeningStockWeek: string | null
  missingOpeningStockWeekCount: number
  recentCompleteWeeks: WeeklyConsumptionTrendPoint[]
}

export type WeeklyConsumptionSummary = {
  currentWeekConsumedQty: number
  previousComparableConsumedQty: number
  consumedQtyChange: number
  weightedSalesConsumptionRate: number | null
  previousWeightedSalesConsumptionRate: number | null
  weightedRatePointChange: number | null
  denominatorOpeningStock: number
  validSkuCount: number
  missingOpeningStockSkuCount: number
  zeroOpeningStockSkuCount: number
}

export type WeeklyConsumptionData = {
  generatedAt: string
  mode: WeeklyConsumptionMode
  limitWeeks: number
  includeCurrentWeek: boolean
  currentWeekRange: {
    startDate: string
    endDate: string
    endExclusive: string
  } | null
  previousComparableRange: {
    startDate: string
    endDate: string
    endExclusive: string
  }
  summary: WeeklyConsumptionSummary | null
  previousCompleteWeek: WeeklyConsumptionStoreTrendPoint | null
  weekBeforePrevious: WeeklyConsumptionStoreTrendPoint | null
  storeCompleteWeekTrend: WeeklyConsumptionStoreTrendPoint[]
  storeTrendSummary: string[]
  skuOptions: Array<{ sku: string; label: string }>
  skuMetrics: WeeklyConsumptionSkuMetric[]
  selectedSkuMetric: WeeklyConsumptionSkuMetric | null
  rankings: {
    byConsumedQty: WeeklyConsumptionSkuMetric[]
    byConsumptionRate: WeeklyConsumptionSkuMetric[]
  }
  rankingByLatestCompleteWeekSales: WeeklyConsumptionRankingItem[]
  rankingByGrowth: WeeklyConsumptionRankingItem[]
  rankingByDecline: WeeklyConsumptionRankingItem[]
  queryWindow: {
    earliestRequestedWeekStart: string
    earliestRequiredAnchorDate: string | null
    orderStartExclusive: string | null
    orderEndExclusive: string
  }
  notes: string[]
}

type ProductRow = {
  id: string
  name: string
  sku: string | null
  stock: number
  aliases: Array<{ aliasSku: string | null }>
}

type WeekRange = {
  startDate: Date
  endDate: Date
  endExclusive: Date
}

type InventoryEventRow = {
  sku: string
  date: Date
  quantity: number
  type?: string
}

type SnapshotRow = InventoryEventRow & {
  availableQty: number | null
  lockedQty: number | null
  totalQty: number | null
}

type OrderEventRow = {
  sellerSku: string
  paidDate: Date
  stockConsumedQty: number
  isSample: boolean
}

type ProductInventoryContext = {
  product: ProductRow
  primarySku: string
  candidateSkus: string[]
  candidateSkuKeys: Set<string>
  snapshots: SnapshotRow[]
  baselines: InventoryEventRow[]
  adjustments: InventoryEventRow[]
  orders: OrderEventRow[]
}

type BuildWeekPointParams = {
  range: WeekRange
  context: ProductInventoryContext
}

const MIN_OPENING_STOCK_FOR_RATE_RANKING = 5
const MAX_LIMIT_WEEKS = 26

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

function getMondayStart(date: Date) {
  const today = startOfDay(date)
  const day = today.getDay()
  return addDays(today, day === 0 ? -6 : 1 - day)
}

function resolveSnapshotQty(snapshot: {
  totalQty: number | null
  availableQty: number | null
  lockedQty: number | null
}) {
  if (snapshot.totalQty !== null && snapshot.totalQty !== undefined && snapshot.totalQty > 0) {
    return snapshot.totalQty
  }
  return (snapshot.availableQty ?? 0) + (snapshot.lockedQty ?? 0)
}

function uniqueSkuValues(values: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const result: string[] = []
  values.forEach((value) => {
    const normalized = normalizeSkuText(value)
    if (!normalized) return
    const key = normalizeSkuForCompare(normalized)
    if (seen.has(key)) return
    seen.add(key)
    result.push(normalized)
  })
  return result
}

function buildStrictInventorySkus(product: ProductRow) {
  const mainSku = extractMainSkuFromText(product.sku) || product.sku
  return uniqueSkuValues([
    product.sku,
    mainSku,
    ...product.aliases.map((alias) => alias.aliasSku),
  ])
}

function pushGroupedRow<T extends { sku: string }>(map: Map<string, T[]>, row: T) {
  const key = normalizeSkuForCompare(row.sku)
  if (!key) return
  const bucket = map.get(key) || []
  bucket.push(row)
  map.set(key, bucket)
}

function getRowsForSkuKeys<T>(map: Map<string, T[]>, keys: Set<string>) {
  const result: T[] = []
  keys.forEach((key) => {
    result.push(...(map.get(key) || []))
  })
  return result
}

function buildWeekRanges(limitWeeks: number, includeCurrentWeek: boolean) {
  const today = startOfDay(new Date())
  const currentWeekStart = getMondayStart(today)
  const currentEndExclusive = addDays(today, 1)
  const dayCountInCurrentWeek = Math.max(
    1,
    Math.round((currentEndExclusive.getTime() - currentWeekStart.getTime()) / 86400000),
  )
  const previousComparableStart = addDays(currentWeekStart, -7)
  const previousComparableEndExclusive = addDays(previousComparableStart, dayCountInCurrentWeek)
  const completeWeekRanges: WeekRange[] = []

  for (let index = limitWeeks; index >= 1; index -= 1) {
    const startDate = addDays(currentWeekStart, -7 * index)
    completeWeekRanges.push({
      startDate,
      endDate: addDays(startDate, 6),
      endExclusive: addDays(startDate, 7),
    })
  }

  return {
    currentWeek: includeCurrentWeek
      ? {
          startDate: currentWeekStart,
          endDate: today,
          endExclusive: currentEndExclusive,
        }
      : null,
    previousComparable: {
      startDate: previousComparableStart,
      endDate: addDays(previousComparableEndExclusive, -1),
      endExclusive: previousComparableEndExclusive,
    },
    completeWeekRanges,
    earliestRequestedWeekStart: completeWeekRanges[0]?.startDate || previousComparableStart,
    orderEndExclusive: currentEndExclusive,
  }
}

function sumAdjustmentsBetween(rows: InventoryEventRow[], startExclusive: Date, endExclusive: Date) {
  return rows.reduce((sum, row) => {
    if (row.date.getTime() <= startExclusive.getTime()) return sum
    if (row.date.getTime() >= endExclusive.getTime()) return sum
    return sum + row.quantity
  }, 0)
}

function sumOrderConsumedBetween(rows: OrderEventRow[], startInclusive: Date, endExclusive: Date, sampleMode: 'all' | 'ordinary' | 'sample') {
  return rows.reduce((sum, row) => {
    if (row.paidDate.getTime() < startInclusive.getTime()) return sum
    if (row.paidDate.getTime() >= endExclusive.getTime()) return sum
    if (sampleMode === 'ordinary' && row.isSample) return sum
    if (sampleMode === 'sample' && !row.isSample) return sum
    return sum + row.stockConsumedQty
  }, 0)
}

function buildWeekPointFlags(point: Omit<WeeklyConsumptionTrendPoint, 'flags'>) {
  const flags: string[] = []
  if (point.openingStockStatus === 'missing') flags.push('缺少周初库存')
  if (point.openingStockStatus === 'zero') flags.push('周初库存为0')
  if (point.hasReplenishment) flags.push('周中补货')
  if (point.hasManualAdjustment) flags.push('周中调整')
  if (point.sampleConsumedQty > 0) flags.push(`样品消耗 ${point.sampleConsumedQty}`)
  if (point.salesConsumptionRate !== null && point.salesConsumptionRate > 1) flags.push('销售消耗率超过100%')
  return flags
}

function findOpeningAnchor(weekStart: Date, context: ProductInventoryContext) {
  const snapshot = context.snapshots.find((row) => row.date.getTime() < weekStart.getTime())
  if (snapshot) {
    return {
      source: 'snapshot' as const,
      date: snapshot.date,
      quantity: snapshot.quantity,
      sku: snapshot.sku,
    }
  }

  const baseline = context.baselines.find((row) => row.date.getTime() <= weekStart.getTime())
  if (!baseline) return null

  return {
    source: 'baseline' as const,
    date: baseline.date,
    quantity: baseline.quantity,
    sku: baseline.sku,
  }
}

function resolveEarliestAnchorDateForContext(weekStart: Date, context: ProductInventoryContext) {
  const anchor = findOpeningAnchor(weekStart, context)
  return anchor?.date || null
}

function buildWeekPoint({ range, context }: BuildWeekPointParams): WeeklyConsumptionTrendPoint {
  const anchor = findOpeningAnchor(range.startDate, context)
  let openingStock: number | null = null

  if (anchor) {
    const adjustmentQty = sumAdjustmentsBetween(context.adjustments, anchor.date, range.startDate)
    const consumedQty = sumOrderConsumedBetween(context.orders, addDays(anchor.date, 1), range.startDate, 'all')
    openingStock = anchor.quantity + adjustmentQty - consumedQty
  }

  const ordinarySalesConsumedQty = sumOrderConsumedBetween(context.orders, range.startDate, range.endExclusive, 'ordinary')
  const sampleConsumedQty = sumOrderConsumedBetween(context.orders, range.startDate, range.endExclusive, 'sample')
  const weekAdjustments = context.adjustments.filter((row) => (
    row.date.getTime() >= range.startDate.getTime()
    && row.date.getTime() < range.endExclusive.getTime()
  ))
  const hasReplenishment = weekAdjustments.some((row) => row.type === 'replenish' || row.quantity > 0)
  const hasManualAdjustment = weekAdjustments.some((row) => row.type !== 'replenish')
  const openingStockStatus: WeeklyConsumptionTrendPoint['openingStockStatus'] = openingStock === null
    ? 'missing'
    : openingStock <= 0
      ? 'zero'
      : 'ok'
  const salesConsumptionRate = openingStockStatus === 'ok'
    ? ordinarySalesConsumedQty / openingStock!
    : null
  const pointWithoutFlags = {
    weekStart: formatDateKey(range.startDate),
    weekEnd: formatDateKey(range.endDate),
    label: `${formatDateKey(range.startDate).slice(5)}~${formatDateKey(range.endDate).slice(5)}`,
    openingStock,
    openingStockStatus,
    ordinarySalesConsumedQty,
    salesConsumptionRate,
    sampleConsumedQty,
    hasReplenishment,
    hasManualAdjustment,
  }

  return {
    ...pointWithoutFlags,
    flags: buildWeekPointFlags(pointWithoutFlags),
  }
}

function createEmptySummary(): WeeklyConsumptionSummary {
  return {
    currentWeekConsumedQty: 0,
    previousComparableConsumedQty: 0,
    consumedQtyChange: 0,
    weightedSalesConsumptionRate: null,
    previousWeightedSalesConsumptionRate: null,
    weightedRatePointChange: null,
    denominatorOpeningStock: 0,
    validSkuCount: 0,
    missingOpeningStockSkuCount: 0,
    zeroOpeningStockSkuCount: 0,
  }
}

function createEmptyStoreTrendPoint(range: WeekRange): WeeklyConsumptionStoreTrendPoint {
  return {
    weekStart: formatDateKey(range.startDate),
    weekEnd: formatDateKey(range.endDate),
    label: `${formatDateKey(range.startDate).slice(5)}~${formatDateKey(range.endDate).slice(5)}`,
    ordinarySalesConsumedQty: 0,
    denominatorOpeningStock: 0,
    weightedSalesConsumedQty: 0,
    weightedSalesConsumptionRate: null,
    validSkuCount: 0,
    missingOpeningStockSkuCount: 0,
    zeroOpeningStockSkuCount: 0,
  }
}

function buildStoreTrendPoint(range: WeekRange, points: WeeklyConsumptionTrendPoint[]): WeeklyConsumptionStoreTrendPoint {
  const validPoints = points.filter((point) => (
    point.openingStockStatus === 'ok'
    && point.openingStock !== null
    && point.openingStock > 0
  ))
  const denominatorOpeningStock = validPoints.reduce((sum, point) => sum + (point.openingStock || 0), 0)
  const weightedSalesConsumedQty = validPoints.reduce((sum, point) => sum + point.ordinarySalesConsumedQty, 0)

  return {
    ...createEmptyStoreTrendPoint(range),
    ordinarySalesConsumedQty: points.reduce((sum, point) => sum + point.ordinarySalesConsumedQty, 0),
    denominatorOpeningStock,
    weightedSalesConsumedQty,
    weightedSalesConsumptionRate: denominatorOpeningStock > 0 ? weightedSalesConsumedQty / denominatorOpeningStock : null,
    validSkuCount: validPoints.length,
    missingOpeningStockSkuCount: points.filter((point) => point.openingStockStatus === 'missing').length,
    zeroOpeningStockSkuCount: points.filter((point) => point.openingStockStatus === 'zero').length,
  }
}

function buildStoreCompleteWeekTrend(contexts: ProductInventoryContext[], ranges: WeekRange[]) {
  return ranges.map((range) => buildStoreTrendPoint(
    range,
    contexts.map((context) => buildWeekPoint({ range, context })),
  ))
}

function buildStoreTrendSummary(trend: WeeklyConsumptionStoreTrendPoint[]) {
  const latest = trend[trend.length - 1]
  const previous = trend[trend.length - 2]
  if (!latest || !previous) return ['数据不足，暂不判断趋势。']

  const messages: string[] = []
  const delta = latest.ordinarySalesConsumedQty - previous.ordinarySalesConsumedQty
  if (delta > 0) messages.push(`最近一周较前一周增长 ${delta} 件。`)
  else if (delta < 0) messages.push(`最近一周较前一周回落 ${Math.abs(delta)} 件。`)
  else messages.push('最近一周与前一周销量持平。')

  let streak = 0
  for (let index = trend.length - 1; index > 0; index -= 1) {
    const current = trend[index]
    const before = trend[index - 1]
    if (current.ordinarySalesConsumedQty > before.ordinarySalesConsumedQty) streak += 1
    else break
  }
  if (streak >= 2) messages.push(`已连续 ${streak} 周增长。`)

  const average = trend.reduce((sum, point) => sum + point.ordinarySalesConsumedQty, 0) / trend.length
  if (average > 0) {
    const diffRate = (latest.ordinarySalesConsumedQty - average) / average
    if (Math.abs(diffRate) >= 0.05) {
      messages.push(`最近一周较 ${trend.length} 周平均${diffRate > 0 ? '高' : '低'} ${Math.abs(diffRate * 100).toFixed(0)}%。`)
    }
  }

  return messages
}

function buildWeightedSummary(metrics: WeeklyConsumptionSkuMetric[]) {
  const withCurrent = metrics.filter((metric) => metric.currentWeek)
  if (withCurrent.length === 0) return createEmptySummary()

  const validCurrentMetrics = withCurrent.filter((metric) => (
    metric.currentWeek?.openingStock !== null
    && (metric.currentWeek?.openingStock || 0) > 0
  ))
  const validPreviousMetrics = withCurrent.filter((metric) => (
    metric.previousComparable?.openingStock !== null
    && (metric.previousComparable?.openingStock || 0) > 0
  ))
  const currentWeekConsumedQty = withCurrent.reduce((sum, metric) => sum + (metric.currentWeek?.ordinarySalesConsumedQty || 0), 0)
  const previousComparableConsumedQty = withCurrent.reduce((sum, metric) => sum + (metric.previousComparable?.ordinarySalesConsumedQty || 0), 0)
  const currentDenominator = validCurrentMetrics.reduce((sum, metric) => sum + (metric.currentWeek?.openingStock || 0), 0)
  const previousDenominator = validPreviousMetrics.reduce((sum, metric) => sum + (metric.previousComparable?.openingStock || 0), 0)
  const currentWeightedNumerator = validCurrentMetrics.reduce((sum, metric) => sum + (metric.currentWeek?.ordinarySalesConsumedQty || 0), 0)
  const previousWeightedNumerator = validPreviousMetrics.reduce((sum, metric) => sum + (metric.previousComparable?.ordinarySalesConsumedQty || 0), 0)
  const weightedSalesConsumptionRate = currentDenominator > 0 ? currentWeightedNumerator / currentDenominator : null
  const previousWeightedSalesConsumptionRate = previousDenominator > 0 ? previousWeightedNumerator / previousDenominator : null

  return {
    currentWeekConsumedQty,
    previousComparableConsumedQty,
    consumedQtyChange: currentWeekConsumedQty - previousComparableConsumedQty,
    weightedSalesConsumptionRate,
    previousWeightedSalesConsumptionRate,
    weightedRatePointChange: weightedSalesConsumptionRate !== null && previousWeightedSalesConsumptionRate !== null
      ? weightedSalesConsumptionRate - previousWeightedSalesConsumptionRate
      : null,
    denominatorOpeningStock: currentDenominator,
    validSkuCount: validCurrentMetrics.length,
    missingOpeningStockSkuCount: withCurrent.filter((metric) => metric.currentWeek?.openingStockStatus === 'missing').length,
    zeroOpeningStockSkuCount: withCurrent.filter((metric) => metric.currentWeek?.openingStockStatus === 'zero').length,
  }
}

async function loadProductsAndAliases() {
  return prisma.product.findMany({
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
}

function buildProductContexts(
  products: ProductRow[],
  rows: {
    snapshots: SnapshotRow[]
    baselines: InventoryEventRow[]
    adjustments: InventoryEventRow[]
    orders: OrderEventRow[]
  },
) {
  const aliases = products.flatMap((product) => (
    product.aliases.map((alias) => ({ productId: product.id, aliasSku: alias.aliasSku }))
  ))
  const resolver = buildProductSkuResolver(products, aliases)
  const snapshotsBySku = new Map<string, SnapshotRow[]>()
  const baselinesBySku = new Map<string, InventoryEventRow[]>()
  const adjustmentsBySku = new Map<string, InventoryEventRow[]>()
  const ordersByProductId = new Map<string, OrderEventRow[]>()

  rows.snapshots.forEach((row) => pushGroupedRow(snapshotsBySku, row))
  rows.baselines.forEach((row) => pushGroupedRow(baselinesBySku, row))
  rows.adjustments.forEach((row) => pushGroupedRow(adjustmentsBySku, row))
  rows.orders.forEach((row) => {
    const match = resolver.resolveProductBySku(row.sellerSku)
    if (!match) return
    const bucket = ordersByProductId.get(match.product.id) || []
    bucket.push(row)
    ordersByProductId.set(match.product.id, bucket)
  })

  snapshotsBySku.forEach((bucket) => bucket.sort((a, b) => b.date.getTime() - a.date.getTime()))
  baselinesBySku.forEach((bucket) => bucket.sort((a, b) => b.date.getTime() - a.date.getTime()))
  adjustmentsBySku.forEach((bucket) => bucket.sort((a, b) => a.date.getTime() - b.date.getTime()))
  ordersByProductId.forEach((bucket) => bucket.sort((a, b) => a.paidDate.getTime() - b.paidDate.getTime()))

  return products.map((product): ProductInventoryContext => {
    const candidateSkus = buildStrictInventorySkus(product)
    const candidateSkuKeys = new Set(candidateSkus.map((sku) => normalizeSkuForCompare(sku)))
    return {
      product,
      primarySku: candidateSkus[0] || product.sku || product.name,
      candidateSkus,
      candidateSkuKeys,
      snapshots: getRowsForSkuKeys(snapshotsBySku, candidateSkuKeys).sort((a, b) => b.date.getTime() - a.date.getTime()),
      baselines: getRowsForSkuKeys(baselinesBySku, candidateSkuKeys).sort((a, b) => b.date.getTime() - a.date.getTime()),
      adjustments: getRowsForSkuKeys(adjustmentsBySku, candidateSkuKeys).sort((a, b) => a.date.getTime() - b.date.getTime()),
      orders: ordersByProductId.get(product.id) || [],
    }
  })
}

function resolveCurrentAvailableStock(context: ProductInventoryContext) {
  const latestSnapshot = context.snapshots[0]
  if (latestSnapshot) return latestSnapshot.quantity
  return context.product.stock
}

function averageRecentSales(points: WeeklyConsumptionTrendPoint[], count: number) {
  const recent = points.slice(-count)
  if (recent.length === 0) return null
  return recent.reduce((sum, point) => sum + point.ordinarySalesConsumedQty, 0) / recent.length
}

function buildSkuTrendSummary(metric: WeeklyConsumptionSkuMetric) {
  const latest = metric.latestCompleteWeek
  const previous = metric.previousCompleteWeek
  if (!latest || !previous) return ['完整周数据不足，暂不判断趋势。']

  const messages: string[] = []
  const delta = latest.ordinarySalesConsumedQty - previous.ordinarySalesConsumedQty
  if (delta > 0) messages.push(`${metric.sku} 最近完整周销售 ${latest.ordinarySalesConsumedQty} 件，较前一周增加 ${delta} 件。`)
  else if (delta < 0) messages.push(`${metric.sku} 最近完整周销售 ${latest.ordinarySalesConsumedQty} 件，较前一周减少 ${Math.abs(delta)} 件。`)
  else messages.push(`${metric.sku} 最近完整周销售 ${latest.ordinarySalesConsumedQty} 件，与前一周持平。`)

  if (latest.salesConsumptionRate !== null && previous.salesConsumptionRate !== null) {
    const rateDelta = latest.salesConsumptionRate - previous.salesConsumptionRate
    const previousRateText = `${(previous.salesConsumptionRate * 100).toFixed(1)}%`
    const latestRateText = `${(latest.salesConsumptionRate * 100).toFixed(1)}%`
    if (rateDelta === 0) {
      messages.push(`销售消耗率保持在 ${latestRateText}。`)
    } else {
      messages.push(`销售消耗率由 ${previousRateText} ${rateDelta > 0 ? '上升至' : '下降至'} ${latestRateText}。`)
    }
  } else if (latest.salesConsumptionRate === null && previous.salesConsumptionRate === null) {
    messages.push('最近两个完整周均缺少可计算的周初库存，暂无法比较销售消耗率。')
  } else if (latest.salesConsumptionRate === null) {
    messages.push('最近完整周缺少可计算的周初库存，暂无法与前一周比较销售消耗率。')
  } else if (previous.salesConsumptionRate === null) {
    messages.push('前一完整周缺少可计算的周初库存，暂无法与最近完整周比较销售消耗率。')
  } else if (metric.missingOpeningStockWeekCount > 0) {
    messages.push('部分历史周缺少周初库存，只能看销量，不能计算销售消耗率。')
  }

  if (metric.recent4WeekAverageSales !== null && metric.recent4WeekAverageSales > 0 && metric.estimatedWeeksOfSupply !== null) {
    messages.push(`按最近 4 个完整周平均销售速度，当前库存预计可售约 ${metric.estimatedWeeksOfSupply.toFixed(1)} 周。`)
  } else {
    messages.push('最近无稳定销售，暂无法估算可售周数。')
  }

  return messages
}

function buildMetric(params: {
  context: ProductInventoryContext
  ranges: ReturnType<typeof buildWeekRanges>
  includeCurrentWeek: boolean
  includeRecentWeeks: boolean
}) {
  const currentWeek = params.includeCurrentWeek && params.ranges.currentWeek
    ? buildWeekPoint({ range: params.ranges.currentWeek, context: params.context })
    : null
  const previousComparable = buildWeekPoint({
    range: params.ranges.previousComparable,
    context: params.context,
  })
  const recentCompleteWeeks = params.includeRecentWeeks
    ? params.ranges.completeWeekRanges.map((range) => buildWeekPoint({ range, context: params.context }))
    : []
  const latestCompleteWeek = recentCompleteWeeks[recentCompleteWeeks.length - 1] || null
  const previousCompleteWeek = recentCompleteWeeks[recentCompleteWeeks.length - 2] || null
  const currentAvailableStock = resolveCurrentAvailableStock(params.context)
  const recent4WeekAverageSales = params.includeRecentWeeks ? averageRecentSales(recentCompleteWeeks, 4) : null
  const estimatedWeeksOfSupply = recent4WeekAverageSales && recent4WeekAverageSales > 0
    ? currentAvailableStock / recent4WeekAverageSales
    : null
  const earliestValidOpeningStockWeek = recentCompleteWeeks.find((point) => point.openingStockStatus === 'ok')?.weekStart || null
  const missingOpeningStockWeekCount = recentCompleteWeeks.filter((point) => point.openingStockStatus !== 'ok').length

  const metric: WeeklyConsumptionSkuMetric = {
    sku: params.context.primarySku,
    productId: params.context.product.id,
    productName: params.context.product.name,
    currentAvailableStock,
    currentWeek,
    previousComparable,
    unitChange: currentWeek ? currentWeek.ordinarySalesConsumedQty - previousComparable.ordinarySalesConsumedQty : null,
    ratePointChange: currentWeek?.salesConsumptionRate !== null && currentWeek?.salesConsumptionRate !== undefined && previousComparable.salesConsumptionRate !== null
      ? currentWeek.salesConsumptionRate - previousComparable.salesConsumptionRate
      : null,
    latestCompleteWeek,
    previousCompleteWeek,
    recent4WeekAverageSales,
    estimatedWeeksOfSupply,
    trendSummary: [],
    earliestValidOpeningStockWeek,
    missingOpeningStockWeekCount,
    recentCompleteWeeks,
  }

  return {
    ...metric,
    trendSummary: params.includeRecentWeeks ? buildSkuTrendSummary(metric) : [],
  }
}

function buildRankings(metrics: WeeklyConsumptionSkuMetric[]) {
  return {
    byConsumedQty: [...metrics]
      .filter((metric) => (metric.currentWeek?.ordinarySalesConsumedQty || 0) > 0)
      .sort((a, b) => (b.currentWeek?.ordinarySalesConsumedQty || 0) - (a.currentWeek?.ordinarySalesConsumedQty || 0))
      .slice(0, 10),
    byConsumptionRate: [...metrics]
      .filter((metric) => (
        metric.currentWeek?.openingStock !== null
        && (metric.currentWeek?.openingStock || 0) >= MIN_OPENING_STOCK_FOR_RATE_RANKING
        && metric.currentWeek?.salesConsumptionRate !== null
      ))
      .sort((a, b) => (b.currentWeek?.salesConsumptionRate || 0) - (a.currentWeek?.salesConsumptionRate || 0))
      .slice(0, 10),
  }
}

function formatGrowthLabel(latestQty: number, previousQty: number) {
  const delta = latestQty - previousQty
  if (previousQty === 0 && latestQty > 0) return `由 0 增至 ${latestQty} 件`
  if (previousQty === 0) return '—'
  const rate = delta / previousQty
  return `${rate > 0 ? '+' : ''}${(rate * 100).toFixed(0)}%`
}

function toRankingItem(metric: WeeklyConsumptionSkuMetric): WeeklyConsumptionRankingItem | null {
  if (!metric.latestCompleteWeek) return null
  const latestQty = metric.latestCompleteWeek.ordinarySalesConsumedQty
  const previousQty = metric.previousCompleteWeek?.ordinarySalesConsumedQty || 0
  const deltaQty = latestQty - previousQty
  return {
    sku: metric.sku,
    productId: metric.productId,
    productName: metric.productName,
    currentAvailableStock: metric.currentAvailableStock,
    latestCompleteWeek: metric.latestCompleteWeek,
    previousCompleteWeek: metric.previousCompleteWeek,
    deltaQty,
    growthRate: previousQty > 0 ? deltaQty / previousQty : null,
    growthLabel: formatGrowthLabel(latestQty, previousQty),
    stockoutImpactLikely: (metric.currentAvailableStock || 0) <= 0 || metric.latestCompleteWeek.openingStockStatus === 'zero',
  }
}

function buildCompleteWeekRankings(metrics: WeeklyConsumptionSkuMetric[]) {
  const items = metrics
    .map(toRankingItem)
    .filter((item): item is WeeklyConsumptionRankingItem => item !== null)

  return {
    rankingByLatestCompleteWeekSales: [...items]
      .filter((item) => item.latestCompleteWeek.ordinarySalesConsumedQty > 0)
      .sort((a, b) => b.latestCompleteWeek.ordinarySalesConsumedQty - a.latestCompleteWeek.ordinarySalesConsumedQty)
      .slice(0, 10),
    rankingByGrowth: [...items]
      .filter((item) => Math.max(
        item.latestCompleteWeek.ordinarySalesConsumedQty,
        item.previousCompleteWeek?.ordinarySalesConsumedQty || 0,
      ) >= 2 && item.deltaQty > 0)
      .sort((a, b) => b.deltaQty - a.deltaQty)
      .slice(0, 10),
    rankingByDecline: [...items]
      .filter((item) => Math.max(
        item.latestCompleteWeek.ordinarySalesConsumedQty,
        item.previousCompleteWeek?.ordinarySalesConsumedQty || 0,
      ) >= 2 && item.deltaQty < 0)
      .sort((a, b) => a.deltaQty - b.deltaQty)
      .slice(0, 10),
  }
}

function resolveSelectedContext(contexts: ProductInventoryContext[], sku: string) {
  const selectedSkuKey = normalizeSkuForCompare(sku)
  if (!selectedSkuKey) return null
  return contexts.find((context) => context.candidateSkuKeys.has(selectedSkuKey)) || null
}

function resolveEarliestRequiredAnchorDate(contexts: ProductInventoryContext[], weekStart: Date) {
  return contexts.reduce<Date | null>((earliest, context) => {
    const anchorDate = resolveEarliestAnchorDateForContext(weekStart, context)
    if (!anchorDate) return earliest
    if (!earliest || anchorDate.getTime() < earliest.getTime()) return anchorDate
    return earliest
  }, null)
}

export async function getProductSalesWeeklyConsumptionData(options: {
  sku?: string
  limitWeeks?: number
  includeCurrentWeek?: boolean
  mode?: WeeklyConsumptionMode
} = {}): Promise<WeeklyConsumptionData> {
  const limitWeeks = Math.min(Math.max(Number(options.limitWeeks || 8), 1), MAX_LIMIT_WEEKS)
  const mode: WeeklyConsumptionMode = options.mode === 'detail' ? 'detail' : 'summary'
  const includeCurrentWeek = options.includeCurrentWeek !== false
  const ranges = buildWeekRanges(limitWeeks, includeCurrentWeek)
  const products = await loadProductsAndAliases()
  const selectedSkuKey = normalizeSkuForCompare(options.sku || '')
  const skuOptions = products.map((product) => {
    const sku = buildStrictInventorySkus(product)[0] || product.sku || product.name
    return { sku, label: `${sku}｜${product.name}` }
  })

  const [snapshots, baselines, adjustments] = await Promise.all([
    prisma.productInventorySnapshot.findMany({
      where: { date: { lt: ranges.orderEndExclusive } },
      select: {
        sku: true,
        date: true,
        availableQty: true,
        lockedQty: true,
        totalQty: true,
      },
    }),
    prisma.productStockBaseline.findMany({
      where: { baselineDate: { lte: ranges.orderEndExclusive } },
      select: {
        sku: true,
        baselineDate: true,
        quantity: true,
      },
    }),
    prisma.productStockAdjustment.findMany({
      where: { adjustmentDate: { lt: ranges.orderEndExclusive } },
      select: {
        sku: true,
        adjustmentDate: true,
        quantity: true,
        type: true,
      },
    }),
  ])

  const snapshotRows = snapshots.map((snapshot) => ({
    sku: snapshot.sku,
    date: snapshot.date,
    quantity: resolveSnapshotQty(snapshot),
    availableQty: snapshot.availableQty,
    lockedQty: snapshot.lockedQty,
    totalQty: snapshot.totalQty,
  }))
  const baselineRows = baselines.map((baseline) => ({
    sku: baseline.sku,
    date: baseline.baselineDate,
    quantity: baseline.quantity,
  }))
  const adjustmentRows = adjustments.map((adjustment) => ({
    sku: adjustment.sku,
    date: adjustment.adjustmentDate,
    quantity: adjustment.quantity,
    type: adjustment.type,
  }))

  const contextsWithoutOrders = buildProductContexts(products, {
    snapshots: snapshotRows,
    baselines: baselineRows,
    adjustments: adjustmentRows,
    orders: [],
  })
  const targetContextsWithoutOrders = mode === 'detail' && selectedSkuKey
    ? contextsWithoutOrders.filter((context) => context.candidateSkuKeys.has(selectedSkuKey))
    : contextsWithoutOrders
  const earliestAnchorDate = resolveEarliestRequiredAnchorDate(
    targetContextsWithoutOrders,
    ranges.earliestRequestedWeekStart,
  )
  const fallbackOrderStartExclusive = addDays(ranges.earliestRequestedWeekStart, -1)
  const orderStartExclusive = earliestAnchorDate || fallbackOrderStartExclusive

  const orderItems = await prisma.productOrderItem.findMany({
    where: {
      productMatched: true,
      stockConsumedQty: { gt: 0 },
      paidDate: {
        gt: orderStartExclusive,
        lt: ranges.orderEndExclusive,
      },
    },
    select: {
      sellerSku: true,
      paidDate: true,
      stockConsumedQty: true,
      isSample: true,
    },
  })

  const contexts = buildProductContexts(products, {
    snapshots: snapshotRows,
    baselines: baselineRows,
    adjustments: adjustmentRows,
    orders: orderItems.map((item) => ({
      sellerSku: normalizeCell(item.sellerSku),
      paidDate: item.paidDate,
      stockConsumedQty: item.stockConsumedQty,
      isSample: item.isSample,
    })),
  })
  const targetContexts = mode === 'detail' && selectedSkuKey
    ? contexts.filter((context) => context.candidateSkuKeys.has(selectedSkuKey))
    : []

  const summaryMetrics = includeCurrentWeek
    ? contexts.map((context) => buildMetric({
        context,
        ranges,
        includeCurrentWeek,
        includeRecentWeeks: false,
      }))
    : []
  const completeWeekMetrics = mode === 'summary'
    ? contexts.map((context) => buildMetric({
        context,
        ranges,
        includeCurrentWeek: false,
        includeRecentWeeks: true,
      }))
    : []
  const storeCompleteWeekTrend = mode === 'summary'
    ? buildStoreCompleteWeekTrend(contexts, ranges.completeWeekRanges)
    : []
  const completeWeekRankings = mode === 'summary'
    ? buildCompleteWeekRankings(completeWeekMetrics)
    : {
        rankingByLatestCompleteWeekSales: [],
        rankingByGrowth: [],
        rankingByDecline: [],
      }
  const selectedContext = selectedSkuKey ? resolveSelectedContext(contexts, options.sku || '') : null
  const selectedSkuMetric = mode === 'detail' && selectedContext
    ? buildMetric({
        context: selectedContext,
        ranges,
        includeCurrentWeek,
        includeRecentWeeks: true,
      })
    : null

  return {
    generatedAt: new Date().toISOString(),
    mode,
    limitWeeks,
    includeCurrentWeek,
    currentWeekRange: ranges.currentWeek
      ? {
          startDate: formatDateKey(ranges.currentWeek.startDate),
          endDate: formatDateKey(ranges.currentWeek.endDate),
          endExclusive: formatDateKey(ranges.currentWeek.endExclusive),
        }
      : null,
    previousComparableRange: {
      startDate: formatDateKey(ranges.previousComparable.startDate),
      endDate: formatDateKey(ranges.previousComparable.endDate),
      endExclusive: formatDateKey(ranges.previousComparable.endExclusive),
    },
    summary: mode === 'summary' ? buildWeightedSummary(summaryMetrics) : null,
    previousCompleteWeek: storeCompleteWeekTrend[storeCompleteWeekTrend.length - 1] || null,
    weekBeforePrevious: storeCompleteWeekTrend[storeCompleteWeekTrend.length - 2] || null,
    storeCompleteWeekTrend,
    storeTrendSummary: mode === 'summary' ? buildStoreTrendSummary(storeCompleteWeekTrend) : [],
    skuOptions,
    skuMetrics: mode === 'detail' && selectedSkuMetric ? [selectedSkuMetric] : [],
    selectedSkuMetric,
    rankings: mode === 'summary' ? buildRankings(summaryMetrics) : { byConsumedQty: [], byConsumptionRate: [] },
    ...completeWeekRankings,
    queryWindow: {
      earliestRequestedWeekStart: formatDateKey(ranges.earliestRequestedWeekStart),
      earliestRequiredAnchorDate: earliestAnchorDate ? formatDateKey(earliestAnchorDate) : null,
      orderStartExclusive: orderStartExclusive ? formatDateKey(orderStartExclusive) : null,
      orderEndExclusive: formatDateKey(ranges.orderEndExclusive),
    },
    notes: [
      '本周口径为周一至当前日期；上周同期按相同星期范围对比。',
      '销售消耗分子只统计 productMatched=true、isSample=false、stockConsumedQty>0 的 ProductOrderItem。',
      '样品不计入销售消耗分子，但会作为真实库存消耗参与周初库存余额重建。',
      '库存重建的库存侧 SKU 只使用 canonical SKU、产品自身主 SKU 与 ProductSkuAlias 显式 alias，不使用宽泛 typo 自动变体。',
    ],
  }
}
