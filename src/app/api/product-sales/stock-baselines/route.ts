import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

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

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const { searchParams } = new URL(request.url)
    const sku = normalizeCell(searchParams.get('sku'))

    const baselines = await prisma.productStockBaseline.findMany({
      where: sku ? { sku } : undefined,
      orderBy: [
        { baselineDate: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    return NextResponse.json({
      baselines: baselines.map((baseline) => ({
        id: baseline.id,
        sku: baseline.sku,
        quantity: baseline.quantity,
        baselineDate: formatDateKey(baseline.baselineDate),
        note: baseline.note || '',
        createdAt: baseline.createdAt.toISOString(),
        updatedAt: baseline.updatedAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('获取库存基准失败:', error)
    return NextResponse.json({ error: '获取库存基准失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const body = await request.json()
    const sku = normalizeCell(body?.sku)
    const quantityValue = Number(body?.quantity)
    const baselineDateText = normalizeCell(body?.baselineDate)
    const note = normalizeCell(body?.note)

    if (!sku) {
      return NextResponse.json({ error: 'SKU 不能为空' }, { status: 400 })
    }

    if (!Number.isInteger(quantityValue) || quantityValue < 0) {
      return NextResponse.json({ error: '初始库存必须是大于等于 0 的整数' }, { status: 400 })
    }

    if (!baselineDateText) {
      return NextResponse.json({ error: '基准日期不能为空' }, { status: 400 })
    }

    const baselineDate = parseDateInput(baselineDateText)
    if (!baselineDate) {
      return NextResponse.json({ error: '基准日期格式必须为 YYYY-MM-DD' }, { status: 400 })
    }

    const baseline = await prisma.productStockBaseline.upsert({
      where: {
        sku_baselineDate: {
          sku,
          baselineDate,
        },
      },
      update: {
        quantity: quantityValue,
        note: note || null,
      },
      create: {
        sku,
        quantity: quantityValue,
        baselineDate,
        note: note || null,
      },
    })

    return NextResponse.json({
      baseline: {
        id: baseline.id,
        sku: baseline.sku,
        quantity: baseline.quantity,
        baselineDate: formatDateKey(baseline.baselineDate),
        note: baseline.note || '',
        createdAt: baseline.createdAt.toISOString(),
        updatedAt: baseline.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('保存库存基准失败:', error)
    return NextResponse.json({ error: '保存库存基准失败' }, { status: 500 })
  }
}
