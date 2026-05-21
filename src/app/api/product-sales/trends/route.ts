import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type RangeKey = 'today' | '7' | '30' | 'custom'
type ProductLookup = {
  id: string
  sku: string | null
  name: string
  stock: number
}

type ProductMatchType =
  | 'main'
  | 'alias'
  | 'product-sku-parentheses'
  | 'product-name-parentheses'

type ProductMatch = {
  product: ProductLookup
  matchType: ProductMatchType
}

type InventoryTarget = {
  key: string
  productId: string | null
  productSku: string | null
  fallbackStock: number
  requestedSkus: string[]
  snapshotCandidateSkus: string[]
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

function setLookupIfMissing<T>(lookupMap: Map<string, T>, normalizedLookupMap: Map<string, T>, key: string, value: T) {
  if (!key) return
  if (!lookupMap.has(key)) {
    lookupMap.set(key, value)
  }

  const normalizedKey = normalizeSkuForCompare(key)
  if (normalizedKey && !normalizedLookupMap.has(normalizedKey)) {
    normalizedLookupMap.set(normalizedKey, value)
  }
}

function addUniqueSku(target: string[], sku: string | null | undefined) {
  const value = normalizeCell(sku)
  if (!value || target.includes(value)) return
  target.push(value)
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

    const productById = new Map(products.map((product) => [product.id, product]))
    const exactMainSkuMap = new Map<string, ProductLookup>()
    const normalizedMainSkuMap = new Map<string, ProductLookup>()
    const exactAliasSkuMap = new Map<string, ProductLookup>()
    const normalizedAliasSkuMap = new Map<string, ProductLookup>()
    const exactProductSkuParentheticalMap = new Map<string, ProductLookup>()
    const normalizedProductSkuParentheticalMap = new Map<string, ProductLookup>()
    const exactProductNameParentheticalMap = new Map<string, ProductLookup>()
    const normalizedProductNameParentheticalMap = new Map<string, ProductLookup>()

    products.forEach((product) => {
      if (product.sku) {
        setLookupIfMissing(exactMainSkuMap, normalizedMainSkuMap, product.sku, product)
      }
    })

    aliases.forEach((alias) => {
      const product = productById.get(alias.productId)
      if (!product) return
      setLookupIfMissing(exactAliasSkuMap, normalizedAliasSkuMap, alias.aliasSku, product)
    })

    products.forEach((product) => {
      extractAliasSkusFromText(product.sku).forEach((aliasSku) => {
        if (exactMainSkuMap.has(aliasSku) || exactAliasSkuMap.has(aliasSku)) return
        setLookupIfMissing(
          exactProductSkuParentheticalMap,
          normalizedProductSkuParentheticalMap,
          aliasSku,
          product,
        )
      })

      extractAliasSkusFromText(product.name).forEach((aliasSku) => {
        if (
          exactMainSkuMap.has(aliasSku) ||
          exactAliasSkuMap.has(aliasSku) ||
          exactProductSkuParentheticalMap.has(aliasSku)
        ) {
          return
        }
        setLookupIfMissing(
          exactProductNameParentheticalMap,
          normalizedProductNameParentheticalMap,
          aliasSku,
          product,
        )
      })
    })

    const resolveProductBySku = (sku: string): ProductMatch | null => {
      const normalizedSku = normalizeSkuForCompare(sku)
      if (!normalizedSku) return null

      const mainProduct = exactMainSkuMap.get(sku) || normalizedMainSkuMap.get(normalizedSku)
      if (mainProduct) {
        return { product: mainProduct, matchType: 'main' }
      }

      const aliasProduct = exactAliasSkuMap.get(sku) || normalizedAliasSkuMap.get(normalizedSku)
      if (aliasProduct) {
        return { product: aliasProduct, matchType: 'alias' }
      }

      const skuParentheticalProduct = exactProductSkuParentheticalMap.get(sku)
        || normalizedProductSkuParentheticalMap.get(normalizedSku)
      if (skuParentheticalProduct) {
        return { product: skuParentheticalProduct, matchType: 'product-sku-parentheses' }
      }

      const nameParentheticalProduct = exactProductNameParentheticalMap.get(sku)
        || normalizedProductNameParentheticalMap.get(normalizedSku)
      if (nameParentheticalProduct) {
        return { product: nameParentheticalProduct, matchType: 'product-name-parentheses' }
      }

      return null
    }

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

    const groupOptions = groups.map((group) => ({
      id: group.id,
      name: group.name,
      skus: Array.isArray(group.skus) ? group.skus.map((item) => String(item || '').trim()).filter(Boolean) : [],
    }))

    const selectedSku = requestedSku
    const selectedGroup = !selectedSku
      ? groupOptions.find((group) => group.id === requestedGroupId) || null
      : null

    let salesSkuList: string[] = []
    let trendTitle = '销售库存趋势 - 全部 SKU'

    if (selectedSku) {
      salesSkuList = [selectedSku]
      trendTitle = `销售库存趋势 - SKU ${selectedSku}`
    } else if (selectedGroup) {
      salesSkuList = Array.from(new Set(selectedGroup.skus.map((sku) => normalizeCell(sku)).filter(Boolean)))
      trendTitle = `销售库存趋势 - 分组 ${selectedGroup.name}`
    }

    const performanceData = selectedSku || selectedGroup
      ? (salesSkuList.length
        ? await prisma.performanceDaily.findMany({
            where: {
              date: {
                gte: selectedRange.startDate,
                lt: selectedRange.endExclusive,
              },
              sku: {
                in: salesSkuList,
              },
            },
            select: {
              sku: true,
              orders: true,
              grossOrders: true,
              returnQty: true,
              netOrders: true,
              canceledQty: true,
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

    performanceData.forEach((item) => {
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
            snapshotCandidateSkus: [],
          }] satisfies InventoryTarget[]
        }

        const snapshotCandidateSkus: string[] = []
        addUniqueSku(snapshotCandidateSkus, selectedSku)
        if (match.matchType !== 'main') {
          addUniqueSku(snapshotCandidateSkus, match.product.sku)
        }

        return [{
          key: match.product.id,
          productId: match.product.id,
          productSku: match.product.sku,
          fallbackStock: match.product.stock || 0,
          requestedSkus: [selectedSku],
          snapshotCandidateSkus,
        }] satisfies InventoryTarget[]
      }

      if (selectedGroup) {
        const targetMap = new Map<string, InventoryTarget>()

        selectedGroup.skus.forEach((groupSku) => {
          const sku = normalizeCell(groupSku)
          if (!sku) return

          const match = resolveProductBySku(sku)
          if (!match) return

          const existing = targetMap.get(match.product.id)
          if (existing) {
            addUniqueSku(existing.requestedSkus, sku)
            return
          }

          targetMap.set(match.product.id, {
            key: match.product.id,
            productId: match.product.id,
            productSku: match.product.sku,
            fallbackStock: match.product.stock || 0,
            requestedSkus: [sku],
            snapshotCandidateSkus: [],
          })
        })

        return Array.from(targetMap.values()).map((target) => {
          const snapshotCandidateSkus: string[] = []
          if (target.productSku && target.requestedSkus.includes(target.productSku)) {
            addUniqueSku(snapshotCandidateSkus, target.productSku)
          }
          target.requestedSkus.forEach((sku) => addUniqueSku(snapshotCandidateSkus, sku))
          addUniqueSku(snapshotCandidateSkus, target.productSku)
          return {
            ...target,
            snapshotCandidateSkus,
          }
        })
      }

      return products.map((product) => {
        const snapshotCandidateSkus: string[] = []
        addUniqueSku(snapshotCandidateSkus, product.sku)
        return {
          key: product.id,
          productId: product.id,
          productSku: product.sku,
          fallbackStock: product.stock || 0,
          requestedSkus: product.sku ? [product.sku] : [],
          snapshotCandidateSkus,
        }
      })
    })()

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
          },
          orderBy: [
            { sku: 'asc' },
            { date: 'asc' },
          ],
        })
      : []

    const snapshotsBySku = new Map<string, Array<{ date: Date; totalQty: number }>>()
    snapshotRows.forEach((item) => {
      const bucket = snapshotsBySku.get(item.sku) || []
      bucket.push({
        date: startOfDay(new Date(item.date)),
        totalQty: item.totalQty || 0,
      })
      snapshotsBySku.set(item.sku, bucket)
    })

    const stockByDate = new Map<string, number>()
    const totalDays = Math.max(
      1,
      Math.round((selectedRange.endExclusive.getTime() - selectedRange.startDate.getTime()) / 86_400_000),
    )

    const inventoryStates = inventoryTargets.map((target) => ({
      fallbackStock: target.fallbackStock,
      snapshotStates: target.snapshotCandidateSkus.map((sku) => ({
        snapshots: (snapshotsBySku.get(sku) || []).map((item) => ({
          dateMs: item.date.getTime(),
          totalQty: item.totalQty,
        })),
        index: 0,
        currentQty: null as number | null,
      })),
    }))

    for (let offset = 0; offset < totalDays; offset += 1) {
      const currentDate = addDays(selectedRange.startDate, offset)
      const currentDateMs = currentDate.getTime()
      const dateKey = formatDateKey(currentDate)
      let totalStock = 0

      inventoryStates.forEach((targetState) => {
        let resolvedStock: number | null = null

        targetState.snapshotStates.forEach((snapshotState) => {
          while (
            snapshotState.index < snapshotState.snapshots.length &&
            snapshotState.snapshots[snapshotState.index].dateMs <= currentDateMs
          ) {
            snapshotState.currentQty = snapshotState.snapshots[snapshotState.index].totalQty
            snapshotState.index += 1
          }

          if (resolvedStock === null && snapshotState.currentQty !== null) {
            resolvedStock = snapshotState.currentQty
          }
        })

        totalStock += resolvedStock ?? targetState.fallbackStock
      })

      stockByDate.set(dateKey, totalStock)
    }

    const trends = Array.from({ length: totalDays }, (_, offset) => {
      const currentDate = addDays(selectedRange.startDate, offset)
      const dateKey = formatDateKey(currentDate)

      return {
        date: dateKey,
        label: dateKey.slice(5),
        orders: salesMap.get(dateKey) || 0,
        stock: stockByDate.get(dateKey) || 0,
      }
    })

    return NextResponse.json({
      selectedSku,
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
