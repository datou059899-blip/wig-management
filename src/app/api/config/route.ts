import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 获取配置
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const configs = await prisma.config.findMany()
    const configMap = Object.fromEntries(configs.map(c => [c.key, c.value]))

    return NextResponse.json(configMap)
  } catch (error) {
    console.error('获取配置失败:', error)
    return NextResponse.json({ error: '获取配置失败' }, { status: 500 })
  }
}

// 更新配置
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userRole = (session.user as any).role
    if (userRole !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 })
    }

    const data = await request.json()

    // 批量更新配置
    for (const [key, value] of Object.entries(data)) {
      await prisma.config.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('更新配置失败:', error)
    return NextResponse.json({ error: '更新配置失败' }, { status: 500 })
  }
}
