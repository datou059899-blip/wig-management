import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { InventorySkuCandidateError, refreshInventorySkuCandidates } from '@/lib/inventorySkuCandidates'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canManagePage(permissionContext, 'inventoryPurchasing')) {
    return NextResponse.json({ error: '未授权访问' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const apply = body?.apply === true
  try {
    const result = await refreshInventorySkuCandidates(
      params.id,
      apply,
      String((session?.user as { id?: string; email?: string } | undefined)?.id || session?.user?.email || ''),
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof InventorySkuCandidateError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('重新检查库存新 SKU 候选失败:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : '重新检查库存新 SKU 候选失败' }, { status: 400 })
  }
}
