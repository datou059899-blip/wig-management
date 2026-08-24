'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageGuard } from '@/components/PageGuard'

interface SummaryData {
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

type PlatformStockSource =
  | 'snapshot_total'
  | 'snapshot_available_locked'
  | 'product_stock_fallback'
  | 'none'

interface ProductData {
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

interface ReconcilePreviewItem {
  sku: string
  productId: string
  productName: string
  baselineQty: number
  adjustmentTotal: number
  cumulativeStockConsumedQty: number
  estimatedStock: number
  platformStock: number
  availableQty: number | null
  lockedQty: number | null
  totalQty: number | null
  inventoryDiff: number
  adjustmentQty: number
  latestSnapshotDate: string | null
  platformStockSource: PlatformStockSource
  eligible: boolean
  reason: string | null
}

interface ReconcilePreviewData {
  generatedAt: string
  threshold: number
  summary: {
    candidateCount: number
    skippedNoBaseline: number
    skippedNoSnapshot: number
    skippedDiffTooSmall: number
    skippedBySkuFilter?: number
  }
  items: ReconcilePreviewItem[]
}

interface ProductStockBaseline {
  id: string
  sku: string
  quantity: number
  baselineDate: string
  note: string
  createdAt: string
  updatedAt: string
}

interface ProductStockAdjustment {
  id: string
  sku: string
  quantity: number
  adjustmentDate: string
  type: string
  note: string
  createdAt: string
  updatedAt: string
}

interface ProductSalesRankSetting {
  id: string
  aDailySalesThreshold: number
  bDailySalesThreshold: number
  cStockRatioThreshold: number
  cOrderRatioThreshold: number
  dActiveDaysThreshold: number
  windowDays: number
  createdAt: string
  updatedAt: string
}

interface BulkItemFailure {
  lineNumber: number
  sku: string
  quantity?: number | null
  date?: string
  rawLine?: string
  reason: string
}

interface BulkDuplicateRow {
  rawLine: string
  normalizedSku: string
  date: string
  action: string
}

interface BulkWarningRow {
  rawLine: string
  originalSku: string
  normalizedSku: string
  reason: string
}

interface BulkSaveSummary {
  successCount: number
  createdCount?: number
  updatedCount?: number
  failureCount: number
  rawRowCount?: number
  parsedCount?: number
  duplicateInInputCount?: number
  mergedCount?: number
  autoCorrectedCount?: number
  suspiciousCount?: number
  unmatchedSkuCount?: number
  usedItemDateCount?: number
  usedDefaultDateCount?: number
  duplicateRows?: BulkDuplicateRow[]
  warningRows?: BulkWarningRow[]
  failures: BulkItemFailure[]
}

interface ImportFailure {
  row: number
  sku: string
  reason: string
}

interface ImportResult {
  successCount: number
  updatedExistingCount?: number
  autoFilledSkuCount?: number
  autoCreatedCount?: number
  reviewCount?: number
  failureCount: number
  failures: ImportFailure[]
  hint?: string | null
}

interface OrderImportFailure {
  row: number
  sku: string
  paidTime: string
  quantity: number
  returnQty: number
  reason: string
}

interface OrderImportSummaryByDate {
  date: string
  grossOrders: number
  returnQty: number
  netOrders: number
  canceledQty: number
  stockConsumedQty: number
  refundAmount: number
}

interface OrderImportSummaryBySku {
  sku: string
  grossOrders: number
  returnQty: number
  netOrders: number
  canceledQty: number
  stockConsumedQty: number
  refundAmount: number
}

interface OrderImportSampleBySku {
  sku: string
  sampleQty: number
  sampleRows: number
  originalSellerSkus?: string[]
}

interface OrderImportSampleByRecipient {
  buyerUsername: string
  buyerNickname: string
  recipient: string
  sampleQty: number
  sampleRows: number
  skus: string[]
}

interface OrderImportSampleByRecipientAndSku {
  buyerUsername: string
  buyerNickname: string
  recipient: string
  sku: string
  sampleQty: number
  sampleRows: number
}

interface OrderImportResult {
  mode?: 'import' | 'dryRun' | 'checkOnly'
  stage?: string
  fileName?: string
  fileSize?: number
  totalOrderRows: number
  parsedRows?: number
  validRows?: number
  orderItemCount?: number
  dedupeKeyCount?: number
  duplicateInFileCount?: number
  uniqueSkuCount?: number
  matchedSkuCount?: number
  missingSkuCount?: number
  missingSkuRows?: number
  skippedCount?: number
  missingSkus?: string[]
  insertedOrderItemCount?: number
  updatedOrderItemCount?: number
  aggregatedRecordCount?: number
  successCount: number
  failedCount: number
  skippedRows?: OrderImportFailure[]
  failedRows: OrderImportFailure[]
  summaryByDate: OrderImportSummaryByDate[]
  summaryBySku: OrderImportSummaryBySku[]
  totalGrossOrders: number
  totalReturnQty: number
  totalNetOrders: number
  totalCanceledQty: number
  totalStockConsumedQty: number
  totalRefundAmount: number
  sampleRows?: number
  sampleQty?: number
  sampleSkuCount?: number
  sampleRecipientCount?: number
  sampleBySku?: OrderImportSampleBySku[]
  sampleByRecipient?: OrderImportSampleByRecipient[]
  sampleByRecipientAndSku?: OrderImportSampleByRecipientAndSku[]
  staleRecordCount?: number
  writeErrors?: Array<{ sku: string; dateStr: string; reason: string }>
  hint?: string | null
}

interface SkuImportIssueRow {
  row: number
  sku: string
  productName?: string
  reason: string
}

interface SkuImportResult {
  mode?: 'dryRun' | 'import'
  stage?: string
  fileName?: string
  totalRows: number
  extractedSkuCount: number
  uniqueSkuCount: number
  existingSkuCount: number
  existingAliasSkuCount?: number
  aliasMatchedSkuCount?: number
  productSkuParenthesisAliasSkuCount?: number
  productNameParenthesisAliasSkuCount?: number
  newSkuCount: number
  fillableSkuCount?: number
  duplicateInFileCount: number
  suspiciousCount: number
  createdCount?: number
  filledCount?: number
  aliasCreatedCount?: number
  existingSkus: string[]
  existingAliasSkus?: string[]
  aliasMatchedSkus?: string[]
  productSkuParenthesisAliasSkus?: string[]
  productNameParenthesisAliasSkus?: string[]
  newSkus: string[]
  fillableSkus?: string[]
  suspiciousRows: SkuImportIssueRow[]
  skippedRows: SkuImportIssueRow[]
  failedRows: SkuImportIssueRow[]
}

async function parseApiResponse(response: Response) {
  const text = await response.text()

  if (!text) {
    return { data: null, text: '' }
  }

  try {
    return { data: JSON.parse(text), text }
  } catch {
    return { data: null, text }
  }
}

function buildImportErrorMessage(
  fallbackTitle: string,
  response: Response,
  data: any,
  text: string,
) {
  const detail = typeof data?.detail === 'string' && data.detail.trim()
    ? data.detail.trim()
    : ''
  const error = typeof data?.error === 'string' && data.error.trim()
    ? data.error.trim()
    : ''
  const plainText = text.trim()

  if (error || detail) {
    return `${error || fallbackTitle}${detail ? `：${detail}` : ''}`
  }

  if (plainText) {
    return `${fallbackTitle}：HTTP ${response.status} ${plainText}`
  }

  return `${fallbackTitle}：HTTP ${response.status}`
}

function formatOrderImportTitle(mode?: 'import' | 'dryRun' | 'checkOnly') {
  if (mode === 'dryRun') return '订单解析测试完成'
  if (mode === 'checkOnly') return '订单 SKU 匹配检测完成'
  return '订单导入完成'
}

function formatSkuImportTitle(mode?: 'dryRun' | 'import') {
  return mode === 'import' ? '产品 SKU 导入完成' : '产品 SKU 预检查完成'
}

function hasSampleStats(result: OrderImportResult | null) {
  if (!result) return false
  return (
    typeof result.sampleRows === 'number'
    || typeof result.sampleQty === 'number'
    || typeof result.sampleSkuCount === 'number'
    || typeof result.sampleRecipientCount === 'number'
    || Array.isArray(result.sampleBySku)
    || Array.isArray(result.sampleByRecipient)
    || Array.isArray(result.sampleByRecipientAndSku)
  )
}

function formatTrendRangeLabel(range: TrendRange, startDate?: string, endDate?: string) {
  if (range === 'today') return '今日'
  if (range === '7') return '最近7天'
  if (range === '30') return '最近30天'
  if (range === 'custom') {
    if (startDate && endDate) {
      return `${startDate} ~ ${endDate}`
    }
    return '自定义时间'
  }
  return '最近7天'
}

interface TrendPoint {
  date: string
  label: string
  orders: number
  stock: number
}

interface TrendSummary {
  grossOrders: number
  returnQty: number
  netOrders: number
  canceledQty: number
  refundAmount: number
}

interface SampleStatsRecipient {
  buyerUsername: string
  buyerNickname: string
  recipient: string
  sampleQty: number
  sampleRows: number
  skus: string[]
}

interface SampleStatsRecipientSku {
  buyerUsername: string
  buyerNickname: string
  recipient: string
  sku: string
  sampleQty: number
  sampleRows: number
}

interface SampleStatsData {
  range: TrendRange
  startDate: string
  endDate: string
  sku: string
  sampleRows: number
  totalSampleQty: number
  sampleSkuCount: number
  sampleRecipientCount: number
  sampleBySku: OrderImportSampleBySku[]
  sampleByRecipient: SampleStatsRecipient[]
  sampleByRecipientAndSku: SampleStatsRecipientSku[]
}

interface SkuOption {
  sku: string
  label: string
}

interface WeeklyConsumptionTrendPoint {
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

interface WeeklyConsumptionStoreTrendPoint {
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

interface WeeklyConsumptionRankingItem {
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

interface WeeklyConsumptionSkuMetric {
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

interface WeeklyConsumptionData {
  generatedAt: string
  mode: 'summary' | 'detail'
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
  summary: {
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
  } | null
  previousCompleteWeek: WeeklyConsumptionStoreTrendPoint | null
  weekBeforePrevious: WeeklyConsumptionStoreTrendPoint | null
  storeCompleteWeekTrend: WeeklyConsumptionStoreTrendPoint[]
  storeTrendSummary: string[]
  skuOptions: SkuOption[]
  skuMetrics: WeeklyConsumptionSkuMetric[]
  selectedSkuMetric: WeeklyConsumptionSkuMetric | null
  rankings: {
    byConsumedQty: WeeklyConsumptionSkuMetric[]
    byConsumptionRate: WeeklyConsumptionSkuMetric[]
  }
  rankingByLatestCompleteWeekSales: WeeklyConsumptionRankingItem[]
  rankingByGrowth: WeeklyConsumptionRankingItem[]
  rankingByDecline: WeeklyConsumptionRankingItem[]
  notes: string[]
}

type StoreWeeklyChartPoint = WeeklyConsumptionStoreTrendPoint & {
  ratePercent: number | null
}

type SkuWeeklyChartPoint = WeeklyConsumptionTrendPoint & {
  ratePercent: number | null
}

type WeeklyTooltipPayload<T> = ReadonlyArray<{
  payload?: T
}>

interface ProductSalesGroup {
  id: string
  name: string
  skus: string[]
}

type StockEditMode = 'set' | 'increase' | 'decrease'
type TrendRange = 'today' | '7' | '30' | 'custom'

const ADJUSTMENT_TYPE_OPTIONS = [
  { value: 'replenish', label: '补货' },
  { value: 'manual_adjust', label: '手动调整' },
  { value: 'damage', label: '损耗' },
  { value: 'other', label: '其他' },
]

function normalizeDateInput(value: string) {
  return value.trim().replace(/\//g, '-')
}

function normalizeFlexibleDateToken(value: string) {
  const normalized = normalizeDateInput(value)
  const matched = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!matched) return null

  const [, yearText, monthText, dayText] = matched
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const date = new Date(year, month - 1, day, 0, 0, 0, 0)
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null
  }

  return `${yearText}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function normalizeBulkStockSku(rawSku: string) {
  const trimmed = rawSku.trim().replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, ' ')
  const parenthesisMatched = trimmed.match(/^(.+?)\s*\(\s*([^()]+?)\s*\)$/)

  if (!parenthesisMatched) {
    return {
      originalSku: rawSku.trim(),
      normalizedInputSku: trimmed,
      mainSku: trimmed,
      aliasSku: '',
      saveSku: trimmed,
    }
  }

  const mainSku = parenthesisMatched[1].trim().replace(/\s+/g, ' ')
  const aliasSku = parenthesisMatched[2].trim().replace(/\s+/g, ' ')

  return {
    originalSku: rawSku.trim(),
    normalizedInputSku: `${mainSku} (${aliasSku})`,
    mainSku,
    aliasSku,
    saveSku: mainSku,
  }
}

function extractBulkAliasSkusFromText(value: string | null | undefined) {
  const aliases = new Set<string>()
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return []

  const pattern = /[（(]\s*([^()（）]+?)\s*[)）]/g
  let match = pattern.exec(text)
  while (match) {
    const alias = match[1]?.trim()
    if (alias) {
      aliases.add(alias)
    }
    match = pattern.exec(text)
  }

  return Array.from(aliases)
}

type BulkParsedItem = {
  sku: string
  quantity: number
  date?: string
  lineNumber: number
  rawLine: string
}

type BulkPreprocessContext = {
  mainSkuSet: Set<string>
  allKnownSkuSet: Set<string>
  resolvedSkuByKey: Map<string, string>
}

function normalizeBulkSkuCompareKey(value: string) {
  return value.trim().replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, '').toUpperCase()
}

function buildBulkSkuMatchKeys(value: string | null | undefined) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return []

  const normalized = normalizeBulkStockSku(text)
  const candidates = [
    text,
    normalized.normalizedInputSku,
    normalized.mainSku,
    normalized.aliasSku,
    ...extractBulkAliasSkusFromText(text),
  ]

  return Array.from(new Set(candidates.map((item) => item.trim()).filter(Boolean)))
}

function preprocessBulkStockItems(
  parsedItems: BulkParsedItem[],
  mode: 'baseline' | 'adjustment',
  context: BulkPreprocessContext,
  adjustmentType?: string,
) {
  const failures: BulkItemFailure[] = []
  const warningRows: BulkWarningRow[] = []
  const aliasBuckets = new Map<string, Array<BulkParsedItem & ReturnType<typeof normalizeBulkStockSku> & { normalizedDate: string }>>()
  const normalizedItems = parsedItems.map((item) => {
    const normalizedSku = normalizeBulkStockSku(item.sku)
    const normalizedDate = item.date || ''
    const combined = {
      ...item,
      ...normalizedSku,
      normalizedDate,
    }

    if (normalizedSku.aliasSku) {
      const aliasKey = normalizedSku.aliasSku.replace(/\s+/g, '').toUpperCase()
      const bucket = aliasBuckets.get(aliasKey) || []
      bucket.push(combined)
      aliasBuckets.set(aliasKey, bucket)
    }

    return combined
  })

  aliasBuckets.forEach((bucket, aliasKey) => {
    const uniqueMainSkus = Array.from(new Set(bucket.map((item) => item.mainSku)))
    if (uniqueMainSkus.length <= 1) return

    const existingMainSkus = uniqueMainSkus.filter((mainSku) => context.mainSkuSet.has(mainSku.toUpperCase()))
    if (existingMainSkus.length === 1) {
      const preferredMainSku = existingMainSkus[0]
      bucket.forEach((item) => {
        if (item.mainSku === preferredMainSku) return
        item.saveSku = preferredMainSku
        const correctedMainSku = item.mainSku.replace(/^SHM-/i, 'SMH-')
        warningRows.push({
          rawLine: item.rawLine,
          originalSku: item.originalSku,
          normalizedSku: preferredMainSku,
          reason: /^SHM-/i.test(item.mainSku) && correctedMainSku === preferredMainSku
            ? `${item.mainSku} 已按疑似拼写错误修正为 ${preferredMainSku}。`
            : `同一别称 ${item.aliasSku} 已存在主 SKU ${preferredMainSku}，已自动归并`,
        })
      })
      return
    }

    bucket.forEach((item) => {
      failures.push({
        lineNumber: item.lineNumber,
        sku: item.originalSku,
        quantity: item.quantity,
        date: item.normalizedDate,
        rawLine: item.rawLine,
        reason: `别称 ${item.aliasSku} 对应多个主 SKU（${uniqueMainSkus.join(' / ')}），无法自动确定`,
      })
    })
  })

  const duplicateRows: BulkDuplicateRow[] = []
  const dedupedItems = new Map<string, BulkParsedItem & ReturnType<typeof normalizeBulkStockSku> & { normalizedDate: string }>()
  const invalidLineNumbers = new Set(failures.map((item) => item.lineNumber))
  let autoCorrectedCount = 0

  normalizedItems.forEach((item) => {
    if (invalidLineNumbers.has(item.lineNumber)) return

    if (item.mainSku.toUpperCase().startsWith('SHM-')) {
      const correctedMainSku = item.mainSku.replace(/^SHM-/i, 'SMH-')
      if (context.mainSkuSet.has(correctedMainSku.toUpperCase())) {
        item.saveSku = correctedMainSku
        warningRows.push({
          rawLine: item.rawLine,
          originalSku: item.originalSku,
          normalizedSku: correctedMainSku,
          reason: `${item.mainSku} 已按疑似拼写错误修正为 ${correctedMainSku}。`,
        })
        autoCorrectedCount += 1
      }
    }

    if (item.aliasSku && /^C/i.test(item.aliasSku) && !/^LC/i.test(item.aliasSku)) {
      const lcAlias = `L${item.aliasSku}`
      if (context.allKnownSkuSet.has(lcAlias.toUpperCase())) {
        warningRows.push({
          rawLine: item.rawLine,
          originalSku: item.originalSku,
          normalizedSku: `${item.saveSku}${item.aliasSku ? ` (${lcAlias})` : ''}`,
          reason: `${item.aliasSku} 疑似 ${lcAlias}`,
        })
      }
    }

    const candidateKeys = [
      normalizeBulkSkuCompareKey(item.mainSku),
      item.aliasSku ? normalizeBulkSkuCompareKey(item.aliasSku) : '',
      normalizeBulkSkuCompareKey(item.originalSku),
      normalizeBulkSkuCompareKey(item.normalizedInputSku),
    ].filter(Boolean)

    const resolvedMatchedSku = candidateKeys
      .map((key) => context.resolvedSkuByKey.get(key))
      .find((value): value is string => Boolean(value))

    if (resolvedMatchedSku) {
      item.saveSku = resolvedMatchedSku
      if (
        item.aliasSku
        && !/^SHM-/i.test(item.mainSku)
        && normalizeBulkSkuCompareKey(item.originalSku) !== normalizeBulkSkuCompareKey(item.saveSku)
      ) {
        warningRows.push({
          rawLine: item.rawLine,
          originalSku: item.originalSku,
          normalizedSku: item.saveSku,
          reason: `${item.originalSku} 已按主 SKU ${item.saveSku} 保存。`,
        })
      }
    }

    const normalizedSaveSkuKey = normalizeBulkSkuCompareKey(item.saveSku)
    const isKnownMainSku = context.mainSkuSet.has(normalizedSaveSkuKey)
    const isKnownAnySku = context.allKnownSkuSet.has(normalizedSaveSkuKey)

    if (!isKnownMainSku && !isKnownAnySku) {
      failures.push({
        lineNumber: item.lineNumber,
        sku: item.saveSku,
        quantity: item.quantity,
        date: item.normalizedDate,
        rawLine: item.rawLine,
        reason: '标准化 SKU 未匹配到现有产品或别称，未保存',
      })
      invalidLineNumbers.add(item.lineNumber)
      return
    }

    const duplicateKey = mode === 'adjustment'
      ? `${normalizedSaveSkuKey}::${item.normalizedDate}::${item.quantity}::${adjustmentType || ''}`
      : `${normalizedSaveSkuKey}::${item.normalizedDate}`

    if (dedupedItems.has(duplicateKey)) {
      duplicateRows.push({
        rawLine: item.rawLine,
        normalizedSku: item.saveSku,
        date: item.normalizedDate,
        action: '保留最后一条',
      })
    }
    dedupedItems.set(duplicateKey, item)
  })

  return {
    items: Array.from(dedupedItems.values()).map((item) => ({
      sku: item.saveSku,
      quantity: item.quantity,
      date: item.normalizedDate,
      lineNumber: item.lineNumber,
      rawLine: item.rawLine,
    })),
    duplicateRows,
    warningRows,
    failures,
    rawRowCount: parsedItems.length + failures.filter((item) => item.rawLine).length,
    parsedCount: parsedItems.length,
    duplicateInInputCount: duplicateRows.length,
    mergedCount: duplicateRows.length,
    autoCorrectedCount,
    suspiciousCount: failures.length,
  }
}

function parseBulkSkuQuantityText(text: string, context?: BulkPreprocessContext, mode: 'baseline' | 'adjustment' = 'baseline', adjustmentType?: string) {
  const items: Array<{ sku: string; quantity: number; date?: string; lineNumber: number; rawLine: string }> = []
  const failures: BulkItemFailure[] = []
  let rawRowCount = 0

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1
    const line = rawLine.trim()
    if (!line) return
    rawRowCount += 1

    let sku = ''
    let quantityText = ''
    let dateText = ''

    if (line.includes('\t')) {
      const parts = line.split('\t').map((part) => part.trim()).filter(Boolean)
      if (parts.length < 2) {
        failures.push({
          lineNumber,
          sku: parts[0] || '',
          rawLine: rawLine.trim(),
          reason: '缺少数量',
        })
        return
      }
      if (parts.length > 3) {
        failures.push({
          lineNumber,
          sku: '',
          rawLine: rawLine.trim(),
          reason: 'Tab 格式不正确，请使用“SKU + 数量 + 可选日期”',
        })
        return
      }
      ;[sku, quantityText] = parts
      dateText = parts[2] || ''
    } else if (line.includes(',')) {
      const parts = line.split(',').map((part) => part.trim()).filter(Boolean)
      if (parts.length < 2) {
        failures.push({
          lineNumber,
          sku: parts[0] || '',
          rawLine: rawLine.trim(),
          reason: '缺少数量',
        })
        return
      }
      if (parts.length > 3) {
        failures.push({
          lineNumber,
          sku: '',
          rawLine: rawLine.trim(),
          reason: '逗号格式不正确，请使用“SKU,数量,可选日期”',
        })
        return
      }
      ;[sku, quantityText] = parts
      dateText = parts[2] || ''
    } else {
      const parts = line.split(/\s+/).filter(Boolean)
      if (parts.length < 2) {
        failures.push({
          lineNumber,
          sku: parts[0] || '',
          rawLine: rawLine.trim(),
          reason: '缺少数量',
        })
        return
      }

      const lastTokenAsDate = normalizeFlexibleDateToken(parts[parts.length - 1])
      if (lastTokenAsDate) {
        if (parts.length < 3) {
          failures.push({
            lineNumber,
            sku: '',
            date: lastTokenAsDate,
            rawLine: rawLine.trim(),
            reason: '缺少数量，无法解析批量数据',
          })
          return
        }
        dateText = parts[parts.length - 1]
        quantityText = parts[parts.length - 2]
        sku = parts.slice(0, -2).join(' ').trim()
      } else {
        quantityText = parts[parts.length - 1]
        sku = parts.slice(0, -1).join(' ').trim()
      }
    }

    const quantity = Number(quantityText)
    const normalizedDateText = dateText ? normalizeFlexibleDateToken(dateText) : ''

    if (!sku) {
      failures.push({
        lineNumber,
        sku: '',
        quantity: Number.isFinite(quantity) ? quantity : null,
        date: normalizedDateText || normalizeDateInput(dateText),
        rawLine: rawLine.trim(),
        reason: 'SKU 不能为空',
      })
      return
    }

    if (!Number.isInteger(quantity)) {
      failures.push({
        lineNumber,
        sku,
        quantity: null,
        date: normalizedDateText || normalizeDateInput(dateText),
        rawLine: rawLine.trim(),
        reason: '数量必须是整数',
      })
      return
    }

    if (dateText && !normalizedDateText) {
      failures.push({
        lineNumber,
        sku,
        quantity,
        date: normalizeDateInput(dateText),
        rawLine: rawLine.trim(),
        reason: '日期格式无效，请使用 YYYY-MM-DD 或 YYYY/MM/DD',
      })
      return
    }

    items.push({
      sku,
      quantity,
      date: normalizedDateText || undefined,
      lineNumber,
      rawLine: rawLine.trim(),
    })
  })

  if (!context) {
    return { items, failures, rawRowCount }
  }

  const preprocessed = preprocessBulkStockItems(items, mode, context, adjustmentType)
  return {
    items: preprocessed.items,
    failures: [...failures, ...preprocessed.failures],
    rawRowCount,
    duplicateRows: preprocessed.duplicateRows,
    warningRows: preprocessed.warningRows,
    duplicateInInputCount: preprocessed.duplicateInInputCount,
    mergedCount: preprocessed.mergedCount,
    autoCorrectedCount: preprocessed.autoCorrectedCount,
    suspiciousCount: preprocessed.suspiciousCount,
    parsedCount: preprocessed.parsedCount,
  }
}

function getTodayInputValue() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function ProductSalesPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const inventoryInputRef = useRef<HTMLInputElement>(null)
  const ordersInputRef = useRef<HTMLInputElement>(null)
  const skuImportInputRef = useRef<HTMLInputElement>(null)
  const orderImportModeRef = useRef<'import' | 'dryRun' | 'checkOnly'>('import')

  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [products, setProducts] = useState<ProductData[]>([])
  const [skuOptions, setSkuOptions] = useState<SkuOption[]>([])
  const [groups, setGroups] = useState<ProductSalesGroup[]>([])
  const [selectedSku, setSelectedSku] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [trendRange, setTrendRange] = useState<TrendRange>('7')
  const [trendStartDate, setTrendStartDate] = useState('')
  const [trendEndDate, setTrendEndDate] = useState('')
  const [customStartDate, setCustomStartDate] = useState(getTodayInputValue())
  const [customEndDate, setCustomEndDate] = useState(getTodayInputValue())
  const [trendTitle, setTrendTitle] = useState('销售库存趋势 - 全部 SKU')
  const [trends, setTrends] = useState<TrendPoint[]>([])
  const [trendSummary, setTrendSummary] = useState<TrendSummary>({
    grossOrders: 0,
    returnQty: 0,
    netOrders: 0,
    canceledQty: 0,
    refundAmount: 0,
  })
  const [sampleStatsRange, setSampleStatsRange] = useState<TrendRange>('7')
  const [sampleStatsStartDate, setSampleStatsStartDate] = useState('')
  const [sampleStatsEndDate, setSampleStatsEndDate] = useState('')
  const [sampleStatsCustomStartDate, setSampleStatsCustomStartDate] = useState(getTodayInputValue())
  const [sampleStatsCustomEndDate, setSampleStatsCustomEndDate] = useState(getTodayInputValue())
  const [sampleStatsSku, setSampleStatsSku] = useState('')
  const [sampleStats, setSampleStats] = useState<SampleStatsData | null>(null)
  const [sampleStatsExpanded, setSampleStatsExpanded] = useState(false)
  const [weeklyConsumption, setWeeklyConsumption] = useState<WeeklyConsumptionData | null>(null)
  const [weeklySelectedMetric, setWeeklySelectedMetric] = useState<WeeklyConsumptionSkuMetric | null>(null)
  const [weeklyConsumptionExpanded, setWeeklyConsumptionExpanded] = useState(false)
  const [weeklyConsumptionLoading, setWeeklyConsumptionLoading] = useState(false)
  const [weeklyConsumptionError, setWeeklyConsumptionError] = useState<string | null>(null)
  const [weeklyConsumptionSku, setWeeklyConsumptionSku] = useState('')
  const [weeklyRankingTab, setWeeklyRankingTab] = useState<'sales' | 'growth' | 'decline'>('sales')
  const [weeklyMethodOpen, setWeeklyMethodOpen] = useState(false)
  const [weeklyDetailOpen, setWeeklyDetailOpen] = useState(false)

  const [loading, setLoading] = useState(true)
  const [trendLoading, setTrendLoading] = useState(false)
  const [sampleStatsLoading, setSampleStatsLoading] = useState(false)
  const [tableRangeLoading, setTableRangeLoading] = useState(false)
  const [importingInventory, setImportingInventory] = useState(false)
  const [importingOrders, setImportingOrders] = useState(false)
  const [checkingSkuImport, setCheckingSkuImport] = useState(false)
  const [importingSkus, setImportingSkus] = useState(false)
  const [editingStockSku, setEditingStockSku] = useState<string | null>(null)
  const [deletingStockSku, setDeletingStockSku] = useState<string | null>(null)
  const [stockEditTarget, setStockEditTarget] = useState<ProductData | null>(null)
  const [stockEditMode, setStockEditMode] = useState<StockEditMode>('set')
  const [stockEditValue, setStockEditValue] = useState('')
  const [stockEditError, setStockEditError] = useState<string | null>(null)
  const [stockBaselineOpen, setStockBaselineOpen] = useState(false)
  const [stockBaselines, setStockBaselines] = useState<ProductStockBaseline[]>([])
  const [baselineFormMode, setBaselineFormMode] = useState<'single' | 'bulk'>('single')
  const [baselineFormSku, setBaselineFormSku] = useState('')
  const [baselineFormQuantity, setBaselineFormQuantity] = useState('')
  const [baselineBulkText, setBaselineBulkText] = useState('')
  const [baselineFormDate, setBaselineFormDate] = useState(getTodayInputValue())
  const [baselineFormNote, setBaselineFormNote] = useState('')
  const [baselineError, setBaselineError] = useState<string | null>(null)
  const [baselineSaveSummary, setBaselineSaveSummary] = useState<BulkSaveSummary | null>(null)
  const [savingBaseline, setSavingBaseline] = useState(false)
  const [stockAdjustmentOpen, setStockAdjustmentOpen] = useState(false)
  const [stockAdjustments, setStockAdjustments] = useState<ProductStockAdjustment[]>([])
  const [adjustmentFormMode, setAdjustmentFormMode] = useState<'single' | 'bulk'>('single')
  const [adjustmentFormSku, setAdjustmentFormSku] = useState('')
  const [adjustmentFormQuantity, setAdjustmentFormQuantity] = useState('')
  const [adjustmentBulkText, setAdjustmentBulkText] = useState('')
  const [adjustmentFormDate, setAdjustmentFormDate] = useState(getTodayInputValue())
  const [adjustmentFormType, setAdjustmentFormType] = useState('replenish')
  const [adjustmentFormNote, setAdjustmentFormNote] = useState('')
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null)
  const [adjustmentSaveSummary, setAdjustmentSaveSummary] = useState<BulkSaveSummary | null>(null)
  const [savingAdjustment, setSavingAdjustment] = useState(false)
  const [deletingAdjustmentId, setDeletingAdjustmentId] = useState<string | null>(null)
  const [rankSettingsOpen, setRankSettingsOpen] = useState(false)
  const [rankSettings, setRankSettings] = useState<ProductSalesRankSetting | null>(null)
  const [rankSettingsForm, setRankSettingsForm] = useState({
    aDailySalesThreshold: '20',
    bDailySalesThreshold: '10',
    cStockRatioThreshold: '10',
    cOrderRatioThreshold: '20',
    dActiveDaysThreshold: '3',
  })
  const [rankSettingsError, setRankSettingsError] = useState<string | null>(null)
  const [savingRankSettings, setSavingRankSettings] = useState(false)
  const [groupManagerOpen, setGroupManagerOpen] = useState(false)
  const [groupFormId, setGroupFormId] = useState<string | null>(null)
  const [groupFormName, setGroupFormName] = useState('')
  const [groupFormSkus, setGroupFormSkus] = useState<string[]>([])
  const [groupFormError, setGroupFormError] = useState<string | null>(null)
  const [savingGroup, setSavingGroup] = useState(false)
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [ordersImportResult, setOrdersImportResult] = useState<OrderImportResult | null>(null)
  const [skuImportResult, setSkuImportResult] = useState<SkuImportResult | null>(null)
  const [pendingSkuImportFile, setPendingSkuImportFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inventoryError, setInventoryError] = useState<string | null>(null)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [skuImportError, setSkuImportError] = useState<string | null>(null)
  const [trendFilterError, setTrendFilterError] = useState<string | null>(null)
  const [sampleStatsError, setSampleStatsError] = useState<string | null>(null)
  const [expandedProductIds, setExpandedProductIds] = useState<string[]>([])
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'currentAvailableStock',
    direction: 'asc',
  })
  const [inventoryReconciliationOpen, setInventoryReconciliationOpen] = useState(false)
  const [reconcilePreviewOpen, setReconcilePreviewOpen] = useState(false)
  const [reconcilePreviewLoading, setReconcilePreviewLoading] = useState(false)
  const [reconcilePreviewData, setReconcilePreviewData] = useState<ReconcilePreviewData | null>(null)
  const [reconcilePreviewError, setReconcilePreviewError] = useState<string | null>(null)
  const anyModalOpen = (
    stockBaselineOpen
    || stockAdjustmentOpen
    || rankSettingsOpen
    || Boolean(stockEditTarget)
    || groupManagerOpen
    || reconcilePreviewOpen
  )
  const activeUiStates = useMemo(
    () =>
      [
        ['loading', loading],
        ['importingInventory', importingInventory],
        ['importingOrders', importingOrders],
        ['savingBaseline', savingBaseline],
        ['savingAdjustment', savingAdjustment],
        ['savingRankSettings', savingRankSettings],
        ['checkingSkuImport', checkingSkuImport],
        ['importingSkus', importingSkus],
        ['reconcilePreviewLoading', reconcilePreviewLoading],
        ['anyModalOpen', anyModalOpen],
      ].filter(([, active]) => active),
    [
      anyModalOpen,
      checkingSkuImport,
      importingInventory,
      importingOrders,
      importingSkus,
      loading,
      reconcilePreviewLoading,
      savingAdjustment,
      savingBaseline,
      savingRankSettings,
    ],
  )
  const baseSelectClassName = 'w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none'
  const headerSelectClassName = `${baseSelectClassName} sm:w-56 xl:w-64`
  const skuSelectClassName = `${baseSelectClassName} max-w-full`

  const closeStockBaselineModal = useCallback(() => {
    if (savingBaseline) return
    setStockBaselineOpen(false)
    setBaselineError(null)
  }, [savingBaseline])

  const closeStockAdjustmentModal = useCallback(() => {
    if (savingAdjustment) return
    setStockAdjustmentOpen(false)
    setAdjustmentError(null)
  }, [savingAdjustment])

  const closeRankSettingsModal = useCallback(() => {
    if (savingRankSettings) return
    setRankSettingsOpen(false)
    setRankSettingsError(null)
  }, [savingRankSettings])

  const closeStockEditModal = useCallback(() => {
    if (editingStockSku) return
    setStockEditTarget(null)
    setStockEditError(null)
  }, [editingStockSku])

  const closeGroupManagerModal = useCallback(() => {
    if (savingGroup) return
    setGroupManagerOpen(false)
    resetGroupForm()
  }, [savingGroup])

  const closeReconcilePreviewModal = useCallback(() => {
    if (reconcilePreviewLoading) return
    setReconcilePreviewOpen(false)
  }, [reconcilePreviewLoading])

  const buildRangeParams = (range: TrendRange, startDate = trendStartDate, endDate = trendEndDate) => {
    const params = new URLSearchParams()
    params.set('range', range)
    if (range === 'custom') {
      params.set('startDate', startDate)
      params.set('endDate', endDate)
    }
    return params
  }

  const buildSampleStatsParams = (
    range: TrendRange,
    sku = sampleStatsSku,
    startDate = sampleStatsStartDate,
    endDate = sampleStatsEndDate,
  ) => {
    const params = new URLSearchParams()
    params.set('range', range)
    if (sku) {
      params.set('sku', sku)
    }
    if (range === 'custom') {
      params.set('startDate', startDate)
      params.set('endDate', endDate)
    }
    return params
  }

  const getBulkPreprocessContext = (): BulkPreprocessContext => ({
    ...(() => {
      const mainSkuSet = new Set<string>()
      const allKnownSkuSet = new Set<string>()
      const resolvedSkuByKey = new Map<string, string>()

      const registerResolvedSku = (value: string, resolvedSku: string) => {
        const normalizedKey = normalizeBulkSkuCompareKey(value)
        if (!normalizedKey || !resolvedSku) return
        allKnownSkuSet.add(normalizedKey)
        if (!resolvedSkuByKey.has(normalizedKey)) {
          resolvedSkuByKey.set(normalizedKey, resolvedSku)
        }
      }

      products.forEach((item) => {
        const rawSku = item.sku.trim()
        if (!rawSku || rawSku === '-') return

        const normalizedSku = normalizeBulkStockSku(rawSku)
        const resolvedMainSku = normalizedSku.mainSku || rawSku
        mainSkuSet.add(normalizeBulkSkuCompareKey(resolvedMainSku))

        buildBulkSkuMatchKeys(rawSku).forEach((key) => registerResolvedSku(key, resolvedMainSku))
        buildBulkSkuMatchKeys(item.name).forEach((key) => registerResolvedSku(key, resolvedMainSku))
      })

      skuOptions.forEach((item) => {
        const optionSku = item.sku.trim()
        if (!optionSku) return
        registerResolvedSku(optionSku, resolvedSkuByKey.get(normalizeBulkSkuCompareKey(optionSku)) || optionSku)
      })

      return {
        mainSkuSet,
        allKnownSkuSet,
        resolvedSkuByKey,
      }
    })(),
  })

  const loadPageData = async (
    range = trendRange,
    startDate = trendStartDate,
    endDate = trendEndDate,
    showLoading = false,
  ) => {
    try {
      if (showLoading) {
        setTableRangeLoading(true)
      }

      const response = await fetch(`/api/product-sales?${buildRangeParams(range, startDate, endDate).toString()}`, {
        cache: 'no-store',
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || '获取数据失败')
      }

      setSummary(data.summary)
      setProducts(Array.isArray(data.products) ? data.products : [])
      setSkuOptions(Array.isArray(data.skuOptions) ? data.skuOptions : [])
    } finally {
      if (showLoading) {
        setTableRangeLoading(false)
      }
    }
  }

  const handleOpenReconcilePreview = async () => {
    try {
      setReconcilePreviewLoading(true)
      setReconcilePreviewError(null)

      const response = await fetch('/api/product-sales/reconcile-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threshold: 10,
          skuFilter: [],
          includeOnlyWithBaseline: true,
          includeOnlyWithSnapshot: true,
        }),
      })
      const { data, text } = await parseApiResponse(response)
      const payload = data || {}

      if (!response.ok) {
        throw new Error(payload.error || text || '预览平台库存校准失败')
      }

      setReconcilePreviewData(payload as ReconcilePreviewData)
      setReconcilePreviewOpen(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : '预览平台库存校准失败'
      setReconcilePreviewError(message)
      setError(message)
    } finally {
      setReconcilePreviewLoading(false)
    }
  }

  const loadGroups = async () => {
    const response = await fetch('/api/product-sales/groups', {
      cache: 'no-store',
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || '获取分组失败')
    }

    setGroups(Array.isArray(data.groups) ? data.groups : [])
  }

  const loadBaselines = async (sku = '') => {
    const params = new URLSearchParams()
    if (sku) {
      params.set('sku', sku)
    }

    const response = await fetch(`/api/product-sales/stock-baselines${params.toString() ? `?${params.toString()}` : ''}`, {
      cache: 'no-store',
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || '获取初始库存失败')
    }

    setStockBaselines(Array.isArray(data.baselines) ? data.baselines : [])
  }

  const loadAdjustments = async (sku = '') => {
    const params = new URLSearchParams()
    if (sku) {
      params.set('sku', sku)
    }

    const response = await fetch(`/api/product-sales/stock-adjustments${params.toString() ? `?${params.toString()}` : ''}`, {
      cache: 'no-store',
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || '获取补货/调整记录失败')
    }

    setStockAdjustments(Array.isArray(data.adjustments) ? data.adjustments : [])
  }

  const loadRankSettings = async () => {
    const response = await fetch('/api/product-sales/rank-settings', {
      cache: 'no-store',
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || '获取等级设置失败')
    }

    const nextSetting = data.setting as ProductSalesRankSetting
    setRankSettings(nextSetting)
    setRankSettingsForm({
      aDailySalesThreshold: String(nextSetting?.aDailySalesThreshold ?? 20),
      bDailySalesThreshold: String(nextSetting?.bDailySalesThreshold ?? 10),
      cStockRatioThreshold: String(Math.round((nextSetting?.cStockRatioThreshold ?? 0.1) * 100)),
      cOrderRatioThreshold: String(Math.round((nextSetting?.cOrderRatioThreshold ?? 0.2) * 100)),
      dActiveDaysThreshold: String(nextSetting?.dActiveDaysThreshold ?? 3),
    })
  }

  const loadTrendData = async (
    sku = selectedSku,
    groupId = selectedGroupId,
    range = trendRange,
    startDate = trendStartDate,
    endDate = trendEndDate,
    showLoading = true,
  ) => {
    try {
      if (showLoading) {
        setTrendLoading(true)
      }

      const params = new URLSearchParams()
      if (sku) {
        params.set('sku', sku)
      }
      if (groupId) {
        params.set('groupId', groupId)
      }
      params.set('range', String(range))
      if (range === 'custom') {
        params.set('startDate', startDate)
        params.set('endDate', endDate)
      }

      const response = await fetch(`/api/product-sales/trends?${params.toString()}`, {
        cache: 'no-store',
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || '获取趋势失败')
      }

      setSelectedSku(data.selectedSku || '')
      setSelectedGroupId(data.selectedGroupId || '')
      setTrendRange((data.trendRange as TrendRange) || '7')
      setTrendStartDate(data.startDate || '')
      setTrendEndDate(data.endDate || '')
      if (data.startDate) {
        setCustomStartDate(data.startDate)
      }
      if (data.endDate) {
        setCustomEndDate(data.endDate)
      }
      setTrendTitle(data.trendTitle || '销售库存趋势 - 全部 SKU')
      setTrends(Array.isArray(data.trends) ? data.trends : [])
      setTrendSummary({
        grossOrders: data.filterSummary?.grossOrders || 0,
        returnQty: data.filterSummary?.returnQty || 0,
        netOrders: data.filterSummary?.netOrders || 0,
        canceledQty: data.filterSummary?.canceledQty || 0,
        refundAmount: data.filterSummary?.refundAmount || 0,
      })
      setTrendFilterError(null)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取趋势失败')
    } finally {
      if (showLoading) {
        setTrendLoading(false)
      }
    }
  }

  const loadWeeklyConsumption = async (
    sku = weeklyConsumptionSku,
    showLoading = true,
  ) => {
    try {
      if (showLoading) {
        setWeeklyConsumptionLoading(true)
      }

      const params = new URLSearchParams()
      params.set('mode', sku ? 'detail' : 'summary')
      params.set('limitWeeks', '8')
      params.set('includeCurrentWeek', 'true')
      if (sku) {
        params.set('sku', sku)
      }

      const response = await fetch(`/api/product-sales/weekly-consumption?${params.toString()}`, {
        cache: 'no-store',
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || '获取周销售消耗趋势失败')
      }

      const payload = data as WeeklyConsumptionData
      if (payload.mode === 'detail') {
        setWeeklySelectedMetric(payload.selectedSkuMetric)
      } else {
        setWeeklyConsumption(payload)
        setWeeklySelectedMetric(null)
      }
      setWeeklyConsumptionSku(sku)
      setWeeklyConsumptionError(null)
    } catch (err) {
      setWeeklyConsumptionError(err instanceof Error ? err.message : '获取周销售消耗趋势失败')
    } finally {
      if (showLoading) {
        setWeeklyConsumptionLoading(false)
      }
    }
  }

  const loadSampleStats = async (
    range = sampleStatsRange,
    sku = sampleStatsSku,
    startDate = sampleStatsStartDate,
    endDate = sampleStatsEndDate,
    showLoading = true,
  ) => {
    try {
      if (showLoading) {
        setSampleStatsLoading(true)
      }

      const response = await fetch(`/api/product-sales/sample-stats?${buildSampleStatsParams(range, sku, startDate, endDate).toString()}`, {
        cache: 'no-store',
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || '获取样品统计失败')
      }

      setSampleStats({
        range: (data.range as TrendRange) || '7',
        startDate: data.startDate || '',
        endDate: data.endDate || '',
        sku: data.sku || '',
        sampleRows: data.sampleRows || 0,
        totalSampleQty: data.totalSampleQty || 0,
        sampleSkuCount: data.sampleSkuCount || 0,
        sampleRecipientCount: data.sampleRecipientCount || 0,
        sampleBySku: Array.isArray(data.sampleBySku) ? data.sampleBySku : [],
        sampleByRecipient: Array.isArray(data.sampleByRecipient) ? data.sampleByRecipient : [],
        sampleByRecipientAndSku: Array.isArray(data.sampleByRecipientAndSku) ? data.sampleByRecipientAndSku : [],
      })
      setSampleStatsRange((data.range as TrendRange) || '7')
      setSampleStatsStartDate(data.startDate || '')
      setSampleStatsEndDate(data.endDate || '')
      setSampleStatsSku(data.sku || '')
      if (data.startDate) {
        setSampleStatsCustomStartDate(data.startDate)
      }
      if (data.endDate) {
        setSampleStatsCustomEndDate(data.endDate)
      }
      setSampleStatsError(null)
    } catch (err) {
      setSampleStatsError(err instanceof Error ? err.message : '获取样品统计失败')
    } finally {
      if (showLoading) {
        setSampleStatsLoading(false)
      }
    }
  }

  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true)
        await Promise.all([
          loadPageData('7', '', '', false),
          loadBaselines(),
          loadGroups(),
          loadRankSettings(),
          loadTrendData('', '', '7', '', '', false),
          loadSampleStats('7', '', '', '', false),
          loadWeeklyConsumption('', false),
        ])
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : '获取数据失败')
      } finally {
        setLoading(false)
      }
    }

    void initialize()
  }, [])

  useEffect(() => {
    if (!anyModalOpen) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [anyModalOpen])

  useEffect(() => {
    if (!anyModalOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      if (groupManagerOpen) {
        closeGroupManagerModal()
        return
      }

      if (reconcilePreviewOpen) {
        closeReconcilePreviewModal()
        return
      }

      if (stockEditTarget) {
        closeStockEditModal()
        return
      }

      if (rankSettingsOpen) {
        closeRankSettingsModal()
        return
      }

      if (stockAdjustmentOpen) {
        closeStockAdjustmentModal()
        return
      }

      if (stockBaselineOpen) {
        closeStockBaselineModal()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    anyModalOpen,
    closeReconcilePreviewModal,
    closeGroupManagerModal,
    closeRankSettingsModal,
    closeStockAdjustmentModal,
    closeStockBaselineModal,
    closeStockEditModal,
    groupManagerOpen,
    reconcilePreviewOpen,
    rankSettingsOpen,
    stockAdjustmentOpen,
    stockBaselineOpen,
    stockEditTarget,
  ])

  const refreshAfterMutation = async () => {
    await Promise.all([
      loadPageData(trendRange, trendStartDate, trendEndDate),
      loadBaselines(baselineFormSku),
      loadAdjustments(adjustmentFormSku),
      loadGroups(),
      loadRankSettings(),
      loadTrendData(selectedSku, selectedGroupId, trendRange, trendStartDate, trendEndDate, false),
      loadSampleStats(sampleStatsRange, sampleStatsSku, sampleStatsStartDate, sampleStatsEndDate, false),
      loadWeeklyConsumption(weeklyConsumptionSku, false),
    ])
    router.refresh()
  }

  const applyTrendRange = async (
    nextRange: TrendRange,
    nextStartDate: string,
    nextEndDate: string,
  ) => {
    if (nextRange === 'custom') {
      if (!nextStartDate || !nextEndDate) {
        setTrendFilterError('请选择开始日期和结束日期')
        return
      }
      if (nextStartDate > nextEndDate) {
        setTrendFilterError('开始日期不能大于结束日期')
        return
      }
    }

    try {
      setTrendFilterError(null)
      await Promise.all([
        loadPageData(nextRange, nextStartDate, nextEndDate, true),
        loadTrendData(selectedSku, selectedGroupId, nextRange, nextStartDate, nextEndDate, true),
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新时间筛选失败')
    }
  }

  const applySampleStatsRange = async (
    nextRange: TrendRange,
    nextStartDate: string,
    nextEndDate: string,
    nextSku = sampleStatsSku,
  ) => {
    if (nextRange === 'custom') {
      if (!nextStartDate || !nextEndDate) {
        setSampleStatsError('请选择开始日期和结束日期')
        return
      }
      if (nextStartDate > nextEndDate) {
        setSampleStatsError('开始日期不能大于结束日期')
        return
      }
    }

    await loadSampleStats(nextRange, nextSku, nextStartDate, nextEndDate, true)
  }

  const handleImportInventory = () => {
    setInventoryError('库存导入已迁移至“库存与订货中心”，请到 /dashboard/inventory-purchasing 生成预览并确认导入。')
    setError('库存导入已迁移至“库存与订货中心”。')
  }

  const handleImportSkus = () => {
    skuImportInputRef.current?.click()
  }

  const handleImportOrders = (mode: 'import' | 'dryRun' | 'checkOnly' = 'import') => {
    orderImportModeRef.current = mode
    ordersInputRef.current?.click()
  }

  const handleInventoryFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportingInventory(true)
    setImportResult(null)
    setError(null)
    setInventoryError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/product-sales/import-inventory', {
        method: 'POST',
        body: formData,
      })
      const { data, text } = await parseApiResponse(response)
      const payload = data || {}

      if (!response.ok) {
        throw new Error(buildImportErrorMessage('导入库存表失败', response, payload, text))
      }

      setImportResult({
        successCount: payload.successCount || 0,
        updatedExistingCount: payload.updatedExistingCount || 0,
        autoFilledSkuCount: payload.autoFilledSkuCount || 0,
        autoCreatedCount: payload.autoCreatedCount || 0,
        reviewCount: payload.reviewCount || 0,
        failureCount: payload.failureCount || 0,
        failures: Array.isArray(payload.failures) ? payload.failures : [],
        hint: payload.hint || null,
      })

      await refreshAfterMutation()
    } catch (err) {
      const message = err instanceof Error ? err.message : '导入库存表失败'
      setInventoryError(message)
      setError(message)
    } finally {
      event.target.value = ''
      setImportingInventory(false)
    }
  }

  const handleOrdersFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportingOrders(true)
    setOrdersImportResult(null)
    setError(null)
    setOrdersError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      const mode = orderImportModeRef.current
      const query =
        mode === 'dryRun'
          ? '?dryRun=1'
          : mode === 'checkOnly'
            ? '?checkOnly=1'
            : ''

      const response = await fetch(`/api/product-sales/import-orders${query}`, {
        method: 'POST',
        body: formData,
      })
      const { data, text } = await parseApiResponse(response)
      const payload = data || {}

      if (!response.ok) {
        throw new Error(buildImportErrorMessage('导入订单表失败', response, payload, text))
      }

      setOrdersImportResult({
        mode: payload.mode || 'import',
        stage: payload.stage || '',
        fileName: payload.fileName || '',
        fileSize: payload.fileSize || 0,
        totalOrderRows: payload.totalOrderRows || 0,
        parsedRows: payload.parsedRows || 0,
        validRows: payload.validRows || 0,
        orderItemCount: payload.orderItemCount || 0,
        dedupeKeyCount: payload.dedupeKeyCount || 0,
        duplicateInFileCount: payload.duplicateInFileCount || 0,
        uniqueSkuCount: payload.uniqueSkuCount || 0,
        matchedSkuCount: payload.matchedSkuCount || 0,
        missingSkuCount: payload.missingSkuCount || 0,
        missingSkuRows: payload.missingSkuRows || 0,
        skippedCount: payload.skippedCount || 0,
        missingSkus: Array.isArray(payload.missingSkus) ? payload.missingSkus : [],
        insertedOrderItemCount: payload.insertedOrderItemCount || 0,
        updatedOrderItemCount: payload.updatedOrderItemCount || 0,
        aggregatedRecordCount: payload.aggregatedRecordCount || 0,
        successCount: payload.successCount || 0,
        failedCount: payload.failedCount || 0,
        skippedRows: Array.isArray(payload.skippedRows) ? payload.skippedRows : [],
        failedRows: Array.isArray(payload.failedRows) ? payload.failedRows : [],
        summaryByDate: Array.isArray(payload.summaryByDate) ? payload.summaryByDate : [],
        summaryBySku: Array.isArray(payload.summaryBySku) ? payload.summaryBySku : [],
        totalGrossOrders: payload.totalGrossOrders || 0,
        totalReturnQty: payload.totalReturnQty || 0,
        totalNetOrders: payload.totalNetOrders || 0,
        totalCanceledQty: payload.totalCanceledQty || 0,
        totalStockConsumedQty: payload.totalStockConsumedQty || 0,
        totalRefundAmount: payload.totalRefundAmount || 0,
        sampleRows: payload.sampleRows || 0,
        sampleQty: payload.sampleQty || 0,
        sampleSkuCount: payload.sampleSkuCount || 0,
        sampleRecipientCount: payload.sampleRecipientCount || 0,
        sampleBySku: Array.isArray(payload.sampleBySku) ? payload.sampleBySku : [],
        sampleByRecipient: Array.isArray(payload.sampleByRecipient) ? payload.sampleByRecipient : [],
        sampleByRecipientAndSku: Array.isArray(payload.sampleByRecipientAndSku)
          ? payload.sampleByRecipientAndSku
          : [],
        staleRecordCount: payload.staleRecordCount || 0,
        writeErrors: Array.isArray(payload.writeErrors) ? payload.writeErrors : [],
        hint: payload.hint || null,
      })

      await refreshAfterMutation()
    } catch (err) {
      const message = err instanceof Error ? err.message : '导入订单表失败'
      setOrdersError(message)
      setError(message)
    } finally {
      event.target.value = ''
      setImportingOrders(false)
    }
  }

  const handleSkuImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setCheckingSkuImport(true)
    setSkuImportResult(null)
    setPendingSkuImportFile(file)
    setSkuImportError(null)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/product-sales/import-skus?dryRun=1', {
        method: 'POST',
        body: formData,
      })
      const { data, text } = await parseApiResponse(response)
      const payload = data || {}

      if (!response.ok) {
        throw new Error(buildImportErrorMessage('预检查产品 SKU 失败', response, payload, text))
      }

      setSkuImportResult({
        mode: payload.mode || 'dryRun',
        stage: payload.stage || '',
        fileName: payload.fileName || file.name,
        totalRows: payload.totalRows || 0,
        extractedSkuCount: payload.extractedSkuCount || 0,
        uniqueSkuCount: payload.uniqueSkuCount || 0,
        existingSkuCount: payload.existingSkuCount || 0,
        existingAliasSkuCount: payload.existingAliasSkuCount || 0,
        aliasMatchedSkuCount: payload.aliasMatchedSkuCount || 0,
        productSkuParenthesisAliasSkuCount: payload.productSkuParenthesisAliasSkuCount || 0,
        productNameParenthesisAliasSkuCount: payload.productNameParenthesisAliasSkuCount || 0,
        newSkuCount: payload.newSkuCount || 0,
        fillableSkuCount: payload.fillableSkuCount || 0,
        duplicateInFileCount: payload.duplicateInFileCount || 0,
        suspiciousCount: payload.suspiciousCount || 0,
        createdCount: payload.createdCount || 0,
        filledCount: payload.filledCount || 0,
        aliasCreatedCount: payload.aliasCreatedCount || 0,
        existingSkus: Array.isArray(payload.existingSkus) ? payload.existingSkus : [],
        existingAliasSkus: Array.isArray(payload.existingAliasSkus) ? payload.existingAliasSkus : [],
        aliasMatchedSkus: Array.isArray(payload.aliasMatchedSkus) ? payload.aliasMatchedSkus : [],
        productSkuParenthesisAliasSkus: Array.isArray(payload.productSkuParenthesisAliasSkus)
          ? payload.productSkuParenthesisAliasSkus
          : [],
        productNameParenthesisAliasSkus: Array.isArray(payload.productNameParenthesisAliasSkus)
          ? payload.productNameParenthesisAliasSkus
          : [],
        newSkus: Array.isArray(payload.newSkus) ? payload.newSkus : [],
        fillableSkus: Array.isArray(payload.fillableSkus) ? payload.fillableSkus : [],
        suspiciousRows: Array.isArray(payload.suspiciousRows) ? payload.suspiciousRows : [],
        skippedRows: Array.isArray(payload.skippedRows) ? payload.skippedRows : [],
        failedRows: Array.isArray(payload.failedRows) ? payload.failedRows : [],
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : '预检查产品 SKU 失败'
      setSkuImportError(message)
      setError(message)
      setPendingSkuImportFile(null)
    } finally {
      event.target.value = ''
      setCheckingSkuImport(false)
    }
  }

  const handleConfirmSkuImport = async () => {
    if (!pendingSkuImportFile) {
      setSkuImportError('请先选择文件并完成 SKU 预检查')
      return
    }

    setImportingSkus(true)
    setSkuImportError(null)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', pendingSkuImportFile)

      const response = await fetch('/api/product-sales/import-skus', {
        method: 'POST',
        body: formData,
      })
      const { data, text } = await parseApiResponse(response)
      const payload = data || {}

      if (!response.ok) {
        throw new Error(buildImportErrorMessage('导入产品 SKU 失败', response, payload, text))
      }

      setSkuImportResult({
        mode: payload.mode || 'import',
        stage: payload.stage || '',
        fileName: payload.fileName || pendingSkuImportFile.name,
        totalRows: payload.totalRows || 0,
        extractedSkuCount: payload.extractedSkuCount || 0,
        uniqueSkuCount: payload.uniqueSkuCount || 0,
        existingSkuCount: payload.existingSkuCount || 0,
        existingAliasSkuCount: payload.existingAliasSkuCount || 0,
        aliasMatchedSkuCount: payload.aliasMatchedSkuCount || 0,
        productSkuParenthesisAliasSkuCount: payload.productSkuParenthesisAliasSkuCount || 0,
        productNameParenthesisAliasSkuCount: payload.productNameParenthesisAliasSkuCount || 0,
        newSkuCount: payload.newSkuCount || 0,
        fillableSkuCount: payload.fillableSkuCount || 0,
        duplicateInFileCount: payload.duplicateInFileCount || 0,
        suspiciousCount: payload.suspiciousCount || 0,
        createdCount: payload.createdCount || 0,
        filledCount: payload.filledCount || 0,
        aliasCreatedCount: payload.aliasCreatedCount || 0,
        existingSkus: Array.isArray(payload.existingSkus) ? payload.existingSkus : [],
        existingAliasSkus: Array.isArray(payload.existingAliasSkus) ? payload.existingAliasSkus : [],
        aliasMatchedSkus: Array.isArray(payload.aliasMatchedSkus) ? payload.aliasMatchedSkus : [],
        productSkuParenthesisAliasSkus: Array.isArray(payload.productSkuParenthesisAliasSkus)
          ? payload.productSkuParenthesisAliasSkus
          : [],
        productNameParenthesisAliasSkus: Array.isArray(payload.productNameParenthesisAliasSkus)
          ? payload.productNameParenthesisAliasSkus
          : [],
        newSkus: Array.isArray(payload.newSkus) ? payload.newSkus : [],
        fillableSkus: Array.isArray(payload.fillableSkus) ? payload.fillableSkus : [],
        suspiciousRows: Array.isArray(payload.suspiciousRows) ? payload.suspiciousRows : [],
        skippedRows: Array.isArray(payload.skippedRows) ? payload.skippedRows : [],
        failedRows: Array.isArray(payload.failedRows) ? payload.failedRows : [],
      })

      setPendingSkuImportFile(null)
      await refreshAfterMutation()
    } catch (err) {
      const message = err instanceof Error ? err.message : '导入产品 SKU 失败'
      setSkuImportError(message)
      setError(message)
    } finally {
      setImportingSkus(false)
    }
  }

  const resetBaselineForm = (sku = '') => {
    setBaselineFormSku(sku)
    setBaselineFormQuantity('')
    setBaselineBulkText('')
    setBaselineFormDate(getTodayInputValue())
    setBaselineFormNote('')
    setBaselineError(null)
    setBaselineSaveSummary(null)
  }

  const openStockBaselineModal = () => {
    const nextSku = selectedSku || skuOptions[0]?.sku || ''
    setBaselineFormMode('single')
    resetBaselineForm(nextSku)
    setStockBaselineOpen(true)
  }

  const handleSaveBaseline = async () => {
    if (!baselineFormDate) {
      setBaselineError('请选择基准日期')
      return
    }

    let payload: Record<string, unknown>
    let bulkFailures: BulkItemFailure[] = []
    let localBulkSummary: any = null

    if (baselineFormMode === 'bulk') {
      const parsed = parseBulkSkuQuantityText(baselineBulkText, getBulkPreprocessContext(), 'baseline')
      bulkFailures = parsed.failures
      localBulkSummary = parsed
      if (parsed.items.some((item) => item.quantity < 0)) {
        setBaselineError('初始库存必须是大于等于 0 的整数')
        return
      }
      if (!parsed.items.length && !bulkFailures.length) {
        setBaselineError('请先粘贴批量库存数据')
        return
      }
      payload = {
        items: parsed.items.map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
          baselineDate: item.date || undefined,
          lineNumber: item.lineNumber,
          rawLine: item.rawLine,
        })),
        baselineDate: baselineFormDate,
        note: baselineFormNote,
      }
    } else {
      const sku = baselineFormSku.trim()
      if (!sku) {
        setBaselineError('请选择 SKU')
        return
      }

      const quantity = Number(baselineFormQuantity.trim())
      if (!Number.isInteger(quantity) || quantity < 0) {
        setBaselineError('初始库存必须是大于等于 0 的整数')
        return
      }

      payload = {
        sku,
        quantity,
        baselineDate: baselineFormDate,
        note: baselineFormNote,
      }
    }

    try {
      setSavingBaseline(true)
      setBaselineError(null)
      setBaselineSaveSummary(null)
      setError(null)

      const response = await fetch('/api/product-sales/stock-baselines', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '保存初始库存失败')
      }

      await refreshAfterMutation()
      const resultSummary: BulkSaveSummary = {
        successCount: data.successCount || 0,
        createdCount: data.createdCount,
        updatedCount: data.updatedCount,
        rawRowCount: localBulkSummary?.rawRowCount,
        parsedCount: localBulkSummary?.parsedCount ?? (data.successCount || 0),
        failureCount: (data.failureCount || 0) + bulkFailures.length,
        duplicateInInputCount: localBulkSummary?.duplicateInInputCount ?? data.duplicateInInputCount,
        mergedCount: localBulkSummary?.mergedCount || 0,
        autoCorrectedCount: localBulkSummary?.autoCorrectedCount || 0,
        suspiciousCount: localBulkSummary?.suspiciousCount || 0,
        unmatchedSkuCount: data.unmatchedSkuCount,
        usedItemDateCount: data.usedItemDateCount,
        usedDefaultDateCount: data.usedDefaultDateCount,
        duplicateRows: localBulkSummary?.duplicateRows || [],
        warningRows: localBulkSummary?.warningRows || [],
        failures: [...bulkFailures, ...(Array.isArray(data.failures) ? data.failures : [])],
      }

      if (baselineFormMode === 'bulk') {
        setBaselineSaveSummary(resultSummary)
        await loadBaselines()
      } else {
        setStockBaselineOpen(false)
        resetBaselineForm(baselineFormSku.trim())
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存初始库存失败'
      setBaselineError(message)
      setError(message)
    } finally {
      setSavingBaseline(false)
    }
  }

  const resetAdjustmentForm = (sku = '') => {
    setAdjustmentFormSku(sku)
    setAdjustmentFormQuantity('')
    setAdjustmentBulkText('')
    setAdjustmentFormDate(getTodayInputValue())
    setAdjustmentFormType('replenish')
    setAdjustmentFormNote('')
    setAdjustmentError(null)
    setAdjustmentSaveSummary(null)
  }

  const openStockAdjustmentModal = async () => {
    const nextSku = selectedSku || skuOptions[0]?.sku || ''
    setAdjustmentFormMode('single')
    resetAdjustmentForm(nextSku)
    setStockAdjustmentOpen(true)
    try {
      await loadAdjustments(nextSku)
    } catch (err) {
      setAdjustmentError(err instanceof Error ? err.message : '获取补货/调整记录失败')
    }
  }

  const handleSaveAdjustment = async () => {
    if (!adjustmentFormDate) {
      setAdjustmentError('请选择调整日期')
      return
    }

    let payload: Record<string, unknown>
    let bulkFailures: BulkItemFailure[] = []
    let localBulkSummary: any = null

    if (adjustmentFormMode === 'bulk') {
      const parsed = parseBulkSkuQuantityText(adjustmentBulkText, getBulkPreprocessContext(), 'adjustment', adjustmentFormType)
      bulkFailures = parsed.failures
      localBulkSummary = parsed
      if (parsed.items.some((item) => item.quantity === 0)) {
        setAdjustmentError('调整数量必须是非 0 整数')
        return
      }
      if (adjustmentFormType === 'replenish' && parsed.items.some((item) => item.quantity < 0)) {
        setAdjustmentError('补货数量必须为正数')
        return
      }
      if (adjustmentFormType === 'damage' && parsed.items.some((item) => item.quantity > 0)) {
        setAdjustmentError('损耗数量必须为负数')
        return
      }
      if (!parsed.items.length && !bulkFailures.length) {
        setAdjustmentError('请先粘贴批量补货/调整数据')
        return
      }
      payload = {
        items: parsed.items.map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
          adjustmentDate: item.date || undefined,
          lineNumber: item.lineNumber,
          rawLine: item.rawLine,
        })),
        adjustmentDate: adjustmentFormDate,
        type: adjustmentFormType,
        note: adjustmentFormNote,
      }
    } else {
      const sku = adjustmentFormSku.trim()
      if (!sku) {
        setAdjustmentError('请选择 SKU')
        return
      }

      const quantity = Number(adjustmentFormQuantity.trim())
      if (!Number.isInteger(quantity) || quantity === 0) {
        setAdjustmentError('调整数量必须是非 0 整数')
        return
      }

      if (adjustmentFormType === 'replenish' && quantity < 0) {
        setAdjustmentError('补货数量必须为正数')
        return
      }

      if (adjustmentFormType === 'damage' && quantity > 0) {
        setAdjustmentError('损耗数量必须为负数')
        return
      }

      payload = {
        sku,
        quantity,
        adjustmentDate: adjustmentFormDate,
        type: adjustmentFormType,
        note: adjustmentFormNote,
      }
    }

    try {
      setSavingAdjustment(true)
      setAdjustmentError(null)
      setAdjustmentSaveSummary(null)
      setError(null)

      const response = await fetch('/api/product-sales/stock-adjustments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '保存补货/调整记录失败')
      }

      await refreshAfterMutation()
      const resultSummary: BulkSaveSummary = {
        successCount: data.successCount || 0,
        rawRowCount: localBulkSummary?.rawRowCount,
        parsedCount: localBulkSummary?.parsedCount ?? (data.successCount || 0),
        failureCount: (data.failureCount || 0) + bulkFailures.length,
        duplicateInInputCount: localBulkSummary?.duplicateInInputCount ?? data.duplicateInInputCount,
        mergedCount: localBulkSummary?.mergedCount || 0,
        autoCorrectedCount: localBulkSummary?.autoCorrectedCount || 0,
        suspiciousCount: localBulkSummary?.suspiciousCount || 0,
        unmatchedSkuCount: data.unmatchedSkuCount,
        usedItemDateCount: data.usedItemDateCount,
        usedDefaultDateCount: data.usedDefaultDateCount,
        duplicateRows: localBulkSummary?.duplicateRows || [],
        warningRows: localBulkSummary?.warningRows || [],
        failures: [...bulkFailures, ...(Array.isArray(data.failures) ? data.failures : [])],
      }

      if (adjustmentFormMode === 'bulk') {
        setAdjustmentSaveSummary(resultSummary)
        await loadAdjustments()
      } else {
        await loadAdjustments(adjustmentFormSku.trim())
        resetAdjustmentForm(adjustmentFormSku.trim())
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存补货/调整记录失败'
      setAdjustmentError(message)
      setError(message)
    } finally {
      setSavingAdjustment(false)
    }
  }

  const handleDeleteAdjustment = async (adjustment: ProductStockAdjustment) => {
    const confirmed = window.confirm(`确认删除 ${adjustment.sku} 在 ${adjustment.adjustmentDate} 的这条补货/调整记录吗？`)
    if (!confirmed) return

    try {
      setDeletingAdjustmentId(adjustment.id)
      setAdjustmentError(null)
      setError(null)

      const response = await fetch('/api/product-sales/stock-adjustments', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: adjustment.id,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '删除补货/调整记录失败')
      }

      await refreshAfterMutation()
      await loadAdjustments(adjustmentFormSku)
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除补货/调整记录失败'
      setAdjustmentError(message)
      setError(message)
    } finally {
      setDeletingAdjustmentId(null)
    }
  }

  const openRankSettingsModal = () => {
    setRankSettingsOpen(true)
    setRankSettingsError(null)
  }

  const handleSaveRankSettings = async () => {
    const aDailySalesThreshold = Number(rankSettingsForm.aDailySalesThreshold.trim())
    const bDailySalesThreshold = Number(rankSettingsForm.bDailySalesThreshold.trim())
    const cStockRatioThreshold = Number(rankSettingsForm.cStockRatioThreshold.trim())
    const cOrderRatioThreshold = Number(rankSettingsForm.cOrderRatioThreshold.trim())
    const dActiveDaysThreshold = Number(rankSettingsForm.dActiveDaysThreshold.trim())

    if (!Number.isInteger(aDailySalesThreshold) || aDailySalesThreshold <= 0) {
      setRankSettingsError('A 日均销量阈值必须是正整数')
      return
    }
    if (!Number.isInteger(bDailySalesThreshold) || bDailySalesThreshold <= 0) {
      setRankSettingsError('B 日均销量阈值必须是正整数')
      return
    }
    if (aDailySalesThreshold <= bDailySalesThreshold) {
      setRankSettingsError('A 阈值必须大于 B 阈值')
      return
    }
    if (!Number.isFinite(cStockRatioThreshold) || cStockRatioThreshold <= 0) {
      setRankSettingsError('C 库存占比阈值必须大于 0')
      return
    }
    if (!Number.isFinite(cOrderRatioThreshold) || cOrderRatioThreshold <= 0) {
      setRankSettingsError('C 全店订单占比阈值必须大于 0')
      return
    }
    if (!Number.isInteger(dActiveDaysThreshold) || dActiveDaysThreshold <= 0) {
      setRankSettingsError('D 出单天数阈值必须是正整数')
      return
    }

    try {
      setSavingRankSettings(true)
      setRankSettingsError(null)
      setError(null)

      const response = await fetch('/api/product-sales/rank-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          aDailySalesThreshold,
          bDailySalesThreshold,
          cStockRatioThreshold: cStockRatioThreshold / 100,
          cOrderRatioThreshold: cOrderRatioThreshold / 100,
          dActiveDaysThreshold,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '保存等级设置失败')
      }

      await refreshAfterMutation()
      setRankSettingsOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存等级设置失败'
      setRankSettingsError(message)
      setError(message)
    } finally {
      setSavingRankSettings(false)
    }
  }

  const handleEditStock = (product: ProductData) => {
    setError('手动编辑库存为 legacy 特殊入口，正式库存请使用“库存与订货中心”。')
    return

    if (!product.sku || product.sku === '-') {
      setError('该产品缺少 SKU，无法修改库存')
      return
    }

    setStockEditTarget(product)
    setStockEditMode('set')
    setStockEditValue(String(product.stock))
    setStockEditError(null)
  }

  const handleSaveStock = async () => {
    if (!stockEditTarget) return

    const trimmed = stockEditValue.trim()
    if (!trimmed) {
      setStockEditError(stockEditMode === 'set' ? '库存不能为空' : '调整数量不能为空')
      return
    }

    const parsedValue = Number(trimmed)
    if (!Number.isInteger(parsedValue) || parsedValue < 0) {
      setStockEditError(stockEditMode === 'set' ? '库存必须是大于等于 0 的整数' : '调整数量必须是大于等于 0 的整数')
      return
    }

    if (stockEditMode === 'decrease' && parsedValue > stockEditTarget.stock) {
      setStockEditError('库存不能小于 0')
      return
    }

    try {
      setEditingStockSku(stockEditTarget.sku)
      setStockEditError(null)
      setError(null)

      const response = await fetch('/api/product-sales/update-stock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sku: stockEditTarget.sku,
          mode: stockEditMode,
          stock: stockEditMode === 'set' ? parsedValue : undefined,
          quantity: stockEditMode === 'set' ? undefined : parsedValue,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '修改库存失败')
      }

      await refreshAfterMutation()
      setStockEditTarget(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : '修改库存失败'
      setStockEditError(message)
      setError(message)
    } finally {
      setEditingStockSku(null)
    }
  }

  const handleDeleteInventory = async (product: ProductData) => {
    setError('删除库存为 legacy 特殊入口，正式库存请使用“库存与订货中心”。')
    return

    if (!product.sku || product.sku === '-') {
      setError('该产品缺少 SKU，无法删除库存')
      return
    }

    const confirmed = window.confirm(
      `确认将 SKU ${product.sku} 的当前库存清零吗？不会删除产品和销量数据。`,
    )
    if (!confirmed) return

    try {
      setDeletingStockSku(product.sku)
      setError(null)

      const response = await fetch('/api/product-sales/delete-inventory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sku: product.sku,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '删除库存失败')
      }

      await refreshAfterMutation()
    } catch {
      setError('删除库存失败')
    } finally {
      setDeletingStockSku(null)
    }
  }

  const resetGroupForm = () => {
    setGroupFormId(null)
    setGroupFormName('')
    setGroupFormSkus([])
    setGroupFormError(null)
  }

  const handleEditGroup = (group: ProductSalesGroup) => {
    setGroupFormId(group.id)
    setGroupFormName(group.name)
    setGroupFormSkus(group.skus)
    setGroupFormError(null)
  }

  const toggleGroupSku = (sku: string) => {
    setGroupFormSkus((prev) =>
      prev.includes(sku) ? prev.filter((item) => item !== sku) : [...prev, sku],
    )
  }

  const handleSaveGroup = async () => {
    const name = groupFormName.trim()
    if (!name) {
      setGroupFormError('分组名称不能为空')
      return
    }

    try {
      setSavingGroup(true)
      setGroupFormError(null)

      const response = await fetch(
        groupFormId ? `/api/product-sales/groups/${groupFormId}` : '/api/product-sales/groups',
        {
          method: groupFormId ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            skus: groupFormSkus,
          }),
        },
      )
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '保存分组失败')
      }

      await loadGroups()
      await loadTrendData(selectedSku, selectedGroupId, trendRange, trendStartDate, trendEndDate, false)
      resetGroupForm()
    } catch (err) {
      setGroupFormError(err instanceof Error ? err.message : '保存分组失败')
    } finally {
      setSavingGroup(false)
    }
  }

  const handleDeleteGroup = async (group: ProductSalesGroup) => {
    const confirmed = window.confirm(`确认删除分组“${group.name}”吗？不会删除产品、库存和销量数据。`)
    if (!confirmed) return

    try {
      setDeletingGroupId(group.id)

      const response = await fetch(`/api/product-sales/groups/${group.id}`, {
        method: 'DELETE',
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '删除分组失败')
      }

      await loadGroups()
      await loadTrendData(selectedSku, selectedGroupId, trendRange, trendStartDate, trendEndDate, false)
      if (groupFormId === group.id) {
        resetGroupForm()
      }
    } catch (err) {
      setGroupFormError(err instanceof Error ? err.message : '删除分组失败')
    } finally {
      setDeletingGroupId(null)
    }
  }

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const compareDefaultSalesRankSort = (a: ProductData, b: ProductData) => {
    const rankPriorityDiff = a.salesRankPriority - b.salesRankPriority
    if (rankPriorityDiff !== 0) return rankPriorityDiff

    const velocityScoreDiff = b.velocityScore - a.velocityScore
    if (velocityScoreDiff !== 0) return velocityScoreDiff

    const recent3DaySalesDiff = b.recent3DaySales - a.recent3DaySales
    if (recent3DaySalesDiff !== 0) return recent3DaySalesDiff

    const sevenDayAvgSalesDiff = b.sevenDayAvgSales - a.sevenDayAvgSales
    if (sevenDayAvgSalesDiff !== 0) return sevenDayAvgSalesDiff

    if (a.hasBaseline !== b.hasBaseline) return a.hasBaseline ? -1 : 1

    const estimatedStockDiff = a.estimatedStock - b.estimatedStock
    if (estimatedStockDiff !== 0) return estimatedStockDiff

    return a.sku.localeCompare(b.sku)
  }

  const sortedProducts = [...products].sort((a, b) => {
    if (sortConfig.key === 'salesRankPriority') {
      const result = compareDefaultSalesRankSort(a, b)
      return sortConfig.direction === 'asc' ? result : -result
    }

    if (sortConfig.key === 'daysOfSupply') {
      const aValue = getDaysOfSupplyValue(a)
      const bValue = getDaysOfSupplyValue(b)
      return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue
    }

    if (sortConfig.key === 'stockStatus') {
      const priority = (value: string) => {
        if (value === '缺货') return 0
        if (value === '低库存') return 1
        return 2
      }
      const result = priority(a.stockStatus) - priority(b.stockStatus)
      if (result !== 0) {
        return sortConfig.direction === 'asc' ? result : -result
      }
    }

    if (sortConfig.key === 'dataReminders') {
      const aValue = a.dataReminders.join(' / ')
      const bValue = b.dataReminders.join(' / ')
      return sortConfig.direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
    }

    if (sortConfig.key === 'estimatedStock' && a.hasBaseline !== b.hasBaseline) {
      return sortConfig.direction === 'asc'
        ? (a.hasBaseline ? -1 : 1)
        : (a.hasBaseline ? 1 : -1)
    }

    const aValue = a[sortConfig.key as keyof ProductData]
    const bValue = b[sortConfig.key as keyof ProductData]

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortConfig.direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue
    }

    return 0
  })
  const visibleProducts = sortedProducts
  const reconciliationProducts = [...products].sort((a, b) => {
    const diffGap = Math.abs(b.inventoryDiff ?? 0) - Math.abs(a.inventoryDiff ?? 0)
    if (diffGap !== 0) return diffGap

    const updatedGap = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    if (updatedGap !== 0) return updatedGap

    return a.sku.localeCompare(b.sku)
  })

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig.key !== columnKey) {
      return <span className="text-slate-400 text-xs">⇅</span>
    }
    return <span className="text-pink-500 text-xs">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
  }

  const toggleProductDetails = (productId: string) => {
    setExpandedProductIds((prev) => (
      prev.includes(productId)
        ? prev.filter((item) => item !== productId)
        : [...prev, productId]
    ))
  }

  const getRankLabel = (rank: string) => {
    switch (rank) {
      case 'A':
        return 'A 大爆品'
      case 'B':
        return 'B 小爆品'
      case 'C':
        return 'C 潜力'
      case 'D':
        return 'D 稳定'
      case 'E':
        return 'E 弱动销'
      default:
        return 'F 不出单'
    }
  }

  const getRankBadgeClass = (rank: string) => {
    switch (rank) {
      case 'A':
        return 'bg-rose-100 text-rose-700 border border-rose-200'
      case 'B':
        return 'bg-orange-100 text-orange-700 border border-orange-200'
      case 'C':
        return 'bg-sky-100 text-sky-700 border border-sky-200'
      case 'D':
        return 'bg-emerald-100 text-emerald-700 border border-emerald-200'
      case 'E':
        return 'bg-amber-100 text-amber-700 border border-amber-200'
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200'
    }
  }

  const getStockStatusLabel = (stockStatus: string) => {
    if (stockStatus === '断货') return '缺货'
    return stockStatus
  }

  const getStockStatusBadgeClass = (stockStatus: string) => {
    if (stockStatus === '断货' || stockStatus === '缺货') {
      return 'bg-red-100 text-red-700 border border-red-200'
    }
    if (stockStatus === '低库存') {
      return 'bg-amber-100 text-amber-700 border border-amber-200'
    }
    return 'bg-emerald-100 text-emerald-700 border border-emerald-200'
  }

  const getEstimatedStockTextClass = (estimatedStock: number, hasBaseline = true) => {
    if (!hasBaseline) return 'text-slate-400'
    if (estimatedStock === 0) return 'text-red-700'
    if (estimatedStock <= 10) return 'text-orange-700'
    return 'text-slate-900'
  }

  const getDaysOfSupplyValue = (product: ProductData) => {
    if (product.avgDailySales <= 0) return Number.POSITIVE_INFINITY
    return Number((product.currentAvailableStock / product.avgDailySales).toFixed(1))
  }

  const getDaysOfSupplyDisplay = (product: ProductData) => {
    if (product.avgDailySales <= 0) {
      return product.currentAvailableStock > 0 ? '无近期销量' : '缺货'
    }
    return `${getDaysOfSupplyValue(product)} 天`
  }

  const getDaysOfSupplyTextClass = (product: ProductData) => {
    if (product.avgDailySales <= 0) {
      return product.currentAvailableStock > 0 ? 'text-slate-500' : 'text-red-700'
    }
    const days = getDaysOfSupplyValue(product)
    if (days <= 7) return 'text-red-700'
    if (days <= 14) return 'text-orange-700'
    return 'text-slate-900'
  }

  const getCurrentAvailableStockTextClass = (product: ProductData) => {
    if (product.currentAvailableStock === 0) return 'text-red-700'
    if (product.currentAvailableStock <= 10) return 'text-orange-700'
    return 'text-slate-900'
  }

  const getPlatformStockSourceText = (product: ProductData) => {
    switch (product.platformStockSource) {
      case 'snapshot_total':
        return '快照 totalQty'
      case 'snapshot_available_locked':
        return '快照 available+locked'
      case 'product_stock_fallback':
        return '非快照（Product.stock）'
      default:
        return '无平台快照'
    }
  }

  const getPlatformSnapshotStockDisplay = (product: ProductData) => {
    if (product.platformSnapshotStock === null) return '无平台快照'
    return String(product.platformSnapshotStock)
  }

  const getInventoryDiffTextClass = (inventoryDiff: number | null) => {
    if (inventoryDiff === null) return 'text-slate-400'
    if (inventoryDiff > 0) return 'text-emerald-700'
    if (inventoryDiff < 0) return 'text-red-700'
    return 'text-slate-600'
  }

  const formatSignedNumber = (value: number | null) => {
    if (value === null) return '未设置'
    if (value > 0) return `+${value}`
    return String(value)
  }

  const formatWeeklyPercent = (value: number | null) => {
    if (value === null) return '—'
    return `${(value * 100).toFixed(1)}%`
  }

  const formatWeeklyRatePoint = (value: number | null) => {
    if (value === null) return '—'
    const text = `${(value * 100).toFixed(1)}pp`
    return value > 0 ? `+${text}` : text
  }

  const formatGrowthRate = (value: number | null, fallback: string) => {
    if (value === null) return fallback
    return `${value > 0 ? '+' : ''}${(value * 100).toFixed(0)}%`
  }

  const formatWeeksOfSupply = (value: number | null) => {
    if (value === null) return '最近无稳定销售，暂无法估算'
    return `约 ${value.toFixed(1)} 周`
  }

  const getInclusiveDayCount = (startDate?: string, endDate?: string) => {
    if (!startDate || !endDate) return 0
    const start = new Date(`${startDate}T00:00:00`)
    const end = new Date(`${endDate}T00:00:00`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
  }

  const formatOpeningStock = (point: WeeklyConsumptionTrendPoint) => {
    if (point.openingStockStatus === 'missing') return '缺少周初库存'
    if (point.openingStockStatus === 'zero') return '周初库存为0'
    return String(point.openingStock)
  }

  const formatChartRatePercent = (value: number | null) => {
    if (value === null) return '无法计算'
    return `${value.toFixed(1)}%`
  }

  const renderStoreWeeklyTooltip = ({
    active,
    payload,
  }: {
    active?: boolean
    payload?: WeeklyTooltipPayload<StoreWeeklyChartPoint>
  }) => {
    const point = payload?.[0]?.payload
    if (!active || !point) return null

    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
        <div className="mb-1 font-semibold text-slate-900">{point.weekStart} ~ {point.weekEnd}</div>
        <div className="text-slate-600">真实销售消耗：<span className="font-medium text-slate-900">{point.ordinarySalesConsumedQty} 件</span></div>
        <div className="text-slate-600">有效周初库存：<span className="font-medium text-slate-900">{point.denominatorOpeningStock} 件</span></div>
        <div className="text-slate-600">加权销售消耗率：<span className="font-medium text-slate-900">{formatChartRatePercent(point.ratePercent)}</span></div>
        <div className="text-slate-600">有效 SKU 数：<span className="font-medium text-slate-900">{point.validSkuCount} 个</span></div>
      </div>
    )
  }

  const renderSkuWeeklyTooltip = ({
    active,
    payload,
  }: {
    active?: boolean
    payload?: WeeklyTooltipPayload<SkuWeeklyChartPoint>
  }) => {
    const point = payload?.[0]?.payload
    if (!active || !point) return null

    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
        <div className="mb-1 font-semibold text-slate-900">{point.weekStart} ~ {point.weekEnd}</div>
        <div className="text-slate-600">普通销售消耗：<span className="font-medium text-slate-900">{point.ordinarySalesConsumedQty} 件</span></div>
        <div className="text-slate-600">周初库存：<span className="font-medium text-slate-900">{formatOpeningStock(point)}</span></div>
        <div className="text-slate-600">销售消耗率：<span className="font-medium text-slate-900">{formatChartRatePercent(point.ratePercent)}</span></div>
        <div className="text-slate-600">样品消耗：<span className="font-medium text-slate-900">{point.sampleConsumedQty} 件</span></div>
        <div className="text-slate-600">周中补货：<span className="font-medium text-slate-900">{point.hasReplenishment ? '是' : '否'}</span></div>
        <div className="text-slate-600">周中人工调整：<span className="font-medium text-slate-900">{point.hasManualAdjustment ? '是' : '否'}</span></div>
        {point.openingStockStatus !== 'ok' && (
          <div className="mt-1 text-amber-700">
            {point.openingStockStatus === 'zero' ? '周初库存为 0，消耗率无法计算。' : '缺少周初库存，消耗率无法计算。'}
          </div>
        )}
      </div>
    )
  }

  const getWeeklyChangeTextClass = (value: number | null) => {
    if (value === null || value === 0) return 'text-slate-600'
    return value > 0 ? 'text-emerald-700' : 'text-red-700'
  }

  const getWeeklyRankingItems = () => {
    if (!weeklyConsumption) return []
    if (weeklyRankingTab === 'growth') return weeklyConsumption.rankingByGrowth || []
    if (weeklyRankingTab === 'decline') return weeklyConsumption.rankingByDecline || []
    return weeklyConsumption.rankingByLatestCompleteWeekSales || []
  }

  const getReminderBadgeClass = (reminder: string) => {
    if (reminder.includes('无平台快照')) return 'bg-sky-100 text-sky-700 border border-sky-200'
    if (reminder.includes('未同步')) return 'bg-amber-100 text-amber-700 border border-amber-200'
    if (reminder.includes('差异')) return 'bg-rose-100 text-rose-700 border border-rose-200'
    if (reminder.includes('异常')) return 'bg-violet-100 text-violet-700 border border-violet-200'
    return 'bg-slate-100 text-slate-700 border border-slate-200'
  }

  const filteredBaselines = stockBaselines.filter((item) => (
    baselineFormMode === 'bulk' || !baselineFormSku || item.sku === baselineFormSku
  ))
  const filteredAdjustments = stockAdjustments.filter((item) => (
    adjustmentFormMode === 'bulk' || !adjustmentFormSku || item.sku === adjustmentFormSku
  ))

  return (
    <PageGuard>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">产品销售库存</h1>
                <p className="text-slate-600 mt-2">查看产品销售趋势和库存现状</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleImportInventory}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-200 text-slate-500 text-sm font-medium disabled:opacity-80"
                  disabled
                  title="库存导入已迁移至库存与订货中心"
                >
                  库存导入已迁移
                </button>
                <button
                  onClick={openStockBaselineModal}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
                  disabled={loading || savingBaseline}
                >
                  设置初始库存
                </button>
                <button
                  onClick={() => void openStockAdjustmentModal()}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
                  disabled={loading || savingAdjustment}
                >
                  补货/调整库存
                </button>
                <button
                  onClick={openRankSettingsModal}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
                  disabled={loading || savingRankSettings}
                >
                  等级设置
                </button>
                <button
                  onClick={() => void handleOpenReconcilePreview()}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-sm font-medium hover:bg-sky-100 disabled:opacity-60"
                  disabled={loading || reconcilePreviewLoading}
                >
                  {reconcilePreviewLoading ? '正在生成校准预览...' : '按平台库存校准'}
                </button>
                <button
                  onClick={handleImportSkus}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium hover:bg-emerald-100 disabled:opacity-60"
                  disabled={checkingSkuImport || importingSkus || importingInventory || importingOrders || loading}
                >
                  {checkingSkuImport ? '预检查 SKU 中...' : importingSkus ? '导入 SKU 中...' : '导入/补齐产品 SKU'}
                </button>
                <button
                  onClick={() => handleImportOrders('import')}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
                  disabled={importingOrders || importingInventory || loading}
                >
                  {importingOrders ? '正在导入订单表...' : '导入订单表'}
                </button>
                <button
                  onClick={() => handleImportOrders('dryRun')}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium hover:bg-amber-100 disabled:opacity-60"
                  disabled={importingOrders || importingInventory || loading}
                >
                  {importingOrders ? '测试中...' : '测试解析订单表'}
                </button>
                <button
                  onClick={() => handleImportOrders('checkOnly')}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-sm font-medium hover:bg-sky-100 disabled:opacity-60"
                  disabled={importingOrders || importingInventory || loading}
                >
                  {importingOrders ? '检测中...' : '检测订单 SKU 匹配'}
                </button>
              </div>
              {activeUiStates.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  页面状态：
                  {' '}
                  {activeUiStates.map(([label]) => label).join(' / ')}
                </div>
              )}
              <div className="mt-3 text-xs text-slate-500">
                导入订单表、库存表、SKU 补齐均支持 CSV / XLSX / XLS。
              </div>
              {reconcilePreviewError && (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {reconcilePreviewError}
                </div>
              )}
            </div>
          </div>

          <input
            ref={inventoryInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleInventoryFileChange}
          />
          <input
            ref={ordersInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleOrdersFileChange}
          />
          <input
            ref={skuImportInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleSkuImportFileChange}
          />

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {importResult && (
            <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">库存导入完成</span>
                <span>成功 {importResult.successCount} 条</span>
                <span>更新已有产品 {importResult.updatedExistingCount || 0} 条</span>
                <span>自动补齐 SKU {importResult.autoFilledSkuCount || 0} 条</span>
                <span>自动创建产品 {importResult.autoCreatedCount || 0} 条</span>
                <span>人工确认 {importResult.reviewCount || 0} 条</span>
                <span>失败 {importResult.failureCount} 条</span>
              </div>
              {importResult.hint && (
                <div className="mt-2 text-sm text-amber-700">{importResult.hint}</div>
              )}
              {importResult.failures.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-3 py-2">行号</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">失败原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.failures.map((item, index) => (
                        <tr key={`${item.row}-${item.sku}-${index}`} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-700">{item.row}</td>
                          <td className="px-3 py-2 text-slate-700">{item.sku || '-'}</td>
                          <td className="px-3 py-2 text-red-600">{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {inventoryError && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {inventoryError}
            </div>
          )}

          {skuImportResult && (
            <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{formatSkuImportTitle(skuImportResult.mode)}</span>
                <span>阶段 {skuImportResult.stage || '-'}</span>
                <span>文件 {skuImportResult.fileName || '-'}</span>
                <span>读取行数 {skuImportResult.totalRows}</span>
                <span>文件内 SKU 数 {skuImportResult.extractedSkuCount}</span>
                <span>去重后 SKU 数 {skuImportResult.uniqueSkuCount}</span>
                <span>已存在主 SKU 数 {skuImportResult.existingSkuCount}</span>
                <span>已存在别称 SKU 数 {skuImportResult.existingAliasSkuCount || 0}</span>
                <span>从 Product.sku 括号识别出的别称 SKU 数 {skuImportResult.productSkuParenthesisAliasSkuCount || 0}</span>
                <span>从 Product.name 括号识别出的别称 SKU 数 {skuImportResult.productNameParenthesisAliasSkuCount || 0}</span>
                <span>可新建 SKU 数 {skuImportResult.newSkuCount}</span>
                <span>可补齐空 SKU 数 {skuImportResult.fillableSkuCount || 0}</span>
                <span>文件内重复 SKU 数 {skuImportResult.duplicateInFileCount}</span>
                <span>疑似重复数量 {skuImportResult.suspiciousCount}</span>
                {skuImportResult.mode === 'import' && (
                  <span>实际新建 SKU 数 {skuImportResult.createdCount || 0}</span>
                )}
                {skuImportResult.mode === 'import' && (
                  <span>实际补齐 SKU 数 {skuImportResult.filledCount || 0}</span>
                )}
                {skuImportResult.mode === 'import' && (
                  <span>实际创建别称 SKU 数 {skuImportResult.aliasCreatedCount || 0}</span>
                )}
              </div>
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                新建产品将默认使用 SKU 作为产品名称，后续可在产品库中补充真实名称、颜色、长度和图片。
              </div>
              {((skuImportResult.existingAliasSkuCount || 0) > 0 || (skuImportResult.aliasMatchedSkuCount || 0) > 0) && (
                <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                  检测到部分 SKU 已作为产品别称存在，不会重复创建产品。
                </div>
              )}
              {skuImportResult.mode === 'dryRun' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => void handleConfirmSkuImport()}
                    className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                    disabled={!pendingSkuImportFile || importingSkus}
                  >
                    {importingSkus ? '导入 SKU 中...' : '确认导入 SKU'}
                  </button>
                  <button
                    onClick={handleImportSkus}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    disabled={checkingSkuImport || importingSkus}
                  >
                    重新选择文件
                  </button>
                </div>
              )}
              {skuImportResult.newSkus.length > 0 && (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <div className="font-medium">新增 SKU 列表</div>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{skuImportResult.newSkus.join('\n')}</pre>
                </div>
              )}
              {skuImportResult.fillableSkus && skuImportResult.fillableSkus.length > 0 && (
                <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
                  <div className="font-medium">可补齐空 SKU 列表</div>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{skuImportResult.fillableSkus.join('\n')}</pre>
                </div>
              )}
              {skuImportResult.existingSkus.length > 0 && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <div className="font-medium">已存在主 SKU 列表</div>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{skuImportResult.existingSkus.join('\n')}</pre>
                </div>
              )}
              {skuImportResult.existingAliasSkus && skuImportResult.existingAliasSkus.length > 0 && (
                <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
                  <div className="font-medium">已存在别称 SKU 列表</div>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{skuImportResult.existingAliasSkus.join('\n')}</pre>
                </div>
              )}
              {skuImportResult.productSkuParenthesisAliasSkus && skuImportResult.productSkuParenthesisAliasSkus.length > 0 && (
                <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">
                  <div className="font-medium">从 Product.sku 括号识别出的 SKU 别称</div>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{skuImportResult.productSkuParenthesisAliasSkus.join('\n')}</pre>
                </div>
              )}
              {skuImportResult.productNameParenthesisAliasSkus && skuImportResult.productNameParenthesisAliasSkus.length > 0 && (
                <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800">
                  <div className="font-medium">从 Product.name 括号识别出的 SKU 别称</div>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{skuImportResult.productNameParenthesisAliasSkus.join('\n')}</pre>
                </div>
              )}
              {skuImportResult.suspiciousRows.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <div className="mb-2 text-sm font-medium text-slate-900">疑似重复列表</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-3 py-2">行号</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">商品名称</th>
                        <th className="px-3 py-2">原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skuImportResult.suspiciousRows.map((item, index) => (
                        <tr key={`sku-suspicious-${item.row}-${item.sku}-${index}`} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-700">{item.row}</td>
                          <td className="px-3 py-2 text-slate-700">{item.sku || '-'}</td>
                          <td className="px-3 py-2 text-slate-700">{item.productName || '-'}</td>
                          <td className="px-3 py-2 text-amber-700">{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {skuImportResult.skippedRows.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <div className="mb-2 text-sm font-medium text-slate-900">跳过行</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-3 py-2">行号</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">商品名称</th>
                        <th className="px-3 py-2">原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skuImportResult.skippedRows.map((item, index) => (
                        <tr key={`sku-skipped-${item.row}-${item.sku}-${index}`} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-700">{item.row}</td>
                          <td className="px-3 py-2 text-slate-700">{item.sku || '-'}</td>
                          <td className="px-3 py-2 text-slate-700">{item.productName || '-'}</td>
                          <td className="px-3 py-2 text-slate-500">{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {skuImportResult.failedRows.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <div className="mb-2 text-sm font-medium text-slate-900">失败行</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-3 py-2">行号</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">商品名称</th>
                        <th className="px-3 py-2">原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skuImportResult.failedRows.map((item, index) => (
                        <tr key={`sku-failed-${item.row}-${item.sku}-${index}`} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-700">{item.row}</td>
                          <td className="px-3 py-2 text-slate-700">{item.sku || '-'}</td>
                          <td className="px-3 py-2 text-slate-700">{item.productName || '-'}</td>
                          <td className="px-3 py-2 text-red-600">{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {skuImportError && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {skuImportError}
            </div>
          )}

          {ordersImportResult && (
            <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{formatOrderImportTitle(ordersImportResult.mode)}</span>
                <span>阶段 {ordersImportResult.stage || '-'}</span>
                <span>文件 {ordersImportResult.fileName || '-'}</span>
                <span>读取订单行数 {ordersImportResult.totalOrderRows} 行</span>
                <span>解析行数 {ordersImportResult.parsedRows || 0}</span>
                <span>有效订单行数 {ordersImportResult.validRows || 0}</span>
                <span>本次文件订单明细数 {ordersImportResult.orderItemCount || 0}</span>
                <span>文件内重复订单数 {ordersImportResult.duplicateInFileCount || 0}</span>
                <span>唯一 SKU {ordersImportResult.uniqueSkuCount || 0}</span>
                {typeof ordersImportResult.matchedSkuCount === 'number' && (
                  <span>匹配 SKU {ordersImportResult.matchedSkuCount}</span>
                )}
                {typeof ordersImportResult.missingSkuCount === 'number' && (
                  <span>缺失 SKU {ordersImportResult.missingSkuCount}</span>
                )}
                {ordersImportResult.mode === 'import' && (
                  <span>新增订单明细 {ordersImportResult.insertedOrderItemCount || 0} 条</span>
                )}
                {ordersImportResult.mode === 'import' && (
                  <span>更新已有订单明细 {ordersImportResult.updatedOrderItemCount || 0} 条</span>
                )}
                {ordersImportResult.mode === 'import' ? (
                  <span>成功汇总写入 SKU+日期 {ordersImportResult.successCount} 条</span>
                ) : (
                  <span>文件内 SKU+日期 汇总 {ordersImportResult.aggregatedRecordCount || 0} 条</span>
                )}
                <span>毛销量 {ordersImportResult.totalGrossOrders}</span>
                <span>退货量 {ordersImportResult.totalReturnQty}</span>
                <span>净销量 {ordersImportResult.totalNetOrders}</span>
                <span>取消数量 {ordersImportResult.totalCanceledQty}</span>
                <span>库存消耗量 {ordersImportResult.totalStockConsumedQty}</span>
                <span>退款金额 {ordersImportResult.totalRefundAmount.toFixed(2)}</span>
                <span>已跳过 {ordersImportResult.skippedCount || 0} 行</span>
                <span>异常 {ordersImportResult.failedCount} 条</span>
              </div>
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                订单明细已按 Order ID + SKU ID 去重；当 SKU ID 为空时，会回退为 Order ID + Seller SKU。重复导入或重叠日期导入不会重复计算。
              </div>
              {ordersImportResult.hint && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  {ordersImportResult.hint}
                </div>
              )}
              {ordersImportResult.mode === 'import' && (
                <div className="mt-2 text-sm text-slate-700">
                  已完成订单明细去重并重算受影响日期的销量数据。
                  {ordersImportResult.missingSkuCount ? ` 有 ${ordersImportResult.missingSkuCount} 个 SKU 未在产品库中找到，请先补齐 Product.sku 后重新导入。` : ''}
                  {ordersImportResult.skippedCount ? ` 已跳过 ${ordersImportResult.skippedCount} 行 Seller SKU 为空的订单行。` : ''}
                  {ordersImportResult.staleRecordCount ? ` 已清理 ${ordersImportResult.staleRecordCount} 条不再匹配的 SKU+日期 汇总。` : ''}
                </div>
              )}
              {hasSampleStats(ordersImportResult) && (
                <div className="mt-4 rounded-xl border-2 border-violet-300 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-4 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-base font-semibold text-violet-950">样品单统计</div>
                      <div className="mt-1 text-sm text-violet-900/80">
                        样品单不计入销量与退款金额，但会单独统计寄样数量，并继续参与库存消耗计算。
                      </div>
                    </div>
                    <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
                      样品销量已从毛销量与净销量中排除
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-violet-200 bg-white px-4 py-3">
                      <div className="text-xs text-slate-500">样品订单行数</div>
                      <div className="mt-1 text-2xl font-semibold text-slate-900">{ordersImportResult.sampleRows || 0}</div>
                    </div>
                    <div className="rounded-lg border border-violet-200 bg-white px-4 py-3">
                      <div className="text-xs text-slate-500">样品总数量</div>
                      <div className="mt-1 text-2xl font-semibold text-slate-900">{ordersImportResult.sampleQty || 0}</div>
                    </div>
                    <div className="rounded-lg border border-violet-200 bg-white px-4 py-3">
                      <div className="text-xs text-slate-500">样品 SKU 数</div>
                      <div className="mt-1 text-2xl font-semibold text-slate-900">{ordersImportResult.sampleSkuCount || 0}</div>
                    </div>
                    <div className="rounded-lg border border-violet-200 bg-white px-4 py-3">
                      <div className="text-xs text-slate-500">样品收件人/达人数量</div>
                      <div className="mt-1 text-2xl font-semibold text-slate-900">{ordersImportResult.sampleRecipientCount || 0}</div>
                    </div>
                  </div>

                  {(ordersImportResult.sampleBySku?.length || 0) > 0 && (
                    <div className="mt-4 overflow-x-auto rounded-lg border border-violet-200 bg-white p-3">
                      <div className="mb-2 text-sm font-medium text-slate-900">按 SKU 样品统计</div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-violet-200 text-left text-slate-500">
                            <th className="px-3 py-2">SKU</th>
                            <th className="px-3 py-2">样品数量</th>
                            <th className="px-3 py-2">样品行数</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(ordersImportResult.sampleBySku || []).map((item) => (
                            <tr key={`sample-sku-top-${item.sku}`} className="border-b border-violet-100">
                              <td className="px-3 py-2 text-slate-700">{item.sku}</td>
                              <td className="px-3 py-2 text-slate-700">{item.sampleQty}</td>
                              <td className="px-3 py-2 text-slate-700">{item.sampleRows}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {(ordersImportResult.sampleByRecipient?.length || 0) > 0 && (
                    <div className="mt-4 overflow-x-auto rounded-lg border border-violet-200 bg-white p-3">
                      <div className="mb-2 text-sm font-medium text-slate-900">按达人/收件账号统计</div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-violet-200 text-left text-slate-500">
                            <th className="px-3 py-2">Buyer Username</th>
                            <th className="px-3 py-2">Buyer Nickname</th>
                            <th className="px-3 py-2">Recipient</th>
                            <th className="px-3 py-2">样品数量</th>
                            <th className="px-3 py-2">样品行数</th>
                            <th className="px-3 py-2">涉及 SKU</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(ordersImportResult.sampleByRecipient || []).map((item, index) => (
                            <tr key={`sample-recipient-top-${item.buyerUsername}-${item.recipient}-${index}`} className="border-b border-violet-100">
                              <td className="px-3 py-2 text-slate-700">{item.buyerUsername || 'unknown'}</td>
                              <td className="px-3 py-2 text-slate-700">{item.buyerNickname || '-'}</td>
                              <td className="px-3 py-2 text-slate-700">{item.recipient || '未知收件人'}</td>
                              <td className="px-3 py-2 text-slate-700">{item.sampleQty}</td>
                              <td className="px-3 py-2 text-slate-700">{item.sampleRows}</td>
                              <td className="px-3 py-2 text-slate-700">{item.skus.join('、') || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {(ordersImportResult.sampleByRecipientAndSku?.length || 0) > 0 && (
                    <details className="mt-4 rounded-lg border border-violet-200 bg-white p-3">
                      <summary className="cursor-pointer text-sm font-medium text-slate-900">
                        查看按达人 + SKU 明细
                      </summary>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-violet-200 text-left text-slate-500">
                              <th className="px-3 py-2">Buyer Username</th>
                              <th className="px-3 py-2">Buyer Nickname</th>
                              <th className="px-3 py-2">Recipient</th>
                              <th className="px-3 py-2">SKU</th>
                              <th className="px-3 py-2">样品数量</th>
                              <th className="px-3 py-2">样品行数</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(ordersImportResult.sampleByRecipientAndSku || []).map((item, index) => (
                              <tr key={`sample-recipient-sku-top-${item.buyerUsername}-${item.recipient}-${item.sku}-${index}`} className="border-b border-violet-100">
                                <td className="px-3 py-2 text-slate-700">{item.buyerUsername || 'unknown'}</td>
                                <td className="px-3 py-2 text-slate-700">{item.buyerNickname || '-'}</td>
                                <td className="px-3 py-2 text-slate-700">{item.recipient || '未知收件人'}</td>
                                <td className="px-3 py-2 text-slate-700">{item.sku}</td>
                                <td className="px-3 py-2 text-slate-700">{item.sampleQty}</td>
                                <td className="px-3 py-2 text-slate-700">{item.sampleRows}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </div>
              )}
              {ordersImportResult.missingSkus && ordersImportResult.missingSkus.length > 0 && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <div className="font-medium">缺失 SKU 列表</div>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{ordersImportResult.missingSkus.join('\n')}</pre>
                </div>
              )}
              {ordersImportResult.skippedRows && ordersImportResult.skippedRows.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <div className="mb-2 text-sm font-medium text-slate-900">已跳过行</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-3 py-2">行号</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Paid Time</th>
                        <th className="px-3 py-2">Quantity</th>
                        <th className="px-3 py-2">退货量</th>
                        <th className="px-3 py-2">原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersImportResult.skippedRows.map((item, index) => (
                        <tr key={`skipped-${item.row}-${item.sku}-${index}`} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-700">{item.row || '-'}</td>
                          <td className="px-3 py-2 text-slate-700">{item.sku || '-'}</td>
                          <td className="px-3 py-2 text-slate-700">{item.paidTime || '-'}</td>
                          <td className="px-3 py-2 text-slate-700">{item.quantity}</td>
                          <td className="px-3 py-2 text-slate-700">{item.returnQty}</td>
                          <td className="px-3 py-2 text-slate-500">{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {ordersImportResult.summaryByDate.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <div className="mb-2 text-sm font-medium text-slate-900">按日期汇总</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-3 py-2">日期</th>
                        <th className="px-3 py-2">毛销量</th>
                        <th className="px-3 py-2">退货量</th>
                        <th className="px-3 py-2">净销量</th>
                        <th className="px-3 py-2">取消数量</th>
                        <th className="px-3 py-2">库存消耗量</th>
                        <th className="px-3 py-2">退款金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersImportResult.summaryByDate.map((item) => (
                        <tr key={item.date} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-700">{item.date}</td>
                          <td className="px-3 py-2 text-slate-700">{item.grossOrders}</td>
                          <td className="px-3 py-2 text-slate-700">{item.returnQty}</td>
                          <td className="px-3 py-2 text-slate-700">{item.netOrders}</td>
                          <td className="px-3 py-2 text-slate-700">{item.canceledQty}</td>
                          <td className="px-3 py-2 text-slate-700">{item.stockConsumedQty}</td>
                          <td className="px-3 py-2 text-slate-700">{item.refundAmount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {ordersImportResult.summaryBySku.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <div className="mb-2 text-sm font-medium text-slate-900">按 SKU 汇总</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">毛销量</th>
                        <th className="px-3 py-2">退货量</th>
                        <th className="px-3 py-2">净销量</th>
                        <th className="px-3 py-2">取消数量</th>
                        <th className="px-3 py-2">库存消耗量</th>
                        <th className="px-3 py-2">退款金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersImportResult.summaryBySku.map((item) => (
                        <tr key={item.sku} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-700">{item.sku}</td>
                          <td className="px-3 py-2 text-slate-700">{item.grossOrders}</td>
                          <td className="px-3 py-2 text-slate-700">{item.returnQty}</td>
                          <td className="px-3 py-2 text-slate-700">{item.netOrders}</td>
                          <td className="px-3 py-2 text-slate-700">{item.canceledQty}</td>
                          <td className="px-3 py-2 text-slate-700">{item.stockConsumedQty}</td>
                          <td className="px-3 py-2 text-slate-700">{item.refundAmount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {ordersImportResult.failedRows.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <div className="mb-2 text-sm font-medium text-slate-900">异常明细</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-3 py-2">行号</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Paid Time</th>
                        <th className="px-3 py-2">Quantity</th>
                        <th className="px-3 py-2">退货量</th>
                        <th className="px-3 py-2">失败原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersImportResult.failedRows.map((item, index) => (
                        <tr key={`${item.row}-${item.sku}-${index}`} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-700">{item.row || '-'}</td>
                          <td className="px-3 py-2 text-slate-700">{item.sku || '-'}</td>
                          <td className="px-3 py-2 text-slate-700">{item.paidTime || '-'}</td>
                          <td className="px-3 py-2 text-slate-700">{item.quantity}</td>
                          <td className="px-3 py-2 text-slate-700">{item.returnQty}</td>
                          <td className="px-3 py-2 text-red-600">{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {ordersError && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {ordersError}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
                <p className="mt-4 text-slate-600">加载中...</p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 xl:flex-1">
                    <h2 className="whitespace-nowrap text-lg font-semibold text-slate-900">销售库存趋势</h2>
                    <p className="mt-1 truncate text-sm text-slate-600">{trendTitle}</p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center xl:max-w-[42rem] xl:flex-1 xl:justify-end">
                    <select
                      value={selectedGroupId}
                      onChange={(event) => {
                        const nextGroupId = event.target.value
                        setSelectedSku('')
                        setSelectedGroupId(nextGroupId)
                        void loadTrendData('', nextGroupId, trendRange, trendStartDate, trendEndDate)
                      }}
                      className={headerSelectClassName}
                    >
                      <option value="">全部分组</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedSku}
                      onChange={(event) => {
                        const nextSku = event.target.value
                        setSelectedGroupId('')
                        setSelectedSku(nextSku)
                        void loadTrendData(nextSku, '', trendRange, trendStartDate, trendEndDate)
                      }}
                      className={headerSelectClassName}
                    >
                      <option value="">全部 SKU</option>
                      {skuOptions.map((option) => (
                        <option key={option.sku} value={option.sku}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="inline-flex rounded-lg border border-slate-300 p-1">
                      <button
                        onClick={() => void applyTrendRange('today', '', '')}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                          trendRange === 'today' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        今日
                      </button>
                      <button
                        onClick={() => void applyTrendRange('7', '', '')}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                          trendRange === '7' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        最近 7 天
                      </button>
                      <button
                        onClick={() => void applyTrendRange('30', '', '')}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                          trendRange === '30' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        最近 30 天
                      </button>
                      <button
                        onClick={() => {
                          setTrendRange('custom')
                          setTrendFilterError(null)
                          if (trendStartDate) {
                            setCustomStartDate(trendStartDate)
                          }
                          if (trendEndDate) {
                            setCustomEndDate(trendEndDate)
                          }
                        }}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                          trendRange === 'custom' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        自定义时间
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setGroupManagerOpen(true)
                        resetGroupForm()
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 hover:bg-slate-50"
                    >
                      分组管理
                    </button>
                  </div>
                </div>

                {trendRange === 'custom' && (
                  <div className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-end">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-900">开始日期</label>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(event) => {
                          setCustomStartDate(event.target.value)
                          setTrendFilterError(null)
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-900">结束日期</label>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(event) => {
                          setCustomEndDate(event.target.value)
                          setTrendFilterError(null)
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => void applyTrendRange('custom', customStartDate, customEndDate)}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      查询
                    </button>
                  </div>
                )}

                {trendFilterError && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {trendFilterError}
                  </div>
                )}

                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  当前筛选汇总：毛销量 {trendSummary.grossOrders} ｜ 退货量 {trendSummary.returnQty} ｜ 净销量 {trendSummary.netOrders} ｜ 取消 {trendSummary.canceledQty} ｜ 退款金额 ${trendSummary.refundAmount.toFixed(2)}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                    <div className="mb-3">
                      <div className="text-sm font-medium text-slate-900">每日销量曲线</div>
                      <div className="text-xs text-slate-500">{trendTitle}</div>
                      <div className="mt-1 text-xs text-slate-500">销量展示的是订单销售统计；库存实际扣减请以下方系统预计库存曲线使用的库存消耗量为准。</div>
                    </div>
                    <div className="h-64">
                      {trendLoading ? (
                        <div className="flex h-full items-center justify-center text-sm text-slate-500">
                          趋势加载中...
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trends} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                            <Tooltip />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="orders"
                              name="每日销量"
                              stroke="#2563eb"
                              strokeWidth={2}
                              dot={{ r: 3 }}
                              activeDot={{ r: 5 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                    <div className="mb-3">
                      <div className="text-sm font-medium text-slate-900">每日预计剩余库存曲线</div>
                      <div className="text-xs text-slate-500">系统预计库存只使用手动初始库存和补货调整，并按库存消耗量扣减；未设置初始库存的 SKU 不计入系统预计库存主口径。</div>
                    </div>
                    <div className="h-64">
                      {trendLoading ? (
                        <div className="flex h-full items-center justify-center text-sm text-slate-500">
                          趋势加载中...
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trends} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                            <Tooltip />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="stock"
                              name="每日预计剩余库存"
                              stroke="#db2777"
                              strokeWidth={2}
                              dot={{ r: 3 }}
                              activeDot={{ r: 5 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">周销售消耗趋势</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      默认看最近 8 个完整自然周；销售消耗不含样品，样品仅参与库存余额重建。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setWeeklyMethodOpen((value) => !value)}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      查看口径
                    </button>
                    <button
                      onClick={() => setWeeklyConsumptionExpanded((value) => !value)}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {weeklyConsumptionExpanded ? '收起' : '展开'}
                    </button>
                  </div>
                </div>

                {weeklyMethodOpen && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    分子只统计普通真实销售订单的 ProductOrderItem.stockConsumedQty；样品不进入销售分子，但会作为真实库存消耗参与下一期周初库存重建。
                    消耗率只在周初库存可重建且大于 0 时计算；退货退款第一版不使用 netQty 抵消。
                  </div>
                )}

                {weeklyConsumptionError && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {weeklyConsumptionError}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm text-slate-500">上一个完整周真实销售消耗</div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">
                      {weeklyConsumptionLoading && !weeklyConsumption ? '加载中' : `${weeklyConsumption?.previousCompleteWeek?.ordinarySalesConsumedQty ?? 0} 件`}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {weeklyConsumption?.previousCompleteWeek ? `${weeklyConsumption.previousCompleteWeek.weekStart} ~ ${weeklyConsumption.previousCompleteWeek.weekEnd}` : '最近完整自然周'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm text-slate-500">较前一个完整周</div>
                    <div className={`mt-2 text-2xl font-bold ${getWeeklyChangeTextClass((weeklyConsumption?.previousCompleteWeek?.ordinarySalesConsumedQty ?? 0) - (weeklyConsumption?.weekBeforePrevious?.ordinarySalesConsumedQty ?? 0))}`}>
                      {formatSignedNumber((weeklyConsumption?.previousCompleteWeek?.ordinarySalesConsumedQty ?? 0) - (weeklyConsumption?.weekBeforePrevious?.ordinarySalesConsumedQty ?? 0))} 件
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {weeklyConsumption?.weekBeforePrevious ? `对比 ${weeklyConsumption.weekBeforePrevious.weekStart} ~ ${weeklyConsumption.weekBeforePrevious.weekEnd}` : '数据不足'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm text-slate-500">完整周加权销售消耗率</div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">
                      {formatWeeklyPercent(weeklyConsumption?.previousCompleteWeek?.weightedSalesConsumptionRate ?? null)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      分母 {weeklyConsumption?.previousCompleteWeek?.denominatorOpeningStock ?? 0} 件
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm text-slate-500">有效 SKU 数</div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">
                      {weeklyConsumption?.previousCompleteWeek?.validSkuCount ?? 0} 个
                    </div>
                    <div className="mt-1 text-xs text-slate-500">周初库存可重建且大于 0</div>
                  </div>
                </div>

                {weeklyConsumption?.currentWeekRange && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <div className="flex flex-col gap-2 text-sm md:flex-row md:items-center md:justify-between">
                      <div className="font-medium text-slate-900">
                        本周进度：第 {getInclusiveDayCount(weeklyConsumption.currentWeekRange.startDate, weeklyConsumption.currentWeekRange.endDate)} 天 / 共 7 天
                      </div>
                      <div className="text-slate-600">
                        本周至今销售 {weeklyConsumption.summary?.currentWeekConsumedQty ?? 0} 件；上周同期 {weeklyConsumption.summary?.previousComparableConsumedQty ?? 0} 件；变化
                        <span className={`ml-1 font-semibold ${getWeeklyChangeTextClass(weeklyConsumption.summary?.consumedQtyChange ?? 0)}`}>
                          {formatSignedNumber(weeklyConsumption.summary?.consumedQtyChange ?? 0)} 件
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {weeklyConsumption.currentWeekRange.startDate} ～ {weeklyConsumption.currentWeekRange.endDate}
                      {' '}对比 {weeklyConsumption.previousComparableRange.startDate} ～ {weeklyConsumption.previousComparableRange.endDate}
                    </div>
                  </div>
                )}

                {weeklyConsumptionExpanded && (
                  <div className="mt-5 space-y-5">
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">最近 8 个完整周全店趋势</div>
                            <div className="text-xs text-slate-500">柱形为真实销售消耗件数，折线为全店加权销售消耗率。</div>
                          </div>
                        </div>
                        <div className="mt-4 h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                              data={(weeklyConsumption?.storeCompleteWeekTrend || []).map((point) => ({
                                ...point,
                                ratePercent: point.weightedSalesConsumptionRate === null ? null : Number((point.weightedSalesConsumptionRate * 100).toFixed(1)),
                              }))}
                              margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="label" interval={0} angle={-25} textAnchor="end" height={52} tick={{ fontSize: 10 }} />
                              <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 12 }} />
                              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={(value) => `${value}%`} />
                              <Tooltip content={renderStoreWeeklyTooltip} />
                              <Legend />
                              <Bar yAxisId="left" dataKey="ordinarySalesConsumedQty" name="销售消耗" fill="#2563eb" radius={[4, 4, 0, 0]} />
                              <Line
                                yAxisId="right"
                                type="linear"
                                dataKey="ratePercent"
                                name="加权消耗率"
                                stroke="#db2777"
                                strokeWidth={2}
                                connectNulls={false}
                                dot={{ r: 4 }}
                                activeDot={{ r: 6 }}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-semibold text-slate-900">规则结论</div>
                        <div className="mt-3 space-y-2">
                          {(weeklyConsumption?.storeTrendSummary || ['数据不足，暂不判断趋势。']).map((message) => (
                            <div key={message} className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
                              {message}
                            </div>
                          ))}
                        </div>
                        {weeklyConsumption?.summary?.currentWeekConsumedQty === 0 && (
                          <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                            本周数据尚少，当前展示最近完整周结果。
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200">
                      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">SKU 变化榜</div>
                          <div className="text-xs text-slate-500">最近完整周对比前一个完整周，默认最多展示前 5 名。</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { key: 'sales' as const, label: '销售最多' },
                            { key: 'growth' as const, label: '增长最快' },
                            { key: 'decline' as const, label: '放缓最多' },
                          ].map((tab) => (
                            <button
                              key={tab.key}
                              onClick={() => setWeeklyRankingTab(tab.key)}
                              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${weeklyRankingTab === tab.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {getWeeklyRankingItems().slice(0, 5).length === 0 ? (
                          <div className="px-4 py-6 text-sm text-slate-500">最近完整周暂无可展示排行。</div>
                        ) : (
                          getWeeklyRankingItems().slice(0, 5).map((item, index) => (
                            <button
                              key={`${weeklyRankingTab}-${item.productId}`}
                              onClick={() => void loadWeeklyConsumption(item.sku)}
                              className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left hover:bg-slate-50 md:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))]"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-900">#{index + 1} {item.sku}</div>
                                <div className="truncate text-xs text-slate-500">{item.productName}</div>
                              </div>
                              <div className="text-sm text-slate-700">最近周 <span className="font-semibold text-slate-900">{item.latestCompleteWeek.ordinarySalesConsumedQty}</span> 件</div>
                              <div className="text-sm text-slate-700">前一周 <span className="font-semibold text-slate-900">{item.previousCompleteWeek?.ordinarySalesConsumedQty ?? 0}</span> 件</div>
                              <div className={`text-sm font-semibold ${getWeeklyChangeTextClass(item.deltaQty)}`}>
                                {formatSignedNumber(item.deltaQty)} 件 / {formatGrowthRate(item.growthRate, item.growthLabel)}
                              </div>
                              <div className="text-sm text-slate-700">
                                消耗率 {formatWeeklyPercent(item.latestCompleteWeek.salesConsumptionRate)}｜库存 {item.currentAvailableStock ?? '—'}
                                {weeklyRankingTab === 'decline' && item.stockoutImpactLikely ? <span className="ml-2 text-xs text-red-600">可能缺货影响</span> : null}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">SKU 详情</div>
                          <div className="mt-1 text-xs text-slate-500">选择 SKU 后查看本周、上周同期和最近 8 个完整自然周。</div>
                        </div>
                        <select
                          value={weeklyConsumptionSku}
                          onChange={(event) => void loadWeeklyConsumption(event.target.value)}
                          className={headerSelectClassName}
                        >
                          <option value="">选择 SKU</option>
                          {skuOptions.map((option) => (
                            <option key={option.sku} value={option.sku}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {weeklyConsumptionLoading ? (
                        <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">周销售消耗趋势加载中...</div>
                      ) : weeklySelectedMetric ? (
                        <div className="mt-4 space-y-4">
                          <div className="rounded-lg border border-slate-200 bg-white p-4">
                            <div className="text-sm font-semibold text-slate-900">运营结论</div>
                            <div className="mt-3 space-y-2">
                              {weeklySelectedMetric.trendSummary.map((message) => (
                                <div key={message} className="text-sm text-slate-700">{message}</div>
                              ))}
                            </div>
                            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                              {weeklySelectedMetric.missingOpeningStockWeekCount > 0
                                ? `该 SKU 有 ${weeklySelectedMetric.missingOpeningStockWeekCount} 个历史周无法计算销售消耗率。最早可用库存锚点为 ${weeklySelectedMetric.earliestValidOpeningStockWeek || '暂无'}，缺失周期仅展示销售件数。`
                                : '该 SKU 最近完整周均可重建周初库存，可同时查看销量和销售消耗率。'}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
                            <div className="rounded-lg bg-white p-3">
                              <div className="text-xs text-slate-500">最近完整周销售</div>
                              <div className="mt-1 text-lg font-semibold text-slate-900">{weeklySelectedMetric.latestCompleteWeek?.ordinarySalesConsumedQty ?? 0} 件</div>
                            </div>
                            <div className="rounded-lg bg-white p-3">
                              <div className="text-xs text-slate-500">最近完整周周初库存</div>
                              <div className="mt-1 text-lg font-semibold text-slate-900">{weeklySelectedMetric.latestCompleteWeek ? formatOpeningStock(weeklySelectedMetric.latestCompleteWeek) : '—'}</div>
                            </div>
                            <div className="rounded-lg bg-white p-3">
                              <div className="text-xs text-slate-500">最近完整周消耗率</div>
                              <div className="mt-1 text-lg font-semibold text-slate-900">{formatWeeklyPercent(weeklySelectedMetric.latestCompleteWeek?.salesConsumptionRate ?? null)}</div>
                            </div>
                            <div className="rounded-lg bg-white p-3">
                              <div className="text-xs text-slate-500">前一完整周销售</div>
                              <div className="mt-1 text-lg font-semibold text-slate-900">{weeklySelectedMetric.previousCompleteWeek?.ordinarySalesConsumedQty ?? 0} 件</div>
                            </div>
                            <div className="rounded-lg bg-white p-3">
                              <div className="text-xs text-slate-500">当前库存</div>
                              <div className="mt-1 text-lg font-semibold text-slate-900">{weeklySelectedMetric.currentAvailableStock ?? '—'} 件</div>
                            </div>
                            <div className="rounded-lg bg-white p-3">
                              <div className="text-xs text-slate-500">预计可售周数</div>
                              <div className="mt-1 text-lg font-semibold text-slate-900">{formatWeeksOfSupply(weeklySelectedMetric.estimatedWeeksOfSupply)}</div>
                            </div>
                          </div>

                          <div className="rounded-lg border border-slate-200 bg-white p-4">
                            <div className="text-sm font-semibold text-slate-900">最近 8 个完整周 SKU 趋势</div>
                            <div className="mt-4 h-72">
                              <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart
                                  data={weeklySelectedMetric.recentCompleteWeeks.map((point) => ({
                                    ...point,
                                    ratePercent: point.salesConsumptionRate === null ? null : Number((point.salesConsumptionRate * 100).toFixed(1)),
                                  }))}
                                  margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                  <XAxis dataKey="label" interval={0} angle={-25} textAnchor="end" height={52} tick={{ fontSize: 10 }} />
                                  <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 12 }} />
                                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={(value) => `${value}%`} />
                                  <Tooltip content={renderSkuWeeklyTooltip} />
                                  <Legend />
                                  <Bar yAxisId="left" dataKey="ordinarySalesConsumedQty" name="销售消耗" fill="#2563eb" radius={[4, 4, 0, 0]} />
                                  <Line
                                    yAxisId="right"
                                    type="linear"
                                    dataKey="ratePercent"
                                    name="销售消耗率"
                                    stroke="#db2777"
                                    strokeWidth={2}
                                    connectNulls={false}
                                    dot={{ r: 4 }}
                                    activeDot={{ r: 6 }}
                                  />
                                </ComposedChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {weeklySelectedMetric.recentCompleteWeeks
                                .filter((point) => point.flags.length > 0)
                                .map((point) => (
                                  <span key={`${point.weekStart}-flags`} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                                    {point.label}: {point.flags.join(' / ')}
                                  </span>
                                ))}
                            </div>
                          </div>

                          <div className="rounded-lg border border-slate-200 bg-white">
                            <button
                              onClick={() => setWeeklyDetailOpen((value) => !value)}
                              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50"
                            >
                              <span>查看每周明细</span>
                              <span className="text-xs text-slate-500">{weeklyDetailOpen ? '收起' : '展开'}</span>
                            </button>
                            {weeklyDetailOpen && (
                              <div className="overflow-x-auto border-t border-slate-200">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                                      <th className="px-4 py-3">周期</th>
                                      <th className="px-4 py-3">周初库存</th>
                                      <th className="px-4 py-3">普通销售消耗</th>
                                      <th className="px-4 py-3">销售消耗率</th>
                                      <th className="px-4 py-3">样品消耗</th>
                                      <th className="px-4 py-3">异常标记</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {weeklySelectedMetric.recentCompleteWeeks.map((point) => (
                                      <tr key={point.weekStart} className="border-b border-slate-100">
                                        <td className="px-4 py-3 text-slate-700">{point.label}</td>
                                        <td className="px-4 py-3 text-slate-700">{formatOpeningStock(point)}</td>
                                        <td className="px-4 py-3 font-semibold text-slate-900">{point.ordinarySalesConsumedQty}</td>
                                        <td className="px-4 py-3 text-slate-700">{formatWeeklyPercent(point.salesConsumptionRate)}</td>
                                        <td className="px-4 py-3 text-slate-700">{point.sampleConsumedQty}</td>
                                        <td className="px-4 py-3 text-slate-500">{point.flags.length > 0 ? point.flags.join(' / ') : '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                          请选择一个 SKU 查看详情。
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-8 rounded-lg border border-violet-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-base font-semibold text-slate-900">样品统计</div>
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
                      {formatTrendRangeLabel(sampleStatsRange, sampleStatsStartDate, sampleStatsEndDate)}
                    </span>
                    <span className="text-sm text-slate-600">样品 {sampleStats?.totalSampleQty || 0} 件</span>
                    <span className="text-sm text-slate-600">订单行 {sampleStats?.sampleRows || 0} 行</span>
                  </div>
                  <button
                    onClick={() => setSampleStatsExpanded((value) => !value)}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {sampleStatsExpanded ? '收起' : '展开'}
                  </button>
                </div>

                {sampleStatsExpanded && sampleStatsRange === 'custom' && (
                  <div className="mt-4 flex flex-col gap-3 rounded-lg border border-violet-200 bg-violet-50 p-4 lg:flex-row lg:items-end">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-900">开始日期</label>
                      <input
                        type="date"
                        value={sampleStatsCustomStartDate}
                        onChange={(event) => {
                          setSampleStatsCustomStartDate(event.target.value)
                          setSampleStatsError(null)
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-900">结束日期</label>
                      <input
                        type="date"
                        value={sampleStatsCustomEndDate}
                        onChange={(event) => {
                          setSampleStatsCustomEndDate(event.target.value)
                          setSampleStatsError(null)
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => void applySampleStatsRange('custom', sampleStatsCustomStartDate, sampleStatsCustomEndDate, sampleStatsSku)}
                      className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800"
                    >
                      查询
                    </button>
                  </div>
                )}

                {sampleStatsError && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {sampleStatsError}
                  </div>
                )}

                {sampleStatsExpanded && (
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <select
                      value={sampleStatsSku}
                      onChange={(event) => {
                        const nextSku = event.target.value
                        setSampleStatsSku(nextSku)
                        void loadSampleStats(sampleStatsRange, nextSku, sampleStatsStartDate, sampleStatsEndDate)
                      }}
                      className={headerSelectClassName}
                    >
                      <option value="">全部 SKU</option>
                      {skuOptions.map((option) => (
                        <option key={`persistent-sample-option-${option.sku}`} value={option.sku}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="inline-flex rounded-lg border border-slate-300 p-1">
                      <button
                        onClick={() => void applySampleStatsRange('today', '', '', sampleStatsSku)}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                          sampleStatsRange === 'today' ? 'bg-violet-700 text-white' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        今日
                      </button>
                      <button
                        onClick={() => void applySampleStatsRange('7', '', '', sampleStatsSku)}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                          sampleStatsRange === '7' ? 'bg-violet-700 text-white' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        最近 7 天
                      </button>
                      <button
                        onClick={() => void applySampleStatsRange('30', '', '', sampleStatsSku)}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                          sampleStatsRange === '30' ? 'bg-violet-700 text-white' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        最近 30 天
                      </button>
                      <button
                        onClick={() => {
                          setSampleStatsRange('custom')
                          setSampleStatsError(null)
                          if (sampleStatsStartDate) {
                            setSampleStatsCustomStartDate(sampleStatsStartDate)
                          }
                          if (sampleStatsEndDate) {
                            setSampleStatsCustomEndDate(sampleStatsEndDate)
                          }
                        }}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                          sampleStatsRange === 'custom' ? 'bg-violet-700 text-white' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        自定义时间
                      </button>
                    </div>
                  </div>
                )}

                {sampleStatsExpanded && sampleStatsLoading ? (
                  <div className="mt-6 text-sm text-slate-500">样品统计加载中...</div>
                ) : sampleStatsExpanded ? (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
                        <div className="text-xs text-slate-500">样品订单行数</div>
                        <div className="mt-1 text-2xl font-semibold text-slate-900">{sampleStats?.sampleRows || 0}</div>
                      </div>
                      <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
                        <div className="text-xs text-slate-500">样品总数量</div>
                        <div className="mt-1 text-2xl font-semibold text-slate-900">{sampleStats?.totalSampleQty || 0}</div>
                      </div>
                      <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
                        <div className="text-xs text-slate-500">样品 SKU 数</div>
                        <div className="mt-1 text-2xl font-semibold text-slate-900">{sampleStats?.sampleSkuCount || 0}</div>
                      </div>
                      <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
                        <div className="text-xs text-slate-500">样品收件人/达人数量</div>
                        <div className="mt-1 text-2xl font-semibold text-slate-900">{sampleStats?.sampleRecipientCount || 0}</div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 text-sm font-medium text-slate-900">按 SKU 样品统计</div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-left text-slate-500">
                              <th className="px-3 py-2">SKU</th>
                              <th className="px-3 py-2">样品数量</th>
                              <th className="px-3 py-2">样品行数</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(sampleStats?.sampleBySku || []).slice(0, 20).map((item) => (
                              <tr key={`persistent-sample-sku-${item.sku}`} className="border-b border-slate-100">
                                <td className="px-3 py-2 text-slate-700">
                                  <div>{item.sku}</div>
                                  {(item.originalSellerSkus?.length || 0) > 0 && (
                                    <div className="mt-1 text-xs text-slate-400">
                                      原始 SKU：
                                      {' '}
                                      {item.originalSellerSkus?.join('、')}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-slate-700">{item.sampleQty}</td>
                                <td className="px-3 py-2 text-slate-700">{item.sampleRows}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 text-sm font-medium text-slate-900">按达人/收件账号统计</div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-left text-slate-500">
                              <th className="px-3 py-2">Buyer Username</th>
                              <th className="px-3 py-2">Buyer Nickname</th>
                              <th className="px-3 py-2">Recipient</th>
                              <th className="px-3 py-2">样品数量</th>
                              <th className="px-3 py-2">样品行数</th>
                              <th className="px-3 py-2">涉及 SKU</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(sampleStats?.sampleByRecipient || []).slice(0, 20).map((item, index) => (
                              <tr key={`persistent-sample-recipient-${item.buyerUsername}-${item.recipient}-${index}`} className="border-b border-slate-100">
                                <td className="px-3 py-2 text-slate-700">{item.buyerUsername || 'unknown'}</td>
                                <td className="px-3 py-2 text-slate-700">{item.buyerNickname || '-'}</td>
                                <td className="px-3 py-2 text-slate-700">{item.recipient || '未知收件人'}</td>
                                <td className="px-3 py-2 text-slate-700">{item.sampleQty}</td>
                                <td className="px-3 py-2 text-slate-700">{item.sampleRows}</td>
                                <td className="px-3 py-2 text-slate-700">{item.skus.join('、') || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {(sampleStats?.sampleByRecipientAndSku?.length || 0) > 0 && (
                      <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <summary className="cursor-pointer text-sm font-medium text-slate-900">
                          查看按达人 + SKU 明细
                        </summary>
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 text-left text-slate-500">
                                <th className="px-3 py-2">Buyer Username</th>
                                <th className="px-3 py-2">Buyer Nickname</th>
                                <th className="px-3 py-2">Recipient</th>
                                <th className="px-3 py-2">SKU</th>
                                <th className="px-3 py-2">样品数量</th>
                                <th className="px-3 py-2">样品行数</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(sampleStats?.sampleByRecipientAndSku || []).slice(0, 20).map((item, index) => (
                                <tr key={`persistent-sample-recipient-sku-${item.buyerUsername}-${item.recipient}-${item.sku}-${index}`} className="border-b border-slate-100">
                                  <td className="px-3 py-2 text-slate-700">{item.buyerUsername || 'unknown'}</td>
                                  <td className="px-3 py-2 text-slate-700">{item.buyerNickname || '-'}</td>
                                  <td className="px-3 py-2 text-slate-700">{item.recipient || '未知收件人'}</td>
                                  <td className="px-3 py-2 text-slate-700">{item.sku}</td>
                                  <td className="px-3 py-2 text-slate-700">{item.sampleQty}</td>
                                  <td className="px-3 py-2 text-slate-700">{item.sampleRows}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    )}
                  </>
                ) : null}
              </div>

              {stockBaselineOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
                  onClick={closeStockBaselineModal}
                >
                  <div
                    className="w-full max-w-6xl max-h-[calc(100vh-2rem)] overflow-hidden rounded-xl bg-white p-6 shadow-xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">设置初始库存</h3>
                        <p className="mt-1 text-sm text-slate-600">手动设置某个 SKU 的理论库存起点，趋势图会优先按这个基准减去库存消耗量。</p>
                      </div>
                      <button
                        onClick={closeStockBaselineModal}
                        className="text-sm text-slate-500 hover:text-slate-700"
                        disabled={savingBaseline}
                      >
                        关闭
                      </button>
                    </div>

                    <div className="mt-5 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
                      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
                      <div className="rounded-lg border border-slate-200 p-4">
                        <div className="space-y-4">
                          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                            <button
                              onClick={() => {
                                setBaselineFormMode('single')
                                setBaselineError(null)
                                setBaselineSaveSummary(null)
                              }}
                              className={`rounded-md px-3 py-1.5 text-sm font-medium ${baselineFormMode === 'single' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                              disabled={savingBaseline}
                            >
                              单个设置
                            </button>
                            <button
                              onClick={() => {
                                setBaselineFormMode('bulk')
                                setBaselineError(null)
                                setBaselineSaveSummary(null)
                              }}
                              className={`rounded-md px-3 py-1.5 text-sm font-medium ${baselineFormMode === 'bulk' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                              disabled={savingBaseline}
                            >
                              批量设置
                            </button>
                          </div>

                          {baselineFormMode === 'single' ? (
                            <>
                              <div>
                                <label className="mb-2 block text-sm font-medium text-slate-900">SKU</label>
                                <select
                                  value={baselineFormSku}
                                  onChange={(event) => {
                                    setBaselineFormSku(event.target.value)
                                    setBaselineError(null)
                                    setBaselineSaveSummary(null)
                                  }}
                                  className={skuSelectClassName}
                                  disabled={savingBaseline}
                                >
                                  <option value="">请选择 SKU</option>
                                  {skuOptions.map((option) => (
                                    <option key={option.sku} value={option.sku}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="mb-2 block text-sm font-medium text-slate-900">初始库存</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  inputMode="numeric"
                                  value={baselineFormQuantity}
                                  onChange={(event) => {
                                    setBaselineFormQuantity(event.target.value)
                                    setBaselineError(null)
                                    setBaselineSaveSummary(null)
                                  }}
                                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                                  placeholder="请输入初始库存"
                                  disabled={savingBaseline}
                                />
                              </div>
                            </>
                          ) : (
                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-900">批量初始库存</label>
                              <textarea
                                value={baselineBulkText}
                                onChange={(event) => {
                                  setBaselineBulkText(event.target.value)
                                  setBaselineError(null)
                                  setBaselineSaveSummary(null)
                                }}
                                rows={8}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                                placeholder={`SMH-12 100 2026-05-20\nSM412-8 50 2026-05-21\nRM4263 30`}
                                disabled={savingBaseline}
                              />
                              <p className="mt-1 text-xs text-slate-500">每行一个 SKU、数量，可选日期。支持空格、逗号或 Tab 分隔。如果不填日期，则使用下方统一基准日期。</p>
                            </div>
                          )}

                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-900">基准日期</label>
                            <input
                              type="date"
                              value={baselineFormDate}
                              onChange={(event) => {
                                setBaselineFormDate(event.target.value)
                                setBaselineError(null)
                                setBaselineSaveSummary(null)
                              }}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                              disabled={savingBaseline}
                            />
                            <p className="mt-1 text-xs text-slate-500">基准日期表示当天开始时的库存。</p>
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-900">备注</label>
                            <textarea
                              value={baselineFormNote}
                              onChange={(event) => {
                                setBaselineFormNote(event.target.value)
                                setBaselineError(null)
                                setBaselineSaveSummary(null)
                              }}
                              rows={3}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                              placeholder="可选，例如：5 月活动前盘点"
                              disabled={savingBaseline}
                            />
                          </div>

                          {baselineError && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                              {baselineError}
                            </div>
                          )}

                          <div className="flex justify-end gap-3">
                            <button
                              onClick={() => resetBaselineForm(baselineFormSku)}
                              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                              disabled={savingBaseline}
                            >
                              重置
                            </button>
                            <button
                              onClick={handleSaveBaseline}
                              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                              disabled={savingBaseline}
                            >
                              {savingBaseline ? '保存中...' : '保存'}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 p-4">
                        <div className="mb-3">
                          <div className="text-sm font-semibold text-slate-900">{baselineFormMode === 'bulk' ? '已设置的库存基准' : '当前 SKU 已设置的库存基准'}</div>
                          <div className="mt-1 text-xs text-slate-500">同一 SKU + 基准日期 重复保存时，会直接更新初始库存和备注。</div>
                        </div>

                        {filteredBaselines.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                            {baselineFormMode === 'bulk' ? '当前还没有手动初始库存基准。' : baselineFormSku ? '这个 SKU 还没有手动初始库存基准。' : '请先选择 SKU。'}
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 text-left text-slate-500">
                                  <th className="px-3 py-2">SKU</th>
                                  <th className="px-3 py-2">基准日期</th>
                                  <th className="px-3 py-2">初始库存</th>
                                  <th className="px-3 py-2">备注</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredBaselines.map((baseline) => (
                                  <tr key={baseline.id} className="border-b border-slate-100">
                                    <td className="px-3 py-2 text-slate-700">{baseline.sku}</td>
                                    <td className="px-3 py-2 text-slate-700">{baseline.baselineDate}</td>
                                    <td className="px-3 py-2 text-slate-700">{baseline.quantity}</td>
                                    <td className="px-3 py-2 text-slate-500">{baseline.note || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                      </div>

                      {baselineSaveSummary && (
                        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                          <div className="flex flex-wrap gap-3">
                            <span>原始行数 {baselineSaveSummary.rawRowCount || 0}</span>
                            <span>有效解析 {baselineSaveSummary.parsedCount || 0}</span>
                            <span>成功 {baselineSaveSummary.successCount}</span>
                            <span>更新 {baselineSaveSummary.updatedCount || 0}</span>
                            <span>新增 {(baselineSaveSummary.createdCount ?? Math.max(baselineSaveSummary.successCount - (baselineSaveSummary.updatedCount || 0), 0))}</span>
                            <span>失败 {baselineSaveSummary.failureCount}</span>
                            <span>输入重复 {baselineSaveSummary.duplicateInInputCount || 0}</span>
                            <span>自动合并 {baselineSaveSummary.mergedCount || 0}</span>
                            <span>自动修正 {baselineSaveSummary.autoCorrectedCount || 0}</span>
                            <span>疑似异常 {baselineSaveSummary.suspiciousCount || 0}</span>
                            <span>未匹配 SKU {baselineSaveSummary.unmatchedSkuCount || 0}</span>
                            <span>使用单独日期 {baselineSaveSummary.usedItemDateCount || 0}</span>
                            <span>使用统一日期 {baselineSaveSummary.usedDefaultDateCount || 0}</span>
                          </div>

                          {(baselineSaveSummary.duplicateRows?.length || 0) > 0 && (
                            <details className="mt-4 rounded-lg border border-emerald-200 bg-white" open>
                              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-900">重复行明细（保留最后一条）</summary>
                              <div className="overflow-x-auto border-t border-slate-200">
                                <table className="min-w-[880px] w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-left text-slate-500">
                                      <th className="px-3 py-2 whitespace-nowrap">原始行</th>
                                      <th className="px-3 py-2 whitespace-nowrap">标准化 SKU</th>
                                      <th className="px-3 py-2 whitespace-nowrap">日期</th>
                                      <th className="px-3 py-2 whitespace-nowrap">处理方式</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {baselineSaveSummary.duplicateRows?.map((item, index) => (
                                      <tr key={`${item.rawLine}-${item.normalizedSku}-${index}`} className="border-b border-slate-100 align-top">
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-600">{item.rawLine}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.normalizedSku}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.date || '-'}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.action}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </details>
                          )}

                          {(baselineSaveSummary.warningRows?.length || 0) > 0 && (
                            <details className="mt-4 rounded-lg border border-amber-200 bg-amber-50" open>
                              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-amber-900">疑似异常 / 自动修正明细</summary>
                              <div className="overflow-x-auto border-t border-amber-200">
                                <table className="min-w-[980px] w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-amber-200 text-left text-amber-800">
                                      <th className="px-3 py-2 whitespace-nowrap">原始行</th>
                                      <th className="px-3 py-2 whitespace-nowrap">修正前 SKU</th>
                                      <th className="px-3 py-2 whitespace-nowrap">修正后 SKU</th>
                                      <th className="px-3 py-2 whitespace-nowrap">原因</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {baselineSaveSummary.warningRows?.map((item, index) => (
                                      <tr key={`${item.rawLine}-${item.originalSku}-${index}`} className="border-b border-amber-100 align-top">
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-600">{item.rawLine}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.originalSku}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.normalizedSku}</td>
                                        <td className="px-3 py-2 min-w-[280px] text-amber-900">{item.reason}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </details>
                          )}

                          {baselineSaveSummary.failures.length > 0 && (
                            <details className="mt-4 rounded-lg border border-rose-200 bg-white" open>
                              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-rose-800">失败 / 未匹配明细</summary>
                              <div className="overflow-x-auto border-t border-slate-200">
                                <table className="min-w-[1100px] w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-left text-slate-500">
                                      <th className="px-3 py-2 whitespace-nowrap">行号</th>
                                      <th className="px-3 py-2 whitespace-nowrap">原始行</th>
                                      <th className="px-3 py-2 whitespace-nowrap">标准化 SKU</th>
                                      <th className="px-3 py-2 whitespace-nowrap">数量</th>
                                      <th className="px-3 py-2 whitespace-nowrap">日期</th>
                                      <th className="px-3 py-2 whitespace-nowrap">失败原因</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {baselineSaveSummary.failures.map((item, index) => (
                                      <tr key={`${item.lineNumber}-${item.sku}-${index}`} className="border-b border-slate-100 align-top">
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.lineNumber}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-600">{item.rawLine || '-'}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.sku || '-'}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.quantity ?? '-'}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.date || '-'}</td>
                                        <td className="px-3 py-2 min-w-[320px] text-rose-700">{item.reason}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {stockAdjustmentOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
                  onClick={closeStockAdjustmentModal}
                >
                  <div
                    className="w-full max-w-6xl max-h-[calc(100vh-2rem)] overflow-hidden rounded-xl bg-white p-6 shadow-xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">补货/调整库存</h3>
                        <p className="mt-1 text-sm text-slate-600">补货和调整只参与系统预计库存计算，不会直接修改 Product.stock。</p>
                      </div>
                      <button
                        onClick={closeStockAdjustmentModal}
                        className="text-sm text-slate-500 hover:text-slate-700"
                        disabled={savingAdjustment}
                      >
                        关闭
                      </button>
                    </div>

                    <div className="mt-5 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
                      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
                        <div className="rounded-lg border border-slate-200 p-4">
                        <div className="space-y-4">
                          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                            <button
                              onClick={() => {
                                setAdjustmentFormMode('single')
                                setAdjustmentError(null)
                                setAdjustmentSaveSummary(null)
                              }}
                              className={`rounded-md px-3 py-1.5 text-sm font-medium ${adjustmentFormMode === 'single' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                              disabled={savingAdjustment}
                            >
                              单个调整
                            </button>
                            <button
                              onClick={() => {
                                setAdjustmentFormMode('bulk')
                                setAdjustmentError(null)
                                setAdjustmentSaveSummary(null)
                              }}
                              className={`rounded-md px-3 py-1.5 text-sm font-medium ${adjustmentFormMode === 'bulk' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                              disabled={savingAdjustment}
                            >
                              批量调整
                            </button>
                          </div>

                          {adjustmentFormMode === 'single' ? (
                            <>
                              <div>
                                <label className="mb-2 block text-sm font-medium text-slate-900">SKU</label>
                                <select
                                  value={adjustmentFormSku}
                                  onChange={(event) => {
                                    const nextSku = event.target.value
                                    setAdjustmentFormSku(nextSku)
                                    setAdjustmentError(null)
                                    setAdjustmentSaveSummary(null)
                                    void loadAdjustments(nextSku)
                                  }}
                                  className={skuSelectClassName}
                                  disabled={savingAdjustment}
                                >
                                  <option value="">请选择 SKU</option>
                                  {skuOptions.map((option) => (
                                    <option key={option.sku} value={option.sku}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="mb-2 block text-sm font-medium text-slate-900">调整数量</label>
                                <input
                                  type="number"
                                  step="1"
                                  inputMode="numeric"
                                  value={adjustmentFormQuantity}
                                  onChange={(event) => {
                                    setAdjustmentFormQuantity(event.target.value)
                                    setAdjustmentError(null)
                                    setAdjustmentSaveSummary(null)
                                  }}
                                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                                  placeholder="补货填正数，损耗填负数"
                                  disabled={savingAdjustment}
                                />
                              </div>
                            </>
                          ) : (
                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-900">批量补货/调整</label>
                              <textarea
                                value={adjustmentBulkText}
                                onChange={(event) => {
                                  setAdjustmentBulkText(event.target.value)
                                  setAdjustmentError(null)
                                  setAdjustmentSaveSummary(null)
                                }}
                                rows={8}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                                placeholder={`SMH-12 50 2026-05-20\nSM412-8 20 2026-05-21\nRM4263 -5 2026-05-22`}
                                disabled={savingAdjustment}
                              />
                              <p className="mt-1 text-xs text-slate-500">每行一个 SKU、数量，可选日期。支持空格、逗号或 Tab 分隔。如果不填日期，则使用下方统一变更日期。</p>
                            </div>
                          )}

                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-900">调整日期</label>
                            <input
                              type="date"
                              value={adjustmentFormDate}
                              onChange={(event) => {
                                setAdjustmentFormDate(event.target.value)
                                setAdjustmentError(null)
                                setAdjustmentSaveSummary(null)
                              }}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                              disabled={savingAdjustment}
                            />
                            <p className="mt-1 text-xs text-slate-500">补货日期当天开始计入系统预计库存。</p>
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-900">类型</label>
                            <select
                              value={adjustmentFormType}
                              onChange={(event) => {
                                setAdjustmentFormType(event.target.value)
                                setAdjustmentError(null)
                                setAdjustmentSaveSummary(null)
                              }}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                              disabled={savingAdjustment}
                            >
                              {ADJUSTMENT_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-900">备注</label>
                            <textarea
                              value={adjustmentFormNote}
                              onChange={(event) => {
                                setAdjustmentFormNote(event.target.value)
                                setAdjustmentError(null)
                                setAdjustmentSaveSummary(null)
                              }}
                              rows={3}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                              placeholder="可选，例如：618 前补货"
                              disabled={savingAdjustment}
                            />
                          </div>

                          {adjustmentError && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                              {adjustmentError}
                            </div>
                          )}

                          <div className="flex justify-end gap-3">
                            <button
                              onClick={() => resetAdjustmentForm(adjustmentFormSku)}
                              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                              disabled={savingAdjustment}
                            >
                              重置
                            </button>
                            <button
                              onClick={handleSaveAdjustment}
                              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                              disabled={savingAdjustment}
                            >
                              {savingAdjustment ? '保存中...' : '保存'}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 p-4">
                        <div className="mb-3">
                          <div className="text-sm font-semibold text-slate-900">{adjustmentFormMode === 'bulk' ? '补货/调整记录' : '当前 SKU 的补货/调整记录'}</div>
                          <div className="mt-1 text-xs text-slate-500">补货为正数，损耗为负数，都会进入系统预计库存计算。</div>
                        </div>

                        {filteredAdjustments.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                            {adjustmentFormMode === 'bulk' ? '当前还没有补货/调整记录。' : adjustmentFormSku ? '这个 SKU 还没有补货/调整记录。' : '请先选择 SKU。'}
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 text-left text-slate-500">
                                  <th className="px-3 py-2">日期</th>
                                  <th className="px-3 py-2">数量</th>
                                  <th className="px-3 py-2">类型</th>
                                  <th className="px-3 py-2">备注</th>
                                  <th className="px-3 py-2 text-right">操作</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredAdjustments.map((adjustment) => (
                                  <tr key={adjustment.id} className="border-b border-slate-100">
                                    <td className="px-3 py-2 text-slate-700">{adjustment.adjustmentDate}</td>
                                    <td className={`px-3 py-2 font-medium ${adjustment.quantity >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                      {adjustment.quantity > 0 ? `+${adjustment.quantity}` : adjustment.quantity}
                                    </td>
                                    <td className="px-3 py-2 text-slate-700">
                                      {ADJUSTMENT_TYPE_OPTIONS.find((option) => option.value === adjustment.type)?.label || adjustment.type}
                                    </td>
                                    <td className="px-3 py-2 text-slate-500">{adjustment.note || '-'}</td>
                                    <td className="px-3 py-2 text-right">
                                      <button
                                        onClick={() => void handleDeleteAdjustment(adjustment)}
                                        className="text-xs text-red-600 hover:text-red-700 disabled:opacity-60"
                                        disabled={deletingAdjustmentId === adjustment.id}
                                      >
                                        {deletingAdjustmentId === adjustment.id ? '删除中...' : '删除'}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                      </div>

                      {adjustmentSaveSummary && (
                        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                          <div className="flex flex-wrap gap-3">
                            <span>原始行数 {adjustmentSaveSummary.rawRowCount || 0}</span>
                            <span>有效解析 {adjustmentSaveSummary.parsedCount || 0}</span>
                            <span>成功 {adjustmentSaveSummary.successCount}</span>
                            <span>失败 {adjustmentSaveSummary.failureCount}</span>
                            <span>输入重复 {adjustmentSaveSummary.duplicateInInputCount || 0}</span>
                            <span>自动合并 {adjustmentSaveSummary.mergedCount || 0}</span>
                            <span>自动修正 {adjustmentSaveSummary.autoCorrectedCount || 0}</span>
                            <span>疑似异常 {adjustmentSaveSummary.suspiciousCount || 0}</span>
                            <span>未匹配 SKU {adjustmentSaveSummary.unmatchedSkuCount || 0}</span>
                            <span>使用单独日期 {adjustmentSaveSummary.usedItemDateCount || 0}</span>
                            <span>使用统一日期 {adjustmentSaveSummary.usedDefaultDateCount || 0}</span>
                          </div>

                          {(adjustmentSaveSummary.duplicateRows?.length || 0) > 0 && (
                            <details className="mt-4 rounded-lg border border-emerald-200 bg-white" open>
                              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-900">重复行明细（保留最后一条）</summary>
                              <div className="overflow-x-auto border-t border-slate-200">
                                <table className="min-w-[880px] w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-left text-slate-500">
                                      <th className="px-3 py-2 whitespace-nowrap">原始行</th>
                                      <th className="px-3 py-2 whitespace-nowrap">标准化 SKU</th>
                                      <th className="px-3 py-2 whitespace-nowrap">日期</th>
                                      <th className="px-3 py-2 whitespace-nowrap">处理方式</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {adjustmentSaveSummary.duplicateRows?.map((item, index) => (
                                      <tr key={`${item.rawLine}-${item.normalizedSku}-${index}`} className="border-b border-slate-100 align-top">
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-600">{item.rawLine}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.normalizedSku}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.date || '-'}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.action}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </details>
                          )}

                          {(adjustmentSaveSummary.warningRows?.length || 0) > 0 && (
                            <details className="mt-4 rounded-lg border border-amber-200 bg-amber-50" open>
                              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-amber-900">疑似异常 / 自动修正明细</summary>
                              <div className="overflow-x-auto border-t border-amber-200">
                                <table className="min-w-[980px] w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-amber-200 text-left text-amber-800">
                                      <th className="px-3 py-2 whitespace-nowrap">原始行</th>
                                      <th className="px-3 py-2 whitespace-nowrap">修正前 SKU</th>
                                      <th className="px-3 py-2 whitespace-nowrap">修正后 SKU</th>
                                      <th className="px-3 py-2 whitespace-nowrap">原因</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {adjustmentSaveSummary.warningRows?.map((item, index) => (
                                      <tr key={`${item.rawLine}-${item.originalSku}-${index}`} className="border-b border-amber-100 align-top">
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-600">{item.rawLine}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.originalSku}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.normalizedSku}</td>
                                        <td className="px-3 py-2 min-w-[280px] text-amber-900">{item.reason}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </details>
                          )}

                          {adjustmentSaveSummary.failures.length > 0 && (
                            <details className="mt-4 rounded-lg border border-rose-200 bg-white" open>
                              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-rose-800">失败 / 未匹配明细</summary>
                              <div className="overflow-x-auto border-t border-slate-200">
                                <table className="min-w-[1100px] w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-left text-slate-500">
                                      <th className="px-3 py-2 whitespace-nowrap">行号</th>
                                      <th className="px-3 py-2 whitespace-nowrap">原始行</th>
                                      <th className="px-3 py-2 whitespace-nowrap">标准化 SKU</th>
                                      <th className="px-3 py-2 whitespace-nowrap">数量</th>
                                      <th className="px-3 py-2 whitespace-nowrap">日期</th>
                                      <th className="px-3 py-2 whitespace-nowrap">失败原因</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {adjustmentSaveSummary.failures.map((item, index) => (
                                      <tr key={`${item.lineNumber}-${item.sku}-${index}`} className="border-b border-slate-100 align-top">
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.lineNumber}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-600">{item.rawLine || '-'}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.sku || '-'}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.quantity ?? '-'}</td>
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.date || '-'}</td>
                                        <td className="px-3 py-2 min-w-[320px] text-rose-700">{item.reason}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {rankSettingsOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
                  onClick={closeRankSettingsModal}
                >
                  <div
                    className="w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-hidden rounded-xl bg-white p-6 shadow-xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">等级设置</h3>
                        <p className="mt-1 text-sm text-slate-600">A/B 用近 7 天日均销量判断，C 用单日销量占库存或全店订单占比判断。</p>
                      </div>
                      <button
                        onClick={closeRankSettingsModal}
                        className="text-sm text-slate-500 hover:text-slate-700"
                        disabled={savingRankSettings}
                      >
                        关闭
                      </button>
                    </div>

                    <div className="mt-5 grid max-h-[calc(100vh-10rem)] gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-900">A 日均销量阈值</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={rankSettingsForm.aDailySalesThreshold}
                          onChange={(event) => {
                            setRankSettingsForm((prev) => ({ ...prev, aDailySalesThreshold: event.target.value }))
                            setRankSettingsError(null)
                          }}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                          disabled={savingRankSettings}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-900">B 日均销量阈值</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={rankSettingsForm.bDailySalesThreshold}
                          onChange={(event) => {
                            setRankSettingsForm((prev) => ({ ...prev, bDailySalesThreshold: event.target.value }))
                            setRankSettingsError(null)
                          }}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                          disabled={savingRankSettings}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-900">C 库存占比阈值（%）</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={rankSettingsForm.cStockRatioThreshold}
                          onChange={(event) => {
                            setRankSettingsForm((prev) => ({ ...prev, cStockRatioThreshold: event.target.value }))
                            setRankSettingsError(null)
                          }}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                          disabled={savingRankSettings}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-900">C 全店订单占比阈值（%）</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={rankSettingsForm.cOrderRatioThreshold}
                          onChange={(event) => {
                            setRankSettingsForm((prev) => ({ ...prev, cOrderRatioThreshold: event.target.value }))
                            setRankSettingsError(null)
                          }}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                          disabled={savingRankSettings}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-900">D 出单天数阈值</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={rankSettingsForm.dActiveDaysThreshold}
                          onChange={(event) => {
                            setRankSettingsForm((prev) => ({ ...prev, dActiveDaysThreshold: event.target.value }))
                            setRankSettingsError(null)
                          }}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                          disabled={savingRankSettings}
                        />
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <div>当前窗口：近 {rankSettings?.windowDays || 7} 天</div>
                        <div className="mt-1">优先级：A &gt; B &gt; C &gt; D &gt; E &gt; F</div>
                      </div>
                    </div>

                    {rankSettingsError && (
                      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {rankSettingsError}
                      </div>
                    )}

                    <div className="mt-5 flex justify-end gap-3">
                      <button
                        onClick={closeRankSettingsModal}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        disabled={savingRankSettings}
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSaveRankSettings}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                        disabled={savingRankSettings}
                      >
                        {savingRankSettings ? '保存中...' : '保存设置'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {stockEditTarget && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
                  onClick={closeStockEditModal}
                >
                  <div
                    className="w-full max-w-md max-h-[calc(100vh-2rem)] overflow-hidden rounded-xl bg-white p-6 shadow-xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">编辑库存</h3>
                        <p className="mt-1 text-sm text-slate-600">SKU：{stockEditTarget.sku}</p>
                        <p className="mt-1 text-sm text-slate-600">当前库存：{stockEditTarget.stock}</p>
                      </div>
                      <button
                        onClick={closeStockEditModal}
                        className="text-sm text-slate-500 hover:text-slate-700"
                        disabled={Boolean(editingStockSku)}
                      >
                        关闭
                      </button>
                    </div>

                    <div className="mt-5 max-h-[calc(100vh-10rem)] space-y-4 overflow-y-auto pr-1">
                      <div>
                        <div className="mb-2 text-sm font-medium text-slate-900">修改方式</div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          {[
                            { value: 'set', label: '设置为指定库存' },
                            { value: 'increase', label: '增加库存' },
                            { value: 'decrease', label: '减少库存' },
                          ].map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                const nextMode = option.value as StockEditMode
                                setStockEditMode(nextMode)
                                setStockEditValue(nextMode === 'set' ? String(stockEditTarget.stock) : '')
                                setStockEditError(null)
                              }}
                              className={`rounded-lg border px-3 py-2 text-sm ${
                                stockEditMode === option.value
                                  ? 'border-slate-900 bg-slate-900 text-white'
                                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                              }`}
                              disabled={Boolean(editingStockSku)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-900">
                          {stockEditMode === 'set' ? '新的库存数值' : '调整数量'}
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          value={stockEditValue}
                          onChange={(event) => {
                            setStockEditValue(event.target.value)
                            setStockEditError(null)
                          }}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                          placeholder={stockEditMode === 'set' ? '请输入新的库存数值' : '请输入调整数量'}
                          disabled={Boolean(editingStockSku)}
                        />
                      </div>

                      {stockEditError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                          {stockEditError}
                        </div>
                      )}

                      <div className="flex justify-end gap-3">
                        <button
                          onClick={closeStockEditModal}
                          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          disabled={Boolean(editingStockSku)}
                        >
                          取消
                        </button>
                        <button
                          onClick={handleSaveStock}
                          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                          disabled={Boolean(editingStockSku)}
                        >
                          {editingStockSku ? '保存中...' : '保存'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {groupManagerOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
                  onClick={closeGroupManagerModal}
                >
                  <div
                    className="w-full max-w-5xl max-h-[calc(100vh-2rem)] overflow-hidden rounded-xl bg-white p-6 shadow-xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">分组管理</h3>
                        <p className="mt-1 text-sm text-slate-600">自定义分组名称，并手动选择多个 SKU 归入分组。</p>
                      </div>
                      <button
                        onClick={closeGroupManagerModal}
                        className="text-sm text-slate-500 hover:text-slate-700"
                        disabled={savingGroup}
                      >
                        关闭
                      </button>
                    </div>

                    <div className="mt-5 grid max-h-[calc(100vh-10rem)] gap-6 overflow-y-auto pr-1 lg:grid-cols-[280px_minmax(0,1fr)]">
                      <div className="rounded-lg border border-slate-200 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="text-sm font-semibold text-slate-900">已有分组</div>
                          <button
                            onClick={resetGroupForm}
                            className="text-xs text-slate-600 hover:text-slate-900"
                          >
                            新建分组
                          </button>
                        </div>
                        <div className="space-y-2">
                          {groups.length === 0 ? (
                            <div className="text-sm text-slate-500">暂无分组</div>
                          ) : (
                            groups.map((group) => (
                              <div key={group.id} className="rounded-lg border border-slate-200 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-medium text-slate-900">{group.name}</div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {group.skus.length} 个 SKU
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleEditGroup(group)}
                                      className="text-xs text-slate-600 hover:text-slate-900"
                                    >
                                      编辑
                                    </button>
                                    <button
                                      onClick={() => void handleDeleteGroup(group)}
                                      className="text-xs text-red-600 hover:text-red-700 disabled:opacity-60"
                                      disabled={deletingGroupId === group.id}
                                    >
                                      {deletingGroupId === group.id ? '删除中...' : '删除'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 p-4">
                        <div className="mb-3 text-sm font-semibold text-slate-900">
                          {groupFormId ? '编辑分组' : '新建分组'}
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-900">分组名称</label>
                            <input
                              value={groupFormName}
                              onChange={(event) => {
                                setGroupFormName(event.target.value)
                                setGroupFormError(null)
                              }}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                              placeholder="例如：日常主推"
                              disabled={savingGroup}
                            />
                          </div>

                          <div>
                            <div className="mb-2 text-sm font-medium text-slate-900">选择 SKU</div>
                            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 p-3">
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {skuOptions.map((option) => (
                                  <label key={option.sku} className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
                                    <input
                                      type="checkbox"
                                      checked={groupFormSkus.includes(option.sku)}
                                      onChange={() => toggleGroupSku(option.sku)}
                                      disabled={savingGroup}
                                    />
                                    <span className="min-w-0 flex-1 truncate" title={option.label}>{option.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>

                          {groupFormError && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                              {groupFormError}
                            </div>
                          )}

                          <div className="flex justify-end gap-3">
                            <button
                              onClick={resetGroupForm}
                              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                              disabled={savingGroup}
                            >
                              重置
                            </button>
                            <button
                              onClick={() => void handleSaveGroup()}
                              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                              disabled={savingGroup}
                            >
                              {savingGroup ? '保存中...' : '保存分组'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {reconcilePreviewOpen && reconcilePreviewData && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
                  onClick={closeReconcilePreviewModal}
                >
                  <div
                    className="w-full max-w-6xl max-h-[calc(100vh-2rem)] overflow-hidden rounded-xl bg-white p-6 shadow-xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">按平台库存校准预览</h3>
                        <p className="mt-1 text-sm text-slate-600">
                          当前仅为预览，不会修改库存。确认执行功能将在下一步开启。
                        </p>
                      </div>
                      <button
                        onClick={closeReconcilePreviewModal}
                        className="text-sm text-slate-500 hover:text-slate-700"
                        disabled={reconcilePreviewLoading}
                      >
                        关闭
                      </button>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-4">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs text-slate-500">候选 SKU</div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">{reconcilePreviewData.summary.candidateCount}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs text-slate-500">跳过：无初始库存</div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">{reconcilePreviewData.summary.skippedNoBaseline}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs text-slate-500">跳过：无平台快照</div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">{reconcilePreviewData.summary.skippedNoSnapshot}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs text-slate-500">跳过：差异不达阈值</div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">{reconcilePreviewData.summary.skippedDiffTooSmall}</div>
                      </div>
                    </div>

                    <div className="mt-4 text-xs text-slate-500">
                      当前阈值：|库存差异| &gt; {reconcilePreviewData.threshold}，仅预览 canonical 主 SKU，且要求已设置初始库存并存在平台快照。
                    </div>

                    <div className="mt-4 max-h-[calc(100vh-16rem)] overflow-auto rounded-lg border border-slate-200">
                      <table className="min-w-[1320px] w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="px-4 py-3 text-left font-semibold text-slate-900">SKU</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-900">产品名称</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-900">平台实际库存</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-900">系统预计库存</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-900">库存差异</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-900">建议调整数</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-900">available</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-900">locked</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-900">total</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-900">快照日期</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reconcilePreviewData.items.length === 0 ? (
                            <tr>
                              <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                                当前没有符合阈值和快照条件的校准候选 SKU。
                              </td>
                            </tr>
                          ) : (
                            reconcilePreviewData.items.map((item) => (
                              <tr key={`${item.productId}:${item.sku}`} className="border-b border-slate-100">
                                <td className="px-4 py-3 font-medium text-slate-900">{item.sku}</td>
                                <td className="px-4 py-3 text-slate-700">{item.productName}</td>
                                <td className="px-4 py-3 text-center font-semibold text-slate-900">{item.platformStock}</td>
                                <td className="px-4 py-3 text-center text-slate-700">{item.estimatedStock}</td>
                                <td className={`px-4 py-3 text-center font-semibold ${getInventoryDiffTextClass(item.inventoryDiff)}`}>{formatSignedNumber(item.inventoryDiff)}</td>
                                <td className={`px-4 py-3 text-center font-semibold ${getInventoryDiffTextClass(item.adjustmentQty)}`}>{formatSignedNumber(item.adjustmentQty)}</td>
                                <td className="px-4 py-3 text-center text-slate-700">{item.availableQty ?? '—'}</td>
                                <td className="px-4 py-3 text-center text-slate-700">{item.lockedQty ?? '—'}</td>
                                <td className="px-4 py-3 text-center text-slate-700">{item.totalQty ?? '—'}</td>
                                <td className="px-4 py-3 text-slate-600">{item.latestSnapshotDate || '无平台快照'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {summary && (
                <>
                  <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-indigo-500">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-slate-600 text-sm font-medium">当前可用总库存</p>
                          <p className="mt-2 text-3xl font-bold text-slate-900">
                            {summary.currentAvailableTotalStock ?? summary.platformCurrentStock ?? summary.totalStock}
                          </p>
                        </div>
                        <div className="text-4xl text-indigo-500 opacity-20">📦</div>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-yellow-500">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-slate-600 text-sm font-medium">低库存产品数</p>
                          <p className="text-3xl font-bold text-slate-900 mt-2">{summary.lowStockCount}</p>
                        </div>
                        <div className="text-4xl text-yellow-500 opacity-20">⚠️</div>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-red-500">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-slate-600 text-sm font-medium">断货产品数</p>
                          <p className="text-3xl font-bold text-slate-900 mt-2">{summary.outOfStockCount}</p>
                        </div>
                        <div className="text-4xl text-red-500 opacity-20">❌</div>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-sky-500">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-slate-600 text-sm font-medium">库存未同步 SKU</p>
                          <p className="text-3xl font-bold text-slate-900 mt-2">{summary.staleSnapshotCount}</p>
                        </div>
                        <div className="text-4xl text-sky-500 opacity-20">🛰️</div>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-rose-500">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-slate-600 text-sm font-medium">库存差异异常 SKU</p>
                          <p className="text-3xl font-bold text-slate-900 mt-2">{summary.inventoryDiffAbnormalCount}</p>
                        </div>
                        <div className="text-4xl text-rose-500 opacity-20">📏</div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                    <button
                      type="button"
                      onClick={() => setInventoryReconciliationOpen((prev) => !prev)}
                      className="flex w-full flex-col gap-3 px-6 py-4 text-left transition hover:bg-slate-50 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">库存对账</div>
                        <div className="mt-1 text-xs text-slate-500">
                          用于解释系统预计库存与当前可用库存的差异，默认折叠，不影响日常动销查看。
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">系统预计库存 {summary.estimatedTotalStock}</span>
                        <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">
                          当前可用库存 {summary.currentAvailableTotalStock ?? summary.platformCurrentStock ?? summary.totalStock}
                        </span>
                        <span className={`rounded-full px-3 py-1 ${summary.inventoryDiff === 0 ? 'bg-slate-100 text-slate-700' : summary.inventoryDiff > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          差异 {formatSignedNumber(summary.inventoryDiff)}
                        </span>
                        <span className="text-xs font-medium text-slate-500">
                          {inventoryReconciliationOpen ? '收起' : '展开查看'}
                        </span>
                      </div>
                    </button>
                    {inventoryReconciliationOpen && (
                      <>
                        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-xs text-slate-500">
                          对账表按库存差异绝对值排序，方便先排查差异最大的 SKU。
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-[1380px] w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50">
                                <th className="px-6 py-3 text-left font-semibold text-slate-900">SKU</th>
                                <th className="px-6 py-3 text-center font-semibold text-slate-900">系统预计库存</th>
                                <th className="px-6 py-3 text-center font-semibold text-slate-900">当前可用库存</th>
                                <th className="px-6 py-3 text-center font-semibold text-slate-900">库存差异</th>
                                <th className="px-6 py-3 text-center font-semibold text-slate-900">平台快照库存</th>
                                <th className="px-6 py-3 text-center font-semibold text-slate-900">快照后补货/调整</th>
                                <th className="px-6 py-3 text-center font-semibold text-slate-900">快照后订单/样品消耗</th>
                                <th className="px-6 py-3 text-center font-semibold text-slate-900">平台库存来源</th>
                                <th className="px-6 py-3 text-left font-semibold text-slate-900">平台快照日期</th>
                              </tr>
                            </thead>
                            <tbody>
                              {reconciliationProducts.map((product) => (
                                <tr key={`reconciliation-${product.id}`} className="border-b border-slate-100">
                                  <td className="px-6 py-3 font-medium text-slate-900">{product.sku}</td>
                                  <td className={`px-6 py-3 text-center font-semibold ${getEstimatedStockTextClass(product.estimatedStock, product.hasBaseline)}`}>
                                    {product.hasBaseline ? product.estimatedStock : '未设置'}
                                  </td>
                                  <td className={`px-6 py-3 text-center font-semibold ${getCurrentAvailableStockTextClass(product)}`}>
                                    {product.currentAvailableStock}
                                  </td>
                                  <td className={`px-6 py-3 text-center font-semibold ${getInventoryDiffTextClass(product.inventoryDiff)}`}>{formatSignedNumber(product.inventoryDiff)}</td>
                                  <td className="px-6 py-3 text-center text-slate-700">{getPlatformSnapshotStockDisplay(product)}</td>
                                  <td className="px-6 py-3 text-center text-slate-700">{formatSignedNumber(product.snapshotAdjustmentAfterQty)}</td>
                                  <td className="px-6 py-3 text-center text-slate-700">{product.snapshotConsumedAfterQty}</td>
                                  <td className="px-6 py-3 text-center text-slate-700">{getPlatformStockSourceText(product)}</td>
                                  <td className="px-6 py-3 text-slate-600">{product.platformSnapshotDate ? new Date(product.platformSnapshotDate).toLocaleString('zh-CN') : '无平台快照'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-6 py-4 text-sm text-slate-700 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="font-semibold text-slate-900">动销库存总表</div>
                        <div className="mt-1 text-xs text-slate-500">
                          主表保留运营最常用的库存、销量和动销等级；复杂库存公式保留到详情和对账里。
                        </div>
                      </div>
                      {tableRangeLoading && <span className="text-slate-500">筛选期销量刷新中...</span>}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-[1460px] w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="sticky top-0 left-0 z-30 min-w-[120px] bg-slate-50 px-6 py-3 text-left">
                              <button
                                onClick={() => handleSort('sku')}
                                className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600"
                              >
                                SKU <SortIcon columnKey="sku" />
                              </button>
                            </th>
                            <th className="sticky top-0 z-20 min-w-[180px] bg-slate-50 px-6 py-3 text-left font-semibold text-slate-900">
                              产品名
                            </th>
                            <th className="sticky top-0 z-20 min-w-[120px] bg-slate-50 px-6 py-3 text-center">
                              <button
                                onClick={() => handleSort('currentAvailableStock')}
                                className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600 justify-center w-full"
                              >
                                当前可用库存 <SortIcon columnKey="currentAvailableStock" />
                              </button>
                            </th>
                            <th className="sticky top-0 z-20 min-w-[100px] bg-slate-50 px-6 py-3 text-center">
                              <button
                                onClick={() => handleSort('weekSales')}
                                className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600 justify-center w-full"
                              >
                                7天销量 <SortIcon columnKey="weekSales" />
                              </button>
                            </th>
                            <th className="sticky top-0 z-20 min-w-[100px] bg-slate-50 px-6 py-3 text-center">
                              <button
                                onClick={() => handleSort('monthSales')}
                                className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600 justify-center w-full"
                              >
                                30天销量 <SortIcon columnKey="monthSales" />
                              </button>
                            </th>
                            <th className="sticky top-0 z-20 min-w-[140px] bg-slate-50 px-6 py-3 text-center">
                              <button
                                onClick={() => handleSort('salesRankPriority')}
                                className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600 justify-center w-full"
                              >
                                动销等级 <SortIcon columnKey="salesRankPriority" />
                              </button>
                            </th>
                            <th className="sticky top-0 z-20 min-w-[120px] bg-slate-50 px-6 py-3 text-center">
                              <button
                                onClick={() => handleSort('daysOfSupply')}
                                className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600 justify-center w-full"
                              >
                                可售天数 <SortIcon columnKey="daysOfSupply" />
                              </button>
                            </th>
                            <th className="sticky top-0 z-20 min-w-[100px] bg-slate-50 px-6 py-3 text-center">
                              <button
                                onClick={() => handleSort('stockStatus')}
                                className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600 justify-center w-full"
                              >
                                库存状态 <SortIcon columnKey="stockStatus" />
                              </button>
                            </th>
                            <th className="sticky top-0 z-20 min-w-[240px] bg-slate-50 px-6 py-3 text-left">
                              <button
                                onClick={() => handleSort('dataReminders')}
                                className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600"
                              >
                                数据提醒 <SortIcon columnKey="dataReminders" />
                              </button>
                            </th>
                            <th className="sticky top-0 z-20 min-w-[100px] bg-slate-50 px-6 py-3 text-center font-semibold text-slate-900">
                              操作
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleProducts.length === 0 ? (
                            <tr>
                              <td colSpan={10} className="px-6 py-8 text-center text-slate-500">
                                暂无产品数据
                              </td>
                            </tr>
                          ) : (
                            visibleProducts.map((product) => {
                              const expanded = expandedProductIds.includes(product.id)

                              return (
                                <Fragment key={product.id}>
                                  <tr className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                                    <td className="sticky left-0 z-10 min-w-[120px] bg-white px-6 py-4 text-sm font-medium text-slate-900">
                                      {product.sku}
                                    </td>
                                    <td className="min-w-[180px] px-6 py-4 text-sm text-slate-900">
                                      <div className="font-medium">{product.name || '-'}</div>
                                      {(product.color !== '-' || product.length !== '-') && (
                                        <div className="mt-1 text-xs text-slate-500">
                                          {[product.color, product.length].filter((value) => value && value !== '-').join(' / ')}
                                        </div>
                                      )}
                                    </td>
                                    <td className={`min-w-[120px] px-6 py-4 text-sm text-center font-bold ${getCurrentAvailableStockTextClass(product)}`}>
                                      {product.currentAvailableStock}
                                    </td>
                                    <td className="min-w-[100px] px-6 py-4 text-sm text-center text-slate-700">{product.weekSales}</td>
                                    <td className="min-w-[100px] px-6 py-4 text-sm text-center text-slate-700">{product.monthSales}</td>
                                    <td className="min-w-[140px] px-6 py-4 text-sm text-center">
                                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getRankBadgeClass(product.salesRank)}`}>
                                        {getRankLabel(product.salesRank)}
                                      </span>
                                    </td>
                                    <td className={`min-w-[120px] px-6 py-4 text-sm text-center font-semibold ${getDaysOfSupplyTextClass(product)}`}>
                                      {getDaysOfSupplyDisplay(product)}
                                    </td>
                                    <td className="min-w-[100px] px-6 py-4 text-sm text-center">
                                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStockStatusBadgeClass(product.stockStatus)}`}>
                                        {getStockStatusLabel(product.stockStatus)}
                                      </span>
                                    </td>
                                    <td className="min-w-[240px] px-6 py-4 text-sm text-slate-600">
                                      {product.dataReminders.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                          {product.dataReminders.map((reminder) => (
                                            <span key={`${product.id}-${reminder}`} className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getReminderBadgeClass(reminder)}`}>
                                              {reminder}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-slate-400">-</span>
                                      )}
                                    </td>
                                    <td className="min-w-[100px] px-6 py-4 text-center">
                                      <button
                                        onClick={() => toggleProductDetails(product.id)}
                                        className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-50"
                                      >
                                        {expanded ? '收起详情' : '详情'}
                                      </button>
                                    </td>
                                  </tr>
                                  {expanded && (
                                    <tr className="border-b border-slate-200 bg-slate-50/70">
                                      <td colSpan={10} className="px-6 py-5">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                            <div>
                                              <div className="text-sm font-semibold text-slate-900">SKU：{product.sku}</div>
                                              <div className="mt-1 text-xs text-slate-500">详情区保留库存口径解释，主表只看当前可用库存和风险提醒。</div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                              <button
                                                onClick={() => handleEditStock(product)}
                                                className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                                                disabled
                                                title="正式库存请使用库存与订货中心"
                                              >
                                                编辑库存（legacy）
                                              </button>
                                              <button
                                                onClick={() => void handleDeleteInventory(product)}
                                                className="inline-flex items-center justify-center rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                                disabled
                                                title="正式库存请使用库存与订货中心"
                                              >
                                                删除库存（legacy）
                                              </button>
                                            </div>
                                          </div>
                                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                            <div className="rounded-lg bg-white px-3 py-3">
                                              <div className="text-xs text-slate-500">当前可用库存</div>
                                              <div className={`mt-1 text-sm font-semibold ${getCurrentAvailableStockTextClass(product)}`}>{product.currentAvailableStock}</div>
                                            </div>
                                            <div className="rounded-lg bg-white px-3 py-3">
                                              <div className="text-xs text-slate-500">平台快照库存</div>
                                              <div className="mt-1 text-sm font-semibold text-slate-900">{getPlatformSnapshotStockDisplay(product)}</div>
                                              <div className="mt-1 text-[11px] text-slate-500">{getPlatformStockSourceText(product)}</div>
                                            </div>
                                            <div className="rounded-lg bg-white px-3 py-3">
                                              <div className="text-xs text-slate-500">快照后补货/调整</div>
                                              <div className={`mt-1 text-sm font-semibold ${getInventoryDiffTextClass(product.snapshotAdjustmentAfterQty)}`}>
                                                {formatSignedNumber(product.snapshotAdjustmentAfterQty)}
                                              </div>
                                            </div>
                                            <div className="rounded-lg bg-white px-3 py-3">
                                              <div className="text-xs text-slate-500">快照后订单/样品消耗</div>
                                              <div className="mt-1 text-sm font-semibold text-slate-900">{product.snapshotConsumedAfterQty}</div>
                                            </div>
                                            <div className="rounded-lg bg-white px-3 py-3">
                                              <div className="text-xs text-slate-500">系统预计库存</div>
                                              <div className={`mt-1 text-sm font-semibold ${getEstimatedStockTextClass(product.estimatedStock, product.hasBaseline)}`}>
                                                {product.hasBaseline ? product.estimatedStock : '未设置'}
                                              </div>
                                            </div>
                                            <div className="rounded-lg bg-white px-3 py-3">
                                              <div className="text-xs text-slate-500">库存差异</div>
                                              <div className={`mt-1 text-sm font-semibold ${getInventoryDiffTextClass(product.inventoryDiff)}`}>
                                                {formatSignedNumber(product.inventoryDiff)}
                                              </div>
                                            </div>
                                            <div className="rounded-lg bg-white px-3 py-3">
                                              <div className="text-xs text-slate-500">平台快照日期</div>
                                              <div className="mt-1 text-sm font-semibold text-slate-900">
                                                {product.platformSnapshotDate ? new Date(product.platformSnapshotDate).toLocaleString('zh-CN') : '无平台快照'}
                                              </div>
                                            </div>
                                            <div className="rounded-lg bg-white px-3 py-3">
                                              <div className="text-xs text-slate-500">平台库存来源</div>
                                              <div className="mt-1 text-sm font-semibold text-slate-900">{getPlatformStockSourceText(product)}</div>
                                            </div>
                                            <div className="rounded-lg bg-white px-3 py-3">
                                              <div className="text-xs text-slate-500">最早消耗日期</div>
                                              <div className="mt-1 text-sm font-semibold text-slate-900">
                                                {product.earliestConsumptionDate ? new Date(product.earliestConsumptionDate).toLocaleDateString('zh-CN') : '—'}
                                              </div>
                                            </div>
                                            <div className="rounded-lg bg-white px-3 py-3">
                                              <div className="text-xs text-slate-500">基准入库日期</div>
                                              <div className="mt-1 text-sm font-semibold text-slate-900">
                                                {product.baselineDate ? new Date(product.baselineDate).toLocaleDateString('zh-CN') : '未设置'}
                                              </div>
                                            </div>
                                            <div className="rounded-lg bg-white px-3 py-3">
                                              <div className="text-xs text-slate-500">初始库存 baseline</div>
                                              <div className="mt-1 text-sm font-semibold text-slate-900">{product.hasBaseline ? product.baselineQty : '未设置'}</div>
                                            </div>
                                            <div className="rounded-lg bg-white px-3 py-3">
                                              <div className="text-xs text-slate-500">补货/调整合计</div>
                                              <div className={`mt-1 text-sm font-semibold ${getInventoryDiffTextClass(product.adjustmentTotal)}`}>
                                                {formatSignedNumber(product.adjustmentTotal)}
                                              </div>
                                            </div>
                                            <div className="rounded-lg bg-white px-3 py-3">
                                              <div className="text-xs text-slate-500">累计库存消耗</div>
                                              <div className="mt-1 text-sm font-semibold text-slate-900">{product.hasBaseline ? product.cumulativeStockConsumedQty : '—'}</div>
                                            </div>
                                            <div className="rounded-lg bg-white px-3 py-3">
                                              <div className="text-xs text-slate-500">样品消耗数量</div>
                                              <div className="mt-1 text-sm font-semibold text-slate-900">{product.hasBaseline ? product.sampleConsumedQty : '—'}</div>
                                            </div>
                                            <div className="rounded-lg bg-white px-3 py-3">
                                              <div className="text-xs text-slate-500">近7天销量</div>
                                              <div className="mt-1 text-sm font-semibold text-slate-900">{product.weekSales}</div>
                                            </div>
                                            <div className="rounded-lg bg-white px-3 py-3">
                                              <div className="text-xs text-slate-500">库存状态</div>
                                              <div className="mt-1">
                                                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStockStatusBadgeClass(product.stockStatus)}`}>
                                                  {getStockStatusLabel(product.stockStatus)}
                                                </span>
                                              </div>
                                            </div>
                                            <div className="rounded-lg bg-white px-3 py-3 sm:col-span-2 xl:col-span-4">
                                              <div className="text-xs text-slate-500">数据提醒</div>
                                              <div className="mt-2 flex flex-wrap gap-2">
                                                {product.dataReminders.length > 0 ? product.dataReminders.map((reminder) => (
                                                  <span key={`detail-${product.id}-${reminder}`} className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getReminderBadgeClass(reminder)}`}>
                                                    {reminder}
                                                  </span>
                                                )) : <span className="text-sm text-slate-400">当前无提醒</span>}
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              )
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </PageGuard>
  )
}
