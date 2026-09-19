import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { InventorySkuCandidateError, resolveInventorySkuCandidate } from '@/lib/inventorySkuCandidates'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; candidateId: string } },
) {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canManagePage(permissionContext, 'inventoryPurchasing')) {
    return NextResponse.json({ error: '未授权访问' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  try {
    const result = await resolveInventorySkuCandidate({
      batchId: params.id,
      candidateId: params.candidateId,
      action: String(body?.action || '') as 'CREATE' | 'MAP' | 'REACTIVATE' | 'IGNORE',
      actor: String((session?.user as { id?: string; email?: string } | undefined)?.id || session?.user?.email || ''),
      productName: body?.productName,
      targetProductId: body?.targetProductId,
      confirmAlias: body?.confirmAlias === true,
      note: body?.note,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof InventorySkuCandidateError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('处理库存新 SKU 候选失败:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : '处理库存新 SKU 候选失败' }, { status: 400 })
  }
}
