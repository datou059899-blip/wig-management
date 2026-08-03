import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getProductSalesWeeklyConsumptionData, type WeeklyConsumptionMode } from '@/lib/productSalesWeeklyConsumption'

export const dynamic = 'force-dynamic'

function parseLimitWeeks(value: string | null) {
  const parsed = Number(value || 8)
  if (!Number.isFinite(parsed)) return 8
  return Math.min(Math.max(Math.trunc(parsed), 1), 26)
}

function parseBoolean(value: string | null, fallback: boolean) {
  if (value === null) return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true
  return fallback
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const requestedMode = String(searchParams.get('mode') || 'summary').trim()
    const mode: WeeklyConsumptionMode = requestedMode === 'detail' ? 'detail' : 'summary'
    const data = await getProductSalesWeeklyConsumptionData({
      sku: searchParams.get('sku') || undefined,
      limitWeeks: parseLimitWeeks(searchParams.get('limitWeeks')),
      includeCurrentWeek: parseBoolean(searchParams.get('includeCurrentWeek'), true),
      mode,
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('获取周销售消耗趋势失败:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取周销售消耗趋势失败' },
      { status: 500 },
    )
  }
}
