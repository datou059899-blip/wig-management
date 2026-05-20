import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function normalizeSkus(value: unknown) {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  )
}

async function requireOperator() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { error: NextResponse.json({ error: '未登录' }, { status: 401 }) }
  }

  const user = session.user as any
  const userRole = user?.role as string | undefined
  if (!userRole || (userRole !== 'admin' && userRole !== 'operator' && userRole !== 'optimizer')) {
    return { error: NextResponse.json({ error: '无权限' }, { status: 403 }) }
  }

  return { error: null }
}

export async function GET() {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const groups = await prisma.productSalesGroup.findMany({
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        skus: Array.isArray(group.skus) ? group.skus : [],
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('获取产品销售分组失败:', error)
    return NextResponse.json({ error: '获取产品销售分组失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const body = await request.json()
    const name = String(body?.name || '').trim()
    const skus = normalizeSkus(body?.skus)

    if (!name) {
      return NextResponse.json({ error: '分组名称不能为空' }, { status: 400 })
    }

    const existing = await prisma.productSalesGroup.findUnique({
      where: { name },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json({ error: '分组名称已存在' }, { status: 400 })
    }

    const group = await prisma.productSalesGroup.create({
      data: {
        name,
        skus,
      },
    })

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        skus: Array.isArray(group.skus) ? group.skus : [],
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('创建产品销售分组失败:', error)
    return NextResponse.json({ error: '创建产品销售分组失败' }, { status: 500 })
  }
}
