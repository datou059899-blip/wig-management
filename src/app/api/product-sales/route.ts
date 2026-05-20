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

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const today = startOfDay(new Date())
    const yesterday = addDays(today, -1)
    const sevenDaysAgo = addDays(today, -7)
    const thirtyDaysAgo = addDays(today, -30)

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

    const skuOptions = products
      .filter((product): product is typeof product & { sku: string } => Boolean(product.sku))
      .map((product) => ({
        sku: product.sku,
      }))

    const totalTodaySales = Object.values(salesBySku).reduce((sum, s) => sum + s.today, 0)
    const totalYesterdaySales = Object.values(salesBySku).reduce((sum, s) => sum + s.yesterday, 0)
    const totalWeekSales = Object.values(salesBySku).reduce((sum, s) => sum + s.week, 0)
    const totalMonthSales = Object.values(salesBySku).reduce((sum, s) => sum + s.month, 0)
    const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0)
    const lowStockCount = products.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) <= 10).length
    const outOfStockCount = products.filter((p) => (p.stock || 0) === 0).length

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
      skuOptions,
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
