import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type AdsImportItem = {
  date: string // YYYY-MM-DD
  sku: string
  adsCost: number
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const user = session.user as any
    const userRole = user?.role as string | undefined
    if (!userRole || (userRole !== 'admin' && userRole !== 'operator' && userRole !== 'optimizer')) {
      return NextResponse.json({ error: '无权限导入广告数据' }, { status: 403 })
    }

    const body = await request.json()
    const items: AdsImportItem[] = Array.isArray(body.items) ? body.items : []

    if (!items.length) {
      return NextResponse.json({ error: '无有效广告数据' }, { status: 400 })
    }

    const normalized = items
      .map((item) => {
        const sku = String(item.sku || '').trim()
        const dateStr = String(item.date || '').trim()
        if (!sku || !dateStr) return null

        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return null

        const adsCost = Number(item.adsCost) || 0

        return {
          date,
          sku,
          adsCost,
        }
      })
      .filter(Boolean) as {
      date: Date
      sku: string
      adsCost: number
    }[]

    if (!normalized.length) {
      return NextResponse.json({ error: '无法解析任何有效广告数据' }, { status: 400 })
    }

    const ops = normalized.map((item) =>
      prisma.performanceDaily.upsert({
        where: {
          date_sku: {
            date: item.date,
            sku: item.sku,
          },
        },
        create: {
          date: item.date,
          sku: item.sku,
          adsCost: item.adsCost,
        },
        update: {
          adsCost: {
            increment: item.adsCost,
          },
        },
      }),
    )

    await prisma.$transaction(ops)

    await prisma.performanceMeta.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        lastAdsImportAt: new Date(),
        lastImportedBy: user?.name || user?.email || '系统',
      },
      update: {
        lastAdsImportAt: new Date(),
        lastImportedBy: user?.name || user?.email || '系统',
      },
    })

    return NextResponse.json({ success: true, count: normalized.length })
  } catch (error) {
    console.error('导入广告数据失败:', error)
    return NextResponse.json({ error: '导入广告数据失败' }, { status: 500 })
  }
}

