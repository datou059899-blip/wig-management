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
    const selectedRange = resolveRange(searchParams)
    const today = startOfDay(new Date())
    const yesterday = addDays(today, -1)
    const sevenDaysAgo = addDays(today, -6)
    const thirtyDaysAgo = addDays(today, -29)
    const queryStartDate = selectedRange.startDate < thirtyDaysAgo ? selectedRange.startDate : thirtyDaysAgo
    const queryEndExclusive = selectedRange.endExclusive > addDays(today, 1)
      ? selectedRange.endExclusive
      : addDays(today, 1)

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
          gte: queryStartDate,
          lt: queryEndExclusive,
        },
      },
      select: {
        sku: true,
        orders: true,
        date: true,
      },
    })

    const salesBySku: Record<string, {
      today: number
      yesterday: number
      week: number
      month: number
      selectedRange: number
    }> = {}

    products.forEach((product) => {
      if (product.sku) {
        salesBySku[product.sku] = { today: 0, yesterday: 0, week: 0, month: 0, selectedRange: 0 }
      }
    })

    performanceData.forEach((perf) => {
      if (!perf.sku) return
      if (!salesBySku[perf.sku]) {
        salesBySku[perf.sku] = { today: 0, yesterday: 0, week: 0, month: 0, selectedRange: 0 }
      }

      const perfDate = startOfDay(new Date(perf.date))
      if (perfDate.getTime() === today.getTime()) {
        salesBySku[perf.sku].today += perf.orders
      }
      if (perfDate.getTime() === yesterday.getTime()) {
        salesBySku[perf.sku].yesterday += perf.orders
      }
      if (perfDate >= sevenDaysAgo && perfDate <= today) {
        salesBySku[perf.sku].week += perf.orders
      }
      if (perfDate >= thirtyDaysAgo && perfDate <= today) {
        salesBySku[perf.sku].month += perf.orders
      }
      if (perfDate >= selectedRange.startDate && perfDate < selectedRange.endExclusive) {
        salesBySku[perf.sku].selectedRange += perf.orders
      }
    })

    const tableData = products.map((product) => {
      const sales = salesBySku[product.sku || ''] || {
        today: 0,
        yesterday: 0,
        week: 0,
        month: 0,
        selectedRange: 0,
      }
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
        selectedRangeSales: sales.selectedRange,
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

    const totalTodaySales = Object.values(salesBySku).reduce((sum, item) => sum + item.today, 0)
    const totalYesterdaySales = Object.values(salesBySku).reduce((sum, item) => sum + item.yesterday, 0)
    const totalWeekSales = Object.values(salesBySku).reduce((sum, item) => sum + item.week, 0)
    const totalMonthSales = Object.values(salesBySku).reduce((sum, item) => sum + item.month, 0)
    const totalStock = products.reduce((sum, product) => sum + (product.stock || 0), 0)
    const lowStockCount = products.filter((product) => (product.stock || 0) > 0 && (product.stock || 0) <= 10).length
    const outOfStockCount = products.filter((product) => (product.stock || 0) === 0).length

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
      selectedRange: {
        range: selectedRange.range,
        startDate: selectedRange.startDateText,
        endDate: selectedRange.endDateText,
      },
      skuOptions,
      products: tableData,
    })
  } catch (error) {
    console.error('获取产品销售库存失败:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取数据失败' },
      { status: 500 },
    )
  }
}
