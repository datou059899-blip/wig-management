import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  buildProductSkuResolver,
  buildSkuMatchVariants,
  normalizeCell,
  normalizeSkuForCompare,
} from '@/lib/product-sku-resolver'

type RangeKey = 'today' | '7' | '30' | 'custom'
type ProductLookup = {
  id: string
  sku: string | null
  name: string
  stock: number
}

type InventoryTarget = {
  key: string
  productId: string | null
  productSku: string | null
  fallbackStock: number
  requestedSkus: string[]
  consumedSkus: string[]
  snapshotCandidateSkus: string[]
  baselineCandidateSkus: string[]
}

type ResolvedSnapshotRow = {
  sku: string
  date: Date
  qty: number | null
}

type BaselineRow = {
  id: string
  sku: string
  quantity: number
  baselineDate: Date
  note: string | null
}

type AdjustmentRow = {
  id: string
  sku: string
  quantity: number
  adjustmentDate: Date
  type: string
  note: string | null
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

function addUniqueSku(target: string[], sku: string | null | undefined) {
  const value = normalizeCell(sku)
  if (!value || target.includes(value)) return
  target.push(value)
}

function resolveSnapshotQty(snapshot: {
  totalQty: number | null
  availableQty: number | null
  lockedQty: number | null
}) {
  if (snapshot.totalQty !== null && snapshot.totalQty !== undefined && snapshot.totalQty > 0) {
    return snapshot.totalQty
  }

  const availableQty = snapshot.availableQty ?? 0
  const lockedQty = snapshot.lockedQty ?? 0
  const availableAndLockedTotal = availableQty + lockedQty
  if (availableAndLockedTotal > 0) {
    return availableAndLockedTotal
  }

  return null
}

function buildFallbackStockSeries(params: {
  startDate: Date
  totalDays: number
  fallbackStock: number
  snapshots: Array<{ date: Date; qty: number }>
  consumedByDate: Map<string, number>
}) {
  const { startDate, totalDays, fallbackStock, snapshots, consumedByDate } = params
  const series = new Map<string, number>()
  const endDate = addDays(startDate, totalDays - 1)
  const startDateMs = startDate.getTime()
  const endDateMs = endDate.getTime()
  const inRangeSnapshots = snapshots
    .filter((snapshot) => {
      const snapshotDateMs = snapshot.date.getTime()
      return snapshotDateMs >= startDateMs && snapshotDateMs <= endDateMs
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (!inRangeSnapshots.length) {
    let currentStock = Math.max(fallbackStock, 0)
    for (let offset = totalDays - 1; offset >= 0; offset -= 1) {
      const currentDate = addDays(startDate, offset)
      const dateKey = formatDateKey(currentDate)
      series.set(dateKey, currentStock)
      currentStock = Math.max(currentStock + (consumedByDate.get(dateKey) || 0), 0)
    }
    return series
  }

  inRangeSnapshots.forEach((snapshot) => {
    series.set(formatDateKey(snapshot.date), Math.max(snapshot.qty, 0))
  })

  for (let index = 0; index < inRangeSnapshots.length; index += 1) {
    const currentSnapshot = inRangeSnapshots[index]
    const previousSnapshot = index > 0 ? inRangeSnapshots[index - 1] : null
    let cursorDate = currentSnapshot.date
    let cursorStock = Math.max(currentSnapshot.qty, 0)

    while (true) {
      const previousDate = addDays(cursorDate, -1)
      if (previousDate.getTime() < startDateMs) break
      if (previousSnapshot && previousDate.getTime() <= previousSnapshot.date.getTime()) break

      const cursorDateKey = formatDateKey(cursorDate)
      const previousDateKey = formatDateKey(previousDate)
      cursorStock = Math.max(cursorStock + (consumedByDate.get(cursorDateKey) || 0), 0)
      if (!series.has(previousDateKey)) {
        series.set(previousDateKey, cursorStock)
      }
      cursorDate = previousDate
    }
  }

  for (let index = 0; index < inRangeSnapshots.length; index += 1) {
    const currentSnapshot = inRangeSnapshots[index]
    const nextSnapshot = index + 1 < inRangeSnapshots.length ? inRangeSnapshots[index + 1] : null
    let cursorDate = currentSnapshot.date
    let cursorStock = Math.max(currentSnapshot.qty, 0)

    while (true) {
      const nextDate = addDays(cursorDate, 1)
      if (nextDate.getTime() > endDateMs) break
      if (nextSnapshot && nextDate.getTime() >= nextSnapshot.date.getTime()) break

      const nextDateKey = formatDateKey(nextDate)
      cursorStock = Math.max(cursorStock - (consumedByDate.get(nextDateKey) || 0), 0)
      if (!series.has(nextDateKey)) {
        series.set(nextDateKey, cursorStock)
      }
      cursorDate = nextDate
    }
  }

  return series
}

function buildBaselineStockSeries(params: {
  startDate: Date
  totalDays: number
  baselineDate: Date
  baselineQty: number
  adjustmentsByDate: Map<string, number>
  consumedByDate: Map<string, number>
}) {
  const { startDate, totalDays, baselineDate, baselineQty, adjustmentsByDate, consumedByDate } = params
  const series = new Map<string, number>()
  const endDate = addDays(startDate, totalDays - 1)
  const startDateMs = startDate.getTime()
  const endDateMs = endDate.getTime()
  const normalizedBaselineDate = startOfDay(baselineDate)
  const safeBaselineQty = Math.max(baselineQty, 0)

  for (let currentDate = startDate; currentDate.getTime() < normalizedBaselineDate.getTime() && currentDate.getTime() <= endDateMs; currentDate = addDays(currentDate, 1)) {
    const dateKey = formatDateKey(currentDate)
    series.set(dateKey, 0)
  }

  if (normalizedBaselineDate.getTime() > endDateMs) {
    return series
  }

  let currentStartStock = safeBaselineQty
  for (let currentDate = normalizedBaselineDate; currentDate.getTime() <= endDateMs; currentDate = addDays(currentDate, 1)) {
    const dateKey = formatDateKey(currentDate)
    const endStock = Math.max(
      currentStartStock + (adjustmentsByDate.get(dateKey) || 0) - (consumedByDate.get(dateKey) || 0),
      0,
    )
    if (currentDate.getTime() >= startDateMs) {
      series.set(dateKey, endStock)
    }
    currentStartStock = endStock
  }

  if (normalizedBaselineDate.getTime() < startDateMs) {
    let simulatedStartStock = safeBaselineQty
    for (let currentDate = normalizedBaselineDate; currentDate.getTime() < startDateMs; currentDate = addDays(currentDate, 1)) {
      const dateKey = formatDateKey(currentDate)
      simulatedStartStock = Math.max(
        simulatedStartStock + (adjustmentsByDate.get(dateKey) || 0) - (consumedByDate.get(dateKey) || 0),
        0,
      )
    }

    let currentRangeStartStock = simulatedStartStock
    for (let currentDate = startDate; currentDate.getTime() <= endDateMs; currentDate = addDays(currentDate, 1)) {
      const dateKey = formatDateKey(currentDate)
      const endStock = Math.max(
        currentRangeStartStock + (adjustmentsByDate.get(dateKey) || 0) - (consumedByDate.get(dateKey) || 0),
        0,
      )
      series.set(dateKey, endStock)
      currentRangeStartStock = endStock
    }
  }

  return series
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
    const requestedSku = normalizeCell(searchParams.get('sku'))
    const requestedGroupId = String(searchParams.get('groupId') || '').trim()
    const selectedRange = resolveRange(searchParams)

    const [products, aliases, groups] = await Promise.all([
      prisma.product.findMany({
        where: { isActive: true },
        select: {
          id: true,
          sku: true,
          name: true,
          stock: true,
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
      prisma.productSalesGroup.findMany({
        orderBy: { createdAt: 'asc' },
      }),
    ])

    const skuResolver = buildProductSkuResolver(products, aliases)
    const { getFilterPrimarySkuForProduct, getPrimarySku, getRelatedSkus, resolveProductBySku } = skuResolver

    const skuOptionsSet = new Set<string>()
    const skuOptions: Array<{ sku: string; label: string }> = []
    const registerSkuOption = (sku: string | null | undefined) => {
      const value = normalizeCell(sku)
      if (!value || skuOptionsSet.has(value)) return
      skuOptionsSet.add(value)
      skuOptions.push({ sku: value, label: value })
    }

    products.forEach((product) => {
      const mainSku = getFilterPrimarySkuForProduct(product) || normalizeCell(product.sku)
      if (!mainSku) return
      registerSkuOption(mainSku)
    })

    const groupOptions = groups.map((group) => ({
      id: group.id,
      name: group.name,
      skus: Array.isArray(group.skus) ? group.skus.map((item) => String(item || '').trim()).filter(Boolean) : [],
    }))

    const selectedSku = requestedSku
    const resolvedSelectedSku = selectedSku
      ? (resolveProductBySku(selectedSku)?.primarySku || selectedSku)
      : ''
    const selectedGroup = !selectedSku
      ? groupOptions.find((group) => group.id === requestedGroupId) || null
      : null

    let trendTitle = '销售库存趋势 - 全部 SKU'

    if (resolvedSelectedSku) {
      trendTitle = `销售库存趋势 - SKU ${resolvedSelectedSku}`
    } else if (selectedGroup) {
      trendTitle = `销售库存趋势 - 分组 ${selectedGroup.name}`
    }

    const inventoryTargets = (() => {
      if (selectedSku) {
        const match = resolveProductBySku(selectedSku)
        if (!match) {
          return [{
            key: `missing:${selectedSku}`,
            productId: null,
            productSku: null,
            fallbackStock: 0,
            requestedSkus: [selectedSku],
            consumedSkus: [selectedSku],
            snapshotCandidateSkus: [],
            baselineCandidateSkus: [selectedSku],
          }] satisfies InventoryTarget[]
        }

        const relatedSkus = getRelatedSkus(match.product.id)
        const snapshotCandidateSkus: string[] = []
        addUniqueSku(snapshotCandidateSkus, selectedSku)
        addUniqueSku(snapshotCandidateSkus, getPrimarySku(match.product.id))
        relatedSkus.forEach((sku) => addUniqueSku(snapshotCandidateSkus, sku))

        const baselineCandidateSkus: string[] = []
        addUniqueSku(baselineCandidateSkus, selectedSku)
        relatedSkus.forEach((sku) => addUniqueSku(baselineCandidateSkus, sku))

        return [{
          key: match.product.id,
          productId: match.product.id,
          productSku: getPrimarySku(match.product.id) || match.product.sku,
          fallbackStock: match.product.stock || 0,
          requestedSkus: [selectedSku],
          consumedSkus: relatedSkus.length ? relatedSkus : [selectedSku],
          snapshotCandidateSkus,
          baselineCandidateSkus,
        }] satisfies InventoryTarget[]
      }

      if (selectedGroup) {
        const targetMap = new Map<string, InventoryTarget>()
        const missingTargets: InventoryTarget[] = []

        selectedGroup.skus.forEach((groupSku) => {
          const sku = normalizeCell(groupSku)
          if (!sku) return

          const match = resolveProductBySku(sku)
          if (!match) {
            missingTargets.push({
              key: `missing:${sku}`,
              productId: null,
              productSku: null,
              fallbackStock: 0,
              requestedSkus: [sku],
              consumedSkus: [sku],
              snapshotCandidateSkus: [],
              baselineCandidateSkus: [sku],
            })
            return
          }

          const existing = targetMap.get(match.product.id)
          if (existing) {
            addUniqueSku(existing.requestedSkus, sku)
            addUniqueSku(existing.consumedSkus, sku)
            return
          }

          targetMap.set(match.product.id, {
            key: match.product.id,
            productId: match.product.id,
            productSku: getPrimarySku(match.product.id) || match.product.sku,
            fallbackStock: match.product.stock || 0,
            requestedSkus: [sku],
            consumedSkus: [],
            snapshotCandidateSkus: [],
            baselineCandidateSkus: [],
          })
        })

        const matchedTargets = Array.from(targetMap.values()).map((target) => {
          const relatedSkus = getRelatedSkus(target.productId || '')
          const snapshotCandidateSkus: string[] = []
          target.requestedSkus.forEach((sku) => addUniqueSku(snapshotCandidateSkus, sku))
          addUniqueSku(snapshotCandidateSkus, target.productSku)
          relatedSkus.forEach((sku) => addUniqueSku(snapshotCandidateSkus, sku))

          const baselineCandidateSkus: string[] = []
          target.requestedSkus.forEach((sku) => addUniqueSku(baselineCandidateSkus, sku))
          relatedSkus.forEach((sku) => addUniqueSku(baselineCandidateSkus, sku))

          return {
            ...target,
            consumedSkus: relatedSkus.length ? relatedSkus : target.requestedSkus,
            snapshotCandidateSkus,
            baselineCandidateSkus,
          }
        })

        return [...matchedTargets, ...missingTargets]
      }

      return products.map((product) => {
        const relatedSkus = getRelatedSkus(product.id)
        const snapshotCandidateSkus: string[] = []
        addUniqueSku(snapshotCandidateSkus, getPrimarySku(product.id) || product.sku)
        relatedSkus.forEach((sku) => addUniqueSku(snapshotCandidateSkus, sku))

        const baselineCandidateSkus: string[] = []
        relatedSkus.forEach((sku) => addUniqueSku(baselineCandidateSkus, sku))
        addUniqueSku(baselineCandidateSkus, getPrimarySku(product.id) || product.sku)

        const consumedSkus = relatedSkus.length
          ? relatedSkus
          : (getPrimarySku(product.id) ? [getPrimarySku(product.id)!] : (product.sku ? [product.sku] : []))

        return {
          key: product.id,
          productId: product.id,
          productSku: getPrimarySku(product.id) || product.sku,
          fallbackStock: product.stock || 0,
          requestedSkus: getPrimarySku(product.id) ? [getPrimarySku(product.id)!] : (product.sku ? [product.sku] : []),
          consumedSkus,
          snapshotCandidateSkus,
          baselineCandidateSkus,
        }
      })
    })()

    const querySkuList = Array.from(new Set(
      inventoryTargets.flatMap((target) => target.consumedSkus.flatMap((sku) => buildSkuMatchVariants(sku))),
    ))

    const performanceData = selectedSku || selectedGroup
      ? (querySkuList.length
        ? await prisma.performanceDaily.findMany({
            where: {
              date: {
                gte: selectedRange.startDate,
                lt: selectedRange.endExclusive,
              },
              sku: {
                in: querySkuList,
              },
            },
            select: {
              sku: true,
              orders: true,
              grossOrders: true,
              returnQty: true,
              netOrders: true,
              canceledQty: true,
              stockConsumedQty: true,
              refundAmount: true,
              date: true,
            },
          })
        : [])
      : await prisma.performanceDaily.findMany({
          where: {
            date: {
              gte: selectedRange.startDate,
              lt: selectedRange.endExclusive,
            },
          },
          select: {
            sku: true,
            orders: true,
            grossOrders: true,
            returnQty: true,
            netOrders: true,
            canceledQty: true,
            stockConsumedQty: true,
            refundAmount: true,
            date: true,
          },
        })

    const salesMap = new Map<string, number>()
    const filterSummary = {
      grossOrders: 0,
      returnQty: 0,
      netOrders: 0,
      canceledQty: 0,
      refundAmount: 0,
    }
    const targetKeyByProductId = new Map(
      inventoryTargets
        .filter((target) => target.productId)
        .map((target) => [target.productId as string, target.key] as const),
    )

    performanceData.forEach((item) => {
      const match = resolveProductBySku(item.sku)
      const targetKey = match?.product ? targetKeyByProductId.get(match.product.id) : null
      if ((selectedSku || selectedGroup) && !targetKey) return

      const perfDate = startOfDay(new Date(item.date))
      const dateKey = formatDateKey(perfDate)
      salesMap.set(dateKey, (salesMap.get(dateKey) || 0) + item.orders)
      filterSummary.grossOrders += item.grossOrders || 0
      filterSummary.returnQty += item.returnQty || 0
      filterSummary.netOrders += item.netOrders || 0
      filterSummary.canceledQty += item.canceledQty || 0
      filterSummary.refundAmount += item.refundAmount || 0
    })

    filterSummary.refundAmount = Number(filterSummary.refundAmount.toFixed(2))

    const baselineSkuList = Array.from(new Set(
      inventoryTargets.flatMap((target) => target.baselineCandidateSkus.map((sku) => normalizeCell(sku)).filter(Boolean)),
    ))

    const baselineRows = baselineSkuList.length
      ? await prisma.productStockBaseline.findMany({
          where: {
            sku: {
              in: baselineSkuList,
            },
            baselineDate: {
              lt: selectedRange.endExclusive,
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
    const registerBaseline = (key: string, row: BaselineRow) => {
      if (!key) return
      const bucket = exactBaselineMap.get(key) || []
      bucket.push(row)
      exactBaselineMap.set(key, bucket)

      const normalizedKey = normalizeSkuForCompare(key)
      if (!normalizedKey) return
      const normalizedBucket = normalizedBaselineMap.get(normalizedKey) || []
      normalizedBucket.push(row)
      normalizedBaselineMap.set(normalizedKey, normalizedBucket)
    }

    baselineRows.forEach((baseline) => {
      const row: BaselineRow = {
        id: baseline.id,
        sku: baseline.sku,
        quantity: baseline.quantity,
        baselineDate: startOfDay(new Date(baseline.baselineDate)),
        note: baseline.note,
      }
      registerBaseline(baseline.sku, row)
    })

    const adjustmentRows = baselineSkuList.length
      ? await prisma.productStockAdjustment.findMany({
          where: {
            sku: {
              in: baselineSkuList,
            },
            adjustmentDate: {
              lt: selectedRange.endExclusive,
            },
          },
          orderBy: [
            { adjustmentDate: 'asc' },
            { createdAt: 'asc' },
          ],
        })
      : []

    const exactAdjustmentMap = new Map<string, AdjustmentRow[]>()
    const normalizedAdjustmentMap = new Map<string, AdjustmentRow[]>()
    const registerAdjustment = (key: string, row: AdjustmentRow) => {
      if (!key) return
      const bucket = exactAdjustmentMap.get(key) || []
      bucket.push(row)
      exactAdjustmentMap.set(key, bucket)

      const normalizedKey = normalizeSkuForCompare(key)
      if (!normalizedKey) return
      const normalizedBucket = normalizedAdjustmentMap.get(normalizedKey) || []
      normalizedBucket.push(row)
      normalizedAdjustmentMap.set(normalizedKey, normalizedBucket)
    }

    adjustmentRows.forEach((adjustment) => {
      const row: AdjustmentRow = {
        id: adjustment.id,
        sku: adjustment.sku,
        quantity: adjustment.quantity,
        adjustmentDate: startOfDay(new Date(adjustment.adjustmentDate)),
        type: adjustment.type,
        note: adjustment.note,
      }
      registerAdjustment(adjustment.sku, row)
    })

    const snapshotSkuList = Array.from(new Set(
      inventoryTargets.flatMap((target) => target.snapshotCandidateSkus.map((sku) => normalizeCell(sku)).filter(Boolean)),
    ))

    const snapshotRows = snapshotSkuList.length
      ? await prisma.productInventorySnapshot.findMany({
          where: {
            sku: {
              in: snapshotSkuList,
            },
            date: {
              lt: selectedRange.endExclusive,
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
            { date: 'asc' },
          ],
        })
      : []

    const snapshotsBySku = new Map<string, ResolvedSnapshotRow[]>()
    snapshotRows.forEach((item) => {
      const bucket = snapshotsBySku.get(item.sku) || []
      bucket.push({
        sku: item.sku,
        date: startOfDay(new Date(item.date)),
        qty: resolveSnapshotQty({
          totalQty: item.totalQty,
          availableQty: item.availableQty,
          lockedQty: item.lockedQty,
        }),
      })
      snapshotsBySku.set(item.sku, bucket)
    })

    const totalDays = Math.max(
      1,
      Math.round((selectedRange.endExclusive.getTime() - selectedRange.startDate.getTime()) / 86_400_000),
    )

    const stockByDate = new Map<string, number>()

    const inventoryStates = inventoryTargets.map((target) => {
      const allSnapshots = target.snapshotCandidateSkus.flatMap((sku) => snapshotsBySku.get(sku) || [])
      const resolvedSnapshotByDate = new Map<string, { date: Date; qty: number }>()
      target.snapshotCandidateSkus.forEach((sku) => {
        ;(snapshotsBySku.get(sku) || []).forEach((snapshot) => {
          if (snapshot.qty === null) return
          const dateKey = formatDateKey(snapshot.date)
          if (!resolvedSnapshotByDate.has(dateKey)) {
            resolvedSnapshotByDate.set(dateKey, {
              date: snapshot.date,
              qty: snapshot.qty,
            })
          }
        })
      })

      const resolvedSnapshots = Array.from(resolvedSnapshotByDate.values()).sort((a, b) => a.date.getTime() - b.date.getTime())

      const baselineCandidates = Array.from(new Map(
        target.baselineCandidateSkus.flatMap((sku) => {
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
        target.baselineCandidateSkus.flatMap((sku) => {
          const normalizedSku = normalizeSkuForCompare(sku)
          const rows = [
            ...(exactAdjustmentMap.get(sku) || []),
            ...(normalizedSku ? (normalizedAdjustmentMap.get(normalizedSku) || []) : []),
          ]
          return rows.map((row) => [`${row.id}`, row] as const)
        }),
      ).values()).sort((a, b) => a.adjustmentDate.getTime() - b.adjustmentDate.getTime())

      return {
        target,
        fallbackStock: target.fallbackStock,
        firstSnapshot: allSnapshots[0] || null,
        lastSnapshot: allSnapshots[allSnapshots.length - 1] || null,
        resolvedSnapshots,
        activeBaseline,
        adjustmentCandidates,
      }
    })

    const inventoryConsumptionStartDate = inventoryStates.reduce((earliest, targetState) => {
      if (!targetState.activeBaseline) return earliest
      return targetState.activeBaseline.baselineDate.getTime() < earliest.getTime()
        ? targetState.activeBaseline.baselineDate
        : earliest
    }, selectedRange.startDate)

    const inventoryConsumedSkuList = Array.from(new Set(
      inventoryTargets.flatMap((target) => target.consumedSkus.flatMap((sku) => buildSkuMatchVariants(sku))),
    ))

    const inventoryPerformanceData = inventoryConsumedSkuList.length
      ? await prisma.performanceDaily.findMany({
          where: {
            date: {
              gte: inventoryConsumptionStartDate,
              lt: selectedRange.endExclusive,
            },
            sku: {
              in: inventoryConsumedSkuList,
            },
          },
          select: {
            sku: true,
            orders: true,
            netOrders: true,
            stockConsumedQty: true,
            date: true,
          },
          orderBy: [
            { date: 'asc' },
            { sku: 'asc' },
          ],
        })
      : []

    const stockConsumedByTargetMap = new Map<string, Map<string, number>>()

    inventoryPerformanceData.forEach((item) => {
      const match = resolveProductBySku(item.sku)
      const targetKey = match?.product ? targetKeyByProductId.get(match.product.id) : null
      if (!targetKey) return

      const dateKey = formatDateKey(startOfDay(new Date(item.date)))
      const consumedByDate = stockConsumedByTargetMap.get(targetKey) || new Map<string, number>()
      consumedByDate.set(dateKey, (consumedByDate.get(dateKey) || 0) + (item.stockConsumedQty || 0))
      stockConsumedByTargetMap.set(targetKey, consumedByDate)
    })

    inventoryStates.forEach((targetState) => {
      const consumedByDate = stockConsumedByTargetMap.get(targetState.target.key) || new Map<string, number>()
      const adjustmentsByDate = new Map<string, number>()
      targetState.adjustmentCandidates.forEach((adjustment) => {
        const dateKey = formatDateKey(adjustment.adjustmentDate)
        adjustmentsByDate.set(dateKey, (adjustmentsByDate.get(dateKey) || 0) + adjustment.quantity)
      })
      const targetSeries = targetState.activeBaseline
        ? buildBaselineStockSeries({
            startDate: selectedRange.startDate,
            totalDays,
            baselineDate: targetState.activeBaseline.baselineDate,
            baselineQty: targetState.activeBaseline.quantity,
            adjustmentsByDate,
            consumedByDate,
          })
        : buildFallbackStockSeries({
            startDate: selectedRange.startDate,
            totalDays,
            fallbackStock: targetState.fallbackStock,
            snapshots: targetState.resolvedSnapshots,
            consumedByDate,
          })

      targetSeries.forEach((stock, dateKey) => {
        stockByDate.set(dateKey, (stockByDate.get(dateKey) || 0) + Math.max(stock, 0))
      })
    })

    const trends = Array.from({ length: totalDays }, (_, offset) => {
      const currentDate = addDays(selectedRange.startDate, offset)
      const dateKey = formatDateKey(currentDate)

      return {
        date: dateKey,
        label: dateKey.slice(5),
        orders: salesMap.get(dateKey) || 0,
        stock: Math.max(stockByDate.get(dateKey) || 0, 0),
      }
    })

    if (selectedSku) {
      const debugTarget = inventoryStates[0]
      const debugTargetKey = debugTarget?.target.key || ''
      const debugConsumedByDate = stockConsumedByTargetMap.get(debugTargetKey) || new Map<string, number>()
      const debugPerformanceRows = inventoryPerformanceData
        .filter((item) => {
          const match = resolveProductBySku(item.sku)
          const targetKey = match?.product ? targetKeyByProductId.get(match.product.id) : null
          return targetKey === debugTargetKey
        })
        .map((item) => ({
          date: formatDateKey(startOfDay(new Date(item.date))),
          sku: item.sku,
          orders: item.orders || 0,
          netOrders: item.netOrders || 0,
          stockConsumedQty: item.stockConsumedQty || 0,
        }))

      if (debugPerformanceRows.some((item) => (item.orders > 0 || item.netOrders > 0) && item.stockConsumedQty === 0)) {
        console.warn('Product sales inventory trend stockConsumedQty warning:', {
          selectedSku,
          baselineDate: debugTarget?.activeBaseline ? formatDateKey(debugTarget.activeBaseline.baselineDate) : null,
          rows: debugPerformanceRows,
        })
      }

      console.log('Product sales inventory trend debug:', {
        selectedSku,
        resolvedSelectedSku,
        resolvedProductSku: debugTarget?.target.productSku || null,
        resolvedProductId: debugTarget?.target.productId || null,
        productStock: debugTarget?.fallbackStock ?? 0,
        baselineSku: debugTarget?.activeBaseline?.sku || null,
        baselineDate: debugTarget?.activeBaseline ? formatDateKey(debugTarget.activeBaseline.baselineDate) : null,
        baselineQty: debugTarget?.activeBaseline?.quantity ?? null,
        inventoryConsumptionStartDate: formatDateKey(inventoryConsumptionStartDate),
        performanceRows: debugPerformanceRows,
        consumedByDate: Array.from(debugConsumedByDate.entries()).map(([date, qty]) => ({ date, qty })),
        adjustments: (debugTarget?.adjustmentCandidates || []).map((item) => ({
          date: formatDateKey(item.adjustmentDate),
          quantity: item.quantity,
          type: item.type,
        })),
        snapshotCount: debugTarget?.resolvedSnapshots.length || 0,
        firstSnapshot: debugTarget?.firstSnapshot
          ? {
              sku: debugTarget.firstSnapshot.sku,
              date: formatDateKey(debugTarget.firstSnapshot.date),
              qty: debugTarget.firstSnapshot.qty,
            }
          : null,
        lastSnapshot: debugTarget?.lastSnapshot
          ? {
              sku: debugTarget.lastSnapshot.sku,
              date: formatDateKey(debugTarget.lastSnapshot.date),
              qty: debugTarget.lastSnapshot.qty,
            }
          : null,
        finalInventorySeries: trends.map((item) => ({
          date: item.date,
          stock: item.stock,
        })),
      })
    }

    return NextResponse.json({
      selectedSku: resolvedSelectedSku,
      selectedGroupId: selectedGroup?.id || '',
      trendRange: selectedRange.range,
      startDate: selectedRange.startDateText,
      endDate: selectedRange.endDateText,
      trendTitle,
      skuOptions,
      groupOptions: groupOptions.map((group) => ({
        id: group.id,
        name: group.name,
      })),
      filterSummary,
      trends,
    })
  } catch (error) {
    console.error('获取产品销售趋势失败:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取产品销售趋势失败' },
      { status: 500 },
    )
  }
}
