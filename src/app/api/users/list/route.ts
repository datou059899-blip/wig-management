import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// 获取用户列表 - 所有登录用户都可访问（用于任务分配等）
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

  try {
    const users = await prisma.user.findMany({
      where: { status: 'enabled' }, // 只返回启用状态的用户
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ users })
  } catch (e) {
    console.error('获取用户列表失败:', e)
    return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 })
  }
}