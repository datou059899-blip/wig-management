import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canAccessPage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { canDeactivateProduct } from '@/lib/permissions'
import {
  createProductListingEvent,
  getProductListingEventContext,
  ProductListingEventError,
} from '@/lib/productListingEvents'

export const dynamic = 'force-dynamic'

function actorFromSession(session: any) {
  return String(session?.user?.email || session?.user?.name || session?.user?.id || '').trim()
}

function errorResponse(error: unknown) {
  if (error instanceof ProductListingEventError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error('Product listing event操作失败:', error)
  return NextResponse.json({ error: 'Product listing event操作失败' }, { status: 500 })
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canAccessPage(permissionContext, 'products')) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  try {
    const context = await getProductListingEventContext(params.id)
    return NextResponse.json({
      ...context,
      canManage: canDeactivateProduct((session?.user as any)?.role),
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
  if (!canDeactivateProduct((session.user as any)?.role)) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '请求内容不是有效JSON' }, { status: 400 })
  }

  try {
    const result = await createProductListingEvent({
      ...body,
      productId: params.id,
      reason: body.reason || body.action,
      recordedBy: actorFromSession(session),
    })
    return NextResponse.json(result, { status: result.idempotent ? 200 : 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
