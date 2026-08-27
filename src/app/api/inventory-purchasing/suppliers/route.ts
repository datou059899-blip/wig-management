import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canAccessPage, canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import {
  createSupplier,
  isUniqueConstraintError,
  listSuppliers,
} from '@/lib/inventoryPurchasingBusiness'

function unauthorized() {
  return NextResponse.json({ error: '未授权访问' }, { status: 403 })
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canAccessPage(permissionContext, 'inventoryPurchasing')) {
    return unauthorized()
  }

  const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true'
  const suppliers = await listSuppliers({ includeInactive })

  return NextResponse.json({ suppliers })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canManagePage(permissionContext, 'inventoryPurchasing')) {
    return unauthorized()
  }

  const body = await request.json().catch(() => ({}))

  try {
    const supplier = await createSupplier(body)
    return NextResponse.json({ supplier }, { status: 201 })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: '供应商名称已存在' }, { status: 409 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : '创建供应商失败' },
      { status: 400 },
    )
  }
}
