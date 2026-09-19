import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveOrderSkuCandidate } from '@/lib/orderSkuCandidates'
import { InventorySkuCandidateError } from '@/lib/inventorySkuCandidates'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canManagePage(permissionContext, 'productSales')) {
    return NextResponse.json({ error: '未授权访问' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const result = await resolveOrderSkuCandidate({
      candidateId: params.id,
      action: String(body?.action || '') as 'CREATE' | 'MAP' | 'REACTIVATE',
      actor: String((session?.user as { id?: string; email?: string } | undefined)?.id || session?.user?.email || ''),
      productName: body?.productName,
      targetProductId: body?.targetProductId,
      confirmAlias: body?.confirmAlias === true,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof InventorySkuCandidateError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('处理订单待处理 SKU 失败:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : '处理订单待处理 SKU 失败' }, { status: 400 })
  }
}
