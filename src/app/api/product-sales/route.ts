import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // 获取所有产品
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

    // 获取销售数据
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

    // 按 SKU 聚合销售数据
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

      const perfDate = new Date(perf.date)
      perfDate.setHours(0, 0, 0, 0)

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

    // 构建产品表格数据
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

    // 计算汇总数据
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
