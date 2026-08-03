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

export type WeeklyConsumptionSkuMetric = {
  sku: string
  productId: string
  productName: string
  currentWeek: WeeklyConsumptionTrendPoint | null
  previousComparable: WeeklyConsumptionTrendPoint | null
  unitChange: number | null
  ratePointChange: number | null
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
  skuOptions: Array<{ sku: string; label: string }>
  skuMetrics: WeeklyConsumptionSkuMetric[]
  selectedSkuMetric: WeeklyConsumptionSkuMetric | null
  rankings: {
    byConsumedQty: WeeklyConsumptionSkuMetric[]
    byConsumptionRate: WeeklyConsumptionSkuMetric[]
  }
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

  return {
    sku: params.context.primarySku,
    productId: params.context.product.id,
    productName: params.context.product.name,
    currentWeek,
    previousComparable,
    unitChange: currentWeek ? currentWeek.ordinarySalesConsumedQty - previousComparable.ordinarySalesConsumedQty : null,
    ratePointChange: currentWeek?.salesConsumptionRate !== null && currentWeek?.salesConsumptionRate !== undefined && previousComparable.salesConsumptionRate !== null
      ? currentWeek.salesConsumptionRate - previousComparable.salesConsumptionRate
      : null,
    recentCompleteWeeks,
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
    skuOptions,
    skuMetrics: mode === 'detail'
      ? targetContexts.map((context) => buildMetric({
          context,
          ranges,
          includeCurrentWeek,
          includeRecentWeeks: true,
        }))
      : [],
    selectedSkuMetric,
    rankings: mode === 'summary' ? buildRankings(summaryMetrics) : { byConsumedQty: [], byConsumptionRate: [] },
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
