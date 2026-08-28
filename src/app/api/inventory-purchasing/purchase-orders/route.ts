import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canAccessPage, canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { createPurchaseOrder, listPurchaseOrders } from '@/lib/purchaseOrders'

function unauthorized() {
  return NextResponse.json({ error: '未授权访问' }, { status: 403 })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canAccessPage(permissionContext, 'inventoryPurchasing')) {
    return unauthorized()
  }

  const data = await listPurchaseOrders()
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canManagePage(permissionContext, 'inventoryPurchasing')) {
    return unauthorized()
  }

  const body = await request.json().catch(() => ({}))
  try {
    const order = await createPurchaseOrder(body)
    return NextResponse.json({ order }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '创建采购单失败' },
      { status: 400 },
    )
  }
}
