import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessPage, getSessionPermissionContext } from '@/lib/pagePermissions'
import {
  jsonRows,
  type InventoryPreviewMatchedRow,
  type InventoryPreviewUnmatchedRow,
} from '@/lib/inventoryPurchasing'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canAccessPage(permissionContext, 'inventoryPurchasing')) {
    return NextResponse.json({ error: '未授权访问' }, { status: 401 })
  }

  const { id } = params
  const batch = await prisma.inventoryImportBatch.findUnique({
    where: { id },
  })

  if (!batch) {
    return NextResponse.json({ error: '导入批次不存在' }, { status: 404 })
  }

  return NextResponse.json({
    batch: {
      ...batch,
      stockCapturedAt: batch.stockCapturedAt.toISOString(),
      importedAt: batch.importedAt?.toISOString() ?? null,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
      matchedRows: undefined,
      unmatchedRows: undefined,
    },
    matchedRows: jsonRows<InventoryPreviewMatchedRow>(batch.matchedRows),
    unmatchedRows: jsonRows<InventoryPreviewUnmatchedRow>(batch.unmatchedRows),
  })
}
