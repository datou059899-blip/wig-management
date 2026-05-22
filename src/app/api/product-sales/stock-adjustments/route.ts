import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const ADJUSTMENT_TYPES = new Set(['replenish', 'manual_adjust', 'damage', 'other'])

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value.trim() : String(value).trim()
}

function parseDateInput(value: string) {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return null

  const [, yearText, monthText, dayText] = matched
  const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText), 0, 0, 0, 0)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

function serializeAdjustment(adjustment: {
  id: string
  sku: string
  quantity: number
  adjustmentDate: Date
  type: string
  note: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: adjustment.id,
    sku: adjustment.sku,
    quantity: adjustment.quantity,
    adjustmentDate: formatDateKey(adjustment.adjustmentDate),
    type: adjustment.type,
    note: adjustment.note || '',
    createdAt: adjustment.createdAt.toISOString(),
    updatedAt: adjustment.updatedAt.toISOString(),
  }
}

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const { searchParams } = new URL(request.url)
    const sku = normalizeCell(searchParams.get('sku'))

    const adjustments = await prisma.productStockAdjustment.findMany({
      where: sku ? { sku } : undefined,
      orderBy: [
        { adjustmentDate: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    return NextResponse.json({
      adjustments: adjustments.map(serializeAdjustment),
    })
  } catch (error) {
    console.error('获取库存补货/调整记录失败:', error)
    return NextResponse.json({ error: '获取库存补货/调整记录失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const body = await request.json()
    const sku = normalizeCell(body?.sku)
    const quantity = Number(body?.quantity)
    const adjustmentDateText = normalizeCell(body?.adjustmentDate)
    const type = normalizeCell(body?.type)
    const note = normalizeCell(body?.note)

    if (!sku) {
      return NextResponse.json({ error: 'SKU 不能为空' }, { status: 400 })
    }

    if (!Number.isInteger(quantity) || quantity === 0) {
      return NextResponse.json({ error: '调整数量不能为 0，且必须是整数' }, { status: 400 })
    }

    if (!adjustmentDateText) {
      return NextResponse.json({ error: '调整日期不能为空' }, { status: 400 })
    }

    const adjustmentDate = parseDateInput(adjustmentDateText)
    if (!adjustmentDate) {
      return NextResponse.json({ error: '调整日期格式必须为 YYYY-MM-DD' }, { status: 400 })
    }

    if (!ADJUSTMENT_TYPES.has(type)) {
      return NextResponse.json({ error: '调整类型无效' }, { status: 400 })
    }

    if (type === 'replenish' && quantity < 0) {
      return NextResponse.json({ error: '补货数量必须为正数' }, { status: 400 })
    }

    if (type === 'damage' && quantity > 0) {
      return NextResponse.json({ error: '损耗数量必须为负数' }, { status: 400 })
    }

    const adjustment = await prisma.productStockAdjustment.create({
      data: {
        sku,
        quantity,
        adjustmentDate,
        type,
        note: note || null,
      },
    })

    return NextResponse.json({
      adjustment: serializeAdjustment(adjustment),
    })
  } catch (error) {
    console.error('保存库存补货/调整记录失败:', error)
    return NextResponse.json({ error: '保存库存补货/调整记录失败' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const body = await request.json()
    const id = normalizeCell(body?.id)
    if (!id) {
      return NextResponse.json({ error: '缺少调整记录 ID' }, { status: 400 })
    }

    await prisma.productStockAdjustment.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除库存补货/调整记录失败:', error)
    return NextResponse.json({ error: '删除库存补货/调整记录失败' }, { status: 500 })
  }
}
