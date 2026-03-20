import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const sp = request.nextUrl.searchParams
    const date = (sp.get('date') || 'today').trim() // today | yyyy-mm-dd
    const take = Math.min(Number(sp.get('take') || 50), 200)

    const start = new Date()
    if (date === 'today') {
      start.setHours(0, 0, 0, 0)
    } else {
      const d = new Date(date)
      if (!isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0)
        start.setTime(d.getTime())
      } else {
        start.setHours(0, 0, 0, 0)
      }
    }
    const end = new Date(start)
    end.setDate(end.getDate() + 1)

    const logs = await prisma.scriptUpdateLog.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        script: { select: { id: true, title: true, platform: true, productSku: true } },
      },
    })

    return NextResponse.json({ logs })
  } catch (error) {
    console.error('获取更新动态失败:', error)
    return NextResponse.json({ error: '获取更新动态失败' }, { status: 500 })
  }
}

