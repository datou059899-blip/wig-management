import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
  return date.toISOString().slice(0, 10)
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
    const requestedRange = searchParams.get('range') === '30' ? 30 : 7

    const today = startOfDay(new Date())
    const thirtyDaysAgo = addDays(today, -30)
    const trendStartDate = addDays(today, -(requestedRange - 1))

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

    const performanceData = await prisma.performanceDaily.findMany({
      where: {
        date: {
          gte: thirtyDaysAgo,
        },
        ...(trendSkuList.length ? { sku: { in: trendSkuList } } : {}),
      },
      select: {
        sku: true,
        orders: true,
        date: true,
      },
    })

    const snapshotRows = trendSkuList.length
      ? await prisma.productInventorySnapshot.findMany({
          where: {
            sku: {
              in: trendSkuList,
            },
            date: {
              lte: today,
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
    performanceData.forEach((perf) => {
      const perfDate = startOfDay(new Date(perf.date))
      if (perfDate < trendStartDate || perfDate > today) return

      const dateKey = formatDateKey(perfDate)
      salesMap.set(dateKey, (salesMap.get(dateKey) || 0) + perf.orders)
    })

    const snapshotsBySku = new Map<string, Array<{ date: Date; totalQty: number }>>()
    snapshotRows.forEach((item) => {
      const bucket = snapshotsBySku.get(item.sku) || []
      bucket.push({
        date: startOfDay(new Date(item.date)),
        totalQty: item.totalQty || 0,
      })
      snapshotsBySku.set(item.sku, bucket)
    })

    const stockFallbackMap = new Map(
      skuProducts.map((product) => [product.sku, product.stock || 0]),
    )

    const stockByDate = new Map<string, number>()
    for (const sku of trendSkuList) {
      const snapshots = snapshotsBySku.get(sku) || []
      let snapshotIndex = 0
      let currentStock = snapshots.length === 0 ? (stockFallbackMap.get(sku) || 0) : 0

      for (let offset = 0; offset < requestedRange; offset += 1) {
        const currentDate = addDays(trendStartDate, offset)

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

    const trends = Array.from({ length: requestedRange }, (_, offset) => {
      const currentDate = addDays(trendStartDate, offset)
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
      trendRange: requestedRange,
      trendTitle,
      skuOptions,
      groupOptions: groupOptions.map((group) => ({
        id: group.id,
        name: group.name,
      })),
      trends,
    })
  } catch (error) {
    console.error('获取产品销售趋势失败:', error)
    return NextResponse.json({ error: '获取产品销售趋势失败' }, { status: 500 })
  }
}
