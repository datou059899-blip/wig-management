import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createOrderSkuCandidate } from '@/lib/orderSkuCandidates'
import { InventorySkuCandidateError } from '@/lib/inventorySkuCandidates'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { prisma } from '@/lib/prisma'

const EXPECTED_TIKTOK_SHOP_KEY = 'tiktok-us-sunnymay-primary'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canManagePage(permissionContext, 'productSales')) {
    return NextResponse.json({ error: '未授权访问' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const shopConfig = await prisma.config.findUnique({
      where: { key: 'tiktok_shop_key' },
      select: { value: true },
    })
    const shopKey = String(shopConfig?.value || '').trim()
    if (shopKey !== EXPECTED_TIKTOK_SHOP_KEY) {
      throw new InventorySkuCandidateError('TikTok 店铺上下文未配置或不符合已批准配置')
    }
    const candidate = await createOrderSkuCandidate({
      shopKey,
      inputSku: String(body?.inputSku || ''),
      tiktokProductId: String(body?.tiktokProductId || ''),
      tiktokSkuId: String(body?.tiktokSkuId || ''),
      sourceFileName: String(body?.sourceFileName || ''),
      occurrenceCount: Number(body?.occurrenceCount || 0),
      rows: Array.isArray(body?.rows) ? body.rows.map(Number) : [],
    })
    return NextResponse.json({ candidate })
  } catch (error) {
    if (error instanceof InventorySkuCandidateError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('创建订单待处理 SKU 失败:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : '创建订单待处理 SKU 失败' }, { status: 400 })
  }
}
