import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { INVENTORY_BATCH_STATUS } from '@/lib/inventoryPurchasing'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canManagePage(permissionContext, 'inventoryPurchasing')) {
    return NextResponse.json({ error: '未授权访问' }, { status: 401 })
  }

  const { id } = params
  const batch = await prisma.inventoryImportBatch.findUnique({ where: { id } })
  if (!batch) {
    return NextResponse.json({ error: '导入批次不存在' }, { status: 404 })
  }
  if (batch.status !== INVENTORY_BATCH_STATUS.CONFIRMED) {
    return NextResponse.json({ error: '只有 CONFIRMED 批次可以回滚' }, { status: 400 })
  }

  const updatedBatch = await prisma.inventoryImportBatch.update({
    where: { id },
    data: { status: INVENTORY_BATCH_STATUS.ROLLED_BACK },
  })

  return NextResponse.json({
    batch: {
      ...updatedBatch,
      stockCapturedAt: updatedBatch.stockCapturedAt.toISOString(),
      importedAt: updatedBatch.importedAt?.toISOString() ?? null,
      createdAt: updatedBatch.createdAt.toISOString(),
      updatedAt: updatedBatch.updatedAt.toISOString(),
    },
  })
}
