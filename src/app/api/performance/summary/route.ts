import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type DayPoint = {
  date: string
  gmv: number
  orders: number
  adsCost: number
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const url = new URL(request.url)
    const range = (url.searchParams.get('range') as 'today' | '7d' | '30d' | null) || 'today'

    const now = new Date()
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    let start: Date

    if (range === '7d') {
      start = new Date(end)
      start.setDate(start.getDate() - 7)
    } else if (range === '30d') {
      start = new Date(end)
      start.setDate(start.getDate() - 30)
    } else {
      start = new Date(end)
      start.setDate(start.getDate() - 1)
    }

    const records = await prisma.performanceDaily.findMany({
      where: {
        date: {
          gte: start,
          lt: end,
        },
      },
    })

    const byDate = new Map<string, DayPoint>()
    const todayStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10)

    const bySkuToday = new Map<
      string,
      {
        sku: string
        name: string | null
        productLine: string | null
        owner: string | null
        gmv: number
        orders: number
        adsCost: number
        lastUpdatedAt: string
      }
    >()

    for (const rec of records) {
      const d = rec.date.toISOString().slice(0, 10)
      const existing = byDate.get(d) || { date: d, gmv: 0, orders: 0, adsCost: 0 }
      existing.gmv += rec.gmv
      existing.orders += rec.orders
      existing.adsCost += rec.adsCost
      byDate.set(d, existing)

      if (d === todayStr) {
        const key = rec.sku
        const cur = bySkuToday.get(key) || {
          sku: rec.sku,
          name: rec.productName,
          productLine: rec.productLine,
          owner: rec.owner,
          gmv: 0,
          orders: 0,
          adsCost: 0,
          lastUpdatedAt: rec.updatedAt.toISOString(),
        }
        cur.gmv += rec.gmv
        cur.orders += rec.orders
        cur.adsCost += rec.adsCost
        if (rec.updatedAt > new Date(cur.lastUpdatedAt)) {
          cur.lastUpdatedAt = rec.updatedAt.toISOString()
        }
        if (rec.productName) cur.name = rec.productName
        if (rec.productLine) cur.productLine = rec.productLine
        if (rec.owner) cur.owner = rec.owner
        bySkuToday.set(key, cur)
      }
    }

    const trend: DayPoint[] = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))

    const products = Array.from(bySkuToday.values()).map((row, index) => ({
      id: row.sku || String(index),
      name: row.name || row.sku,
      sku: row.sku,
      productLine: row.productLine || '',
      owner: row.owner || '未分配',
      status: 'normal' as const,
      todayGmv: row.gmv,
      todayOrders: row.orders,
      todayAdsCost: row.adsCost,
      lastUpdatedAt: row.lastUpdatedAt,
    }))

    const meta = await prisma.performanceMeta.findUnique({
      where: { id: 'singleton' },
    })

    let state: 'ok' | 'stale' | 'error' = 'stale'
    const ref = new Date()
    const oneDayMs = 24 * 60 * 60 * 1000

    if (meta?.lastOrdersImportAt || meta?.lastAdsImportAt) {
      const latest = [meta.lastOrdersImportAt, meta.lastAdsImportAt]
        .filter(Boolean)
        .map((d) => (d as Date).getTime())
        .sort((a, b) => b - a)[0]

      if (latest && ref.getTime() - latest <= oneDayMs) {
        state = 'ok'
      } else {
        state = 'stale'
      }
    }

    return NextResponse.json({
      trend,
      products,
      meta: {
        shopLastSyncAt: meta?.lastOrdersImportAt ?? null,
        adsLastSyncAt: meta?.lastAdsImportAt ?? null,
        lastImportedBy: meta?.lastImportedBy ?? null,
        state,
      },
    })
  } catch (error) {
    console.error('获取经营数据汇总失败:', error)
    return NextResponse.json({ error: '获取经营数据失败' }, { status: 500 })
  }
}

