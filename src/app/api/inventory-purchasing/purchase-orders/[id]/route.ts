import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { canAccessPage, canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { getPurchaseOrder, updatePurchaseOrder } from '@/lib/purchaseOrders'

function unauthorized() {
  return NextResponse.json({ error: '未授权访问' }, { status: 403 })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canAccessPage(permissionContext, 'inventoryPurchasing')) {
    return unauthorized()
  }

  try {
    const order = await getPurchaseOrder(params.id)
    return NextResponse.json({ order })
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFound') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return NextResponse.json({ error: '读取采购单失败' }, { status: 500 })
  }
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
    const order = await updatePurchaseOrder(params.id, body)
    return NextResponse.json({ order })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: '采购单不存在' }, { status: 404 })
    }
    if (error instanceof Error && error.name === 'NotFound') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新采购单失败' },
      { status: 400 },
    )
  }
}
