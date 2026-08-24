import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const permissionContext = getSessionPermissionContext(session)
  if (!canManagePage(permissionContext, 'productSales')) {
    return NextResponse.json({ error: '无权限操作销售库存' }, { status: 403 })
  }

  return NextResponse.json(
    { error: '库存导入已迁移至库存与订货中心，请使用 /dashboard/inventory-purchasing 导入库存。' },
    { status: 410 },
  )
}

// 库存导入已迁移至库存与订货中心；旧实现由 Git 历史保留。
