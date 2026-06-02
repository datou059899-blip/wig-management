import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const DEFAULT_SETTINGS = {
  aDailySalesThreshold: 20,
  bDailySalesThreshold: 10,
  cStockRatioThreshold: 0.1,
  cOrderRatioThreshold: 0.2,
  dActiveDaysThreshold: 3,
  windowDays: 7,
}

async function requireOperator() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { error: NextResponse.json({ error: '未登录' }, { status: 401 }) }
  }

  const permissionContext = getSessionPermissionContext(session)
  if (!canManagePage(permissionContext, 'productSales')) {
    return { error: NextResponse.json({ error: '无权限操作销售库存' }, { status: 403 }) }
  }

  return { error: null }
}

function serializeSetting(setting: {
  id: string
  aDailySalesThreshold: number
  bDailySalesThreshold: number
  cStockRatioThreshold: number
  cOrderRatioThreshold: number
  dActiveDaysThreshold: number
  windowDays: number
  createdAt: Date
  updatedAt: Date
} | null) {
  if (!setting) {
    return {
      id: '',
      ...DEFAULT_SETTINGS,
      createdAt: '',
      updatedAt: '',
    }
  }

  return {
    id: setting.id,
    aDailySalesThreshold: setting.aDailySalesThreshold,
    bDailySalesThreshold: setting.bDailySalesThreshold,
    cStockRatioThreshold: setting.cStockRatioThreshold,
    cOrderRatioThreshold: setting.cOrderRatioThreshold,
    dActiveDaysThreshold: setting.dActiveDaysThreshold,
    windowDays: setting.windowDays,
    createdAt: setting.createdAt.toISOString(),
    updatedAt: setting.updatedAt.toISOString(),
  }
}

export async function GET() {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const setting = await prisma.productSalesRankSetting.findFirst({
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json({
      setting: serializeSetting(setting),
    })
  } catch (error) {
    console.error('获取动销等级设置失败:', error)
    return NextResponse.json({ error: '获取动销等级设置失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const body = await request.json()
    const aDailySalesThreshold = Number(body?.aDailySalesThreshold)
    const bDailySalesThreshold = Number(body?.bDailySalesThreshold)
    const cStockRatioThreshold = Number(body?.cStockRatioThreshold)
    const cOrderRatioThreshold = Number(body?.cOrderRatioThreshold)
    const dActiveDaysThreshold = Number(body?.dActiveDaysThreshold)

    if (!Number.isInteger(aDailySalesThreshold) || aDailySalesThreshold <= 0) {
      return NextResponse.json({ error: 'A 日均销量阈值必须是正整数' }, { status: 400 })
    }
    if (!Number.isInteger(bDailySalesThreshold) || bDailySalesThreshold <= 0) {
      return NextResponse.json({ error: 'B 日均销量阈值必须是正整数' }, { status: 400 })
    }
    if (aDailySalesThreshold <= bDailySalesThreshold) {
      return NextResponse.json({ error: 'A 阈值必须大于 B 阈值' }, { status: 400 })
    }
    if (!Number.isFinite(cStockRatioThreshold) || cStockRatioThreshold <= 0) {
      return NextResponse.json({ error: 'C 库存占比阈值必须大于 0' }, { status: 400 })
    }
    if (!Number.isFinite(cOrderRatioThreshold) || cOrderRatioThreshold <= 0) {
      return NextResponse.json({ error: 'C 全店订单占比阈值必须大于 0' }, { status: 400 })
    }
    if (!Number.isInteger(dActiveDaysThreshold) || dActiveDaysThreshold <= 0) {
      return NextResponse.json({ error: 'D 出单天数阈值必须是正整数' }, { status: 400 })
    }

    const existing = await prisma.productSalesRankSetting.findFirst({
      orderBy: { updatedAt: 'desc' },
    })

    const setting = existing
      ? await prisma.productSalesRankSetting.update({
          where: { id: existing.id },
          data: {
            aDailySalesThreshold,
            bDailySalesThreshold,
            cStockRatioThreshold,
            cOrderRatioThreshold,
            dActiveDaysThreshold,
          },
        })
      : await prisma.productSalesRankSetting.create({
          data: {
            ...DEFAULT_SETTINGS,
            aDailySalesThreshold,
            bDailySalesThreshold,
            cStockRatioThreshold,
            cOrderRatioThreshold,
            dActiveDaysThreshold,
          },
        })

    return NextResponse.json({
      setting: serializeSetting(setting),
    })
  } catch (error) {
    console.error('保存动销等级设置失败:', error)
    return NextResponse.json({ error: '保存动销等级设置失败' }, { status: 500 })
  }
}
