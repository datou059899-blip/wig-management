import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { updateProductBusinessFields } from '@/lib/inventoryPurchasingBusiness'

function unauthorized() {
  return NextResponse.json({ error: '未授权访问' }, { status: 403 })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canManagePage(permissionContext, 'inventoryPurchasing')) {
    return unauthorized()
  }

  const body = await request.json().catch(() => ({}))

  try {
    const product = await updateProductBusinessFields(params.id, body)
    return NextResponse.json({ product })
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFound') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新产品经营字段失败' },
      { status: 400 },
    )
  }
}
