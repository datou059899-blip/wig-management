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

function getSkuGroup(sku: string) {
  const normalized = String(sku || '').trim()
  if (!normalized) return ''
  return normalized.split('-')[0]
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const requestedSku = String(searchParams.get('sku') || '').trim()
    const requestedGroup = String(searchParams.get('group') || '').trim()
    const requestedRange = searchParams.get('range') === '30' ? 30 : 7

    const today = startOfDay(new Date())
    const yesterday = addDays(today, -1)
    const sevenDaysAgo = addDays(today, -7)
    const thirtyDaysAgo = addDays(today, -30)
    const trendStartDate = addDays(today, -(requestedRange - 1))

    const products = await prisma.product.findMany({
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
    })

    const skuProducts = products.filter((product): product is typeof product & { sku: string } => Boolean(product.sku))

    const skuOptions = skuProducts.map((product) => ({
      sku: product.sku,
      name: product.name,
    }))

    const groupOptions = Array.from(
      new Set(
        skuProducts
          .map((product) => getSkuGroup(product.sku))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b))

    const selectedSku = skuOptions.some((item) => item.sku === requestedSku) ? requestedSku : ''
    const selectedGroup = groupOptions.includes(requestedGroup) ? requestedGroup : ''

    let trendSkuList = skuProducts.map((product) => product.sku)
    let trendTitle = '销售库存趋势 - 全部 SKU'

    if (selectedSku) {
      trendSkuList = [selectedSku]
      trendTitle = `销售库存趋势 - SKU ${selectedSku}`
    } else if (selectedGroup) {
      trendSkuList = skuProducts
        .filter((product) => getSkuGroup(product.sku) === selectedGroup)
        .map((product) => product.sku)
      trendTitle = `销售库存趋势 - 分组 ${selectedGroup}`
    }

    const performanceData = await prisma.performanceDaily.findMany({
      where: {
        date: {
          gte: thirtyDaysAgo,
        },
      },
      select: {
        sku: true,
        orders: true,
        date: true,
      },
    })

    const salesBySku: Record<string, { today: number; yesterday: number; week: number; month: number }> = {}

    products.forEach((product) => {
      if (product.sku) {
        salesBySku[product.sku] = { today: 0, yesterday: 0, week: 0, month: 0 }
      }
    })

    performanceData.forEach((perf) => {
      if (!perf.sku) return
      if (!salesBySku[perf.sku]) {
        salesBySku[perf.sku] = { today: 0, yesterday: 0, week: 0, month: 0 }
      }

      const perfDate = startOfDay(new Date(perf.date))

      if (perfDate.getTime() === today.getTime()) {
        salesBySku[perf.sku].today += perf.orders
      }
      if (perfDate.getTime() === yesterday.getTime()) {
        salesBySku[perf.sku].yesterday += perf.orders
      }
      if (perfDate >= sevenDaysAgo) {
        salesBySku[perf.sku].week += perf.orders
      }
      if (perfDate >= thirtyDaysAgo) {
        salesBySku[perf.sku].month += perf.orders
      }
    })

    const tableData = products.map((product) => {
      const sales = salesBySku[product.sku || ''] || { today: 0, yesterday: 0, week: 0, month: 0 }
      const stock = product.stock || 0

      let stockStatus = '正常'
      if (stock === 0) {
        stockStatus = '断货'
      } else if (stock <= 10) {
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
        stock,
        stockStatus,
        updatedAt: product.updatedAt.toISOString(),
      }
    })

    const totalTodaySales = Object.values(salesBySku).reduce((sum, s) => sum + s.today, 0)
    const totalYesterdaySales = Object.values(salesBySku).reduce((sum, s) => sum + s.yesterday, 0)
    const totalWeekSales = Object.values(salesBySku).reduce((sum, s) => sum + s.week, 0)
    const totalMonthSales = Object.values(salesBySku).reduce((sum, s) => sum + s.month, 0)
    const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0)
    const lowStockCount = products.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) <= 10).length
    const outOfStockCount = products.filter((p) => (p.stock || 0) === 0).length

    const trendSkuSet = new Set(trendSkuList)
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
      if (!perf.sku || !trendSkuSet.has(perf.sku)) return

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
      summary: {
        todaySales: totalTodaySales,
        yesterdaySales: totalYesterdaySales,
        weekSales: totalWeekSales,
        monthSales: totalMonthSales,
        totalStock,
        lowStockCount,
        outOfStockCount,
      },
      selectedSku,
      selectedGroup,
      trendRange: requestedRange,
      trendTitle,
      skuOptions,
      groupOptions,
      trends,
      products: tableData,
    })
  } catch (error) {
    console.error('获取产品销售库存失败:', error)
    return NextResponse.json(
      { error: '获取数据失败' },
      { status: 500 }
    )
  }
}
