import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { isUniqueConstraintError, updateSupplier } from '@/lib/inventoryPurchasingBusiness'

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
    const supplier = await updateSupplier(params.id, body)
    return NextResponse.json({ supplier })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: '供应商名称已存在' }, { status: 409 })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: '供应商不存在' }, { status: 404 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新供应商失败' },
      { status: 400 },
    )
  }
}
