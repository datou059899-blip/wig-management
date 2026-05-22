import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value.trim() : String(value).trim()
}

function parseQty(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return NaN
  return Number(parsed.toFixed(4))
}

function serializeMaterial(item: {
  id: string
  name: string
  unit: string | null
  initialQty: number
  currentQty: number
  warningQty: number
  note: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: item.id,
    name: item.name,
    unit: item.unit || '',
    initialQty: item.initialQty,
    currentQty: item.currentQty,
    warningQty: item.warningQty,
    note: item.note || '',
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }
}

async function requireSession() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { error: NextResponse.json({ error: '未登录' }, { status: 401 }) }
  }

  return { error: null }
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
    const { error } = await requireSession()
    if (error) return error

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)

    const [materials, monthlyTransactions] = await Promise.all([
      prisma.materialItem.findMany({
        where: { isActive: true },
        orderBy: [
          { updatedAt: 'desc' },
          { name: 'asc' },
        ],
      }),
      prisma.materialTransaction.findMany({
        where: {
          transactionDate: {
            gte: monthStart,
          },
          type: {
            in: ['consume', 'replenish'],
          },
        },
        select: {
          type: true,
        },
      }),
    ])

    const lowStockCount = materials.filter((item) => item.currentQty > 0 && item.currentQty <= item.warningQty).length
    const outOfStockCount = materials.filter((item) => item.currentQty <= 0).length
    const totalCurrentQty = Number(materials.reduce((sum, item) => sum + item.currentQty, 0).toFixed(4))
    const monthlyConsumeCount = monthlyTransactions.filter((item) => item.type === 'consume').length
    const monthlyReplenishCount = monthlyTransactions.filter((item) => item.type === 'replenish').length

    return NextResponse.json({
      materials: materials.map(serializeMaterial),
      summary: {
        totalCount: materials.length,
        lowStockCount,
        outOfStockCount,
        totalCurrentQty,
        monthlyConsumeCount,
        monthlyReplenishCount,
      },
    })
  } catch (error) {
    console.error('获取耗材列表失败:', error)
    return NextResponse.json({ error: '获取耗材列表失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const body = await request.json()
    const name = normalizeCell(body?.name)
    const unit = normalizeCell(body?.unit)
    const initialQty = parseQty(body?.initialQty ?? 0)
    const warningQty = parseQty(body?.warningQty ?? 0)
    const note = normalizeCell(body?.note)

    if (!name) {
      return NextResponse.json({ error: '品名不能为空' }, { status: 400 })
    }

    if (!Number.isFinite(initialQty) || initialQty < 0) {
      return NextResponse.json({ error: '初始数量必须是大于等于 0 的数字' }, { status: 400 })
    }

    if (!Number.isFinite(warningQty) || warningQty < 0) {
      return NextResponse.json({ error: '预警数量必须是大于等于 0 的数字' }, { status: 400 })
    }

    const existing = await prisma.materialItem.findUnique({
      where: { name },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json({ error: '该耗材品名已存在' }, { status: 400 })
    }

    const now = new Date()
    const material = await prisma.$transaction(async (tx) => {
      const created = await tx.materialItem.create({
        data: {
          name,
          unit: unit || null,
          initialQty,
          currentQty: initialQty,
          warningQty,
          note: note || null,
        },
      })

      await tx.materialTransaction.create({
        data: {
          materialId: created.id,
          materialName: created.name,
          type: 'init',
          quantity: initialQty,
          beforeQty: 0,
          afterQty: initialQty,
          transactionDate: now,
          reason: '新增耗材',
          note: note || null,
        },
      })

      return created
    })

    return NextResponse.json({
      material: serializeMaterial(material),
    })
  } catch (error) {
    console.error('新增耗材失败:', error)
    return NextResponse.json({ error: '新增耗材失败' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const body = await request.json()
    const id = normalizeCell(body?.id)
    const name = normalizeCell(body?.name)
    const unit = normalizeCell(body?.unit)
    const warningQty = parseQty(body?.warningQty ?? 0)
    const note = normalizeCell(body?.note)

    if (!id) {
      return NextResponse.json({ error: '缺少耗材 ID' }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: '品名不能为空' }, { status: 400 })
    }

    if (!Number.isFinite(warningQty) || warningQty < 0) {
      return NextResponse.json({ error: '预警数量必须是大于等于 0 的数字' }, { status: 400 })
    }

    const existing = await prisma.materialItem.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: '耗材不存在' }, { status: 404 })
    }

    const duplicate = await prisma.materialItem.findFirst({
      where: {
        name,
        NOT: { id },
      },
      select: { id: true },
    })
    if (duplicate) {
      return NextResponse.json({ error: '该耗材品名已存在' }, { status: 400 })
    }

    const material = await prisma.materialItem.update({
      where: { id },
      data: {
        name,
        unit: unit || null,
        warningQty,
        note: note || null,
      },
    })

    return NextResponse.json({
      material: serializeMaterial(material),
    })
  } catch (error) {
    console.error('更新耗材失败:', error)
    return NextResponse.json({ error: '更新耗材失败' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const body = await request.json()
    const id = normalizeCell(body?.id)
    if (!id) {
      return NextResponse.json({ error: '缺少耗材 ID' }, { status: 400 })
    }

    const existing = await prisma.materialItem.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: '耗材不存在' }, { status: 404 })
    }

    await prisma.materialItem.update({
      where: { id },
      data: {
        isActive: false,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('停用耗材失败:', error)
    return NextResponse.json({ error: '停用耗材失败' }, { status: 500 })
  }
}
