import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type RangeKey = 'today' | '7' | '30' | 'custom'

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
    const requestedSku = String(searchParams.get('sku') || '').trim()
    const requestedGroupId = String(searchParams.get('groupId') || '').trim()
    const selectedRange = resolveRange(searchParams)

    const products = await prisma.product.findMany({
      where: { isActive: true },
      select: {
        sku: true,
        stock: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    const skuProducts = products.filter((product): product is { sku: string; stock: number } => Boolean(product.sku))
    const skuOptions = skuProducts.map((product) => ({ sku: product.sku }))
    const skuSet = new Set(skuOptions.map((item) => item.sku))

    const groups = await prisma.productSalesGroup.findMany({
      orderBy: { createdAt: 'asc' },
    })

    const groupOptions = groups.map((group) => ({
      id: group.id,
      name: group.name,
      skus: Array.isArray(group.skus) ? group.skus.map((item) => String(item || '').trim()).filter(Boolean) : [],
    }))

    const selectedSku = skuSet.has(requestedSku) ? requestedSku : ''
    const selectedGroup = groupOptions.find((group) => group.id === requestedGroupId) || null

    let trendSkuList = skuOptions.map((item) => item.sku)
    let trendTitle = '销售库存趋势 - 全部 SKU'

    if (selectedSku) {
      trendSkuList = [selectedSku]
      trendTitle = `销售库存趋势 - SKU ${selectedSku}`
    } else if (selectedGroup) {
      trendSkuList = selectedGroup.skus.filter((sku) => skuSet.has(sku))
      trendTitle = `销售库存趋势 - 分组 ${selectedGroup.name}`
    }

    const performanceData = trendSkuList.length
      ? await prisma.performanceDaily.findMany({
          where: {
            date: {
              gte: selectedRange.startDate,
              lt: selectedRange.endExclusive,
            },
            sku: {
              in: trendSkuList,
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
      : []

    const snapshotRows = trendSkuList.length
      ? await prisma.productInventorySnapshot.findMany({
          where: {
            sku: {
              in: trendSkuList,
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

    const snapshotsBySku = new Map<string, Array<{ date: Date; totalQty: number }>>()
    snapshotRows.forEach((item) => {
      const bucket = snapshotsBySku.get(item.sku) || []
      bucket.push({
        date: startOfDay(new Date(item.date)),
        totalQty: item.totalQty || 0,
      })
      snapshotsBySku.set(item.sku, bucket)
    })

    const stockFallbackMap = new Map(skuProducts.map((product) => [product.sku, product.stock || 0]))
    const stockByDate = new Map<string, number>()
    const totalDays = Math.max(
      1,
      Math.round((selectedRange.endExclusive.getTime() - selectedRange.startDate.getTime()) / 86_400_000),
    )

    for (const sku of trendSkuList) {
      const snapshots = snapshotsBySku.get(sku) || []
      let snapshotIndex = 0
      let currentStock = stockFallbackMap.get(sku) || 0

      for (let offset = 0; offset < totalDays; offset += 1) {
        const currentDate = addDays(selectedRange.startDate, offset)

        while (
          snapshotIndex < snapshots.length &&
          snapshots[snapshotIndex].date.getTime() <= currentDate.getTime()
        ) {
          currentStock = snapshots[snapshotIndex].totalQty
          snapshotIndex += 1
        }

        const dateKey = formatDateKey(currentDate)
        stockByDate.set(dateKey, (stockByDate.get(dateKey) || 0) + currentStock)
      }
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
