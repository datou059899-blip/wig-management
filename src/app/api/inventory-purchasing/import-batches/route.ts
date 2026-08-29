import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessPage, canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import {
  getInventoryFileHash,
  INVENTORY_BATCH_STATUS,
  parseInventoryPreviewFile,
  parseStockCapturedAt,
} from '@/lib/inventoryPurchasing'

function unauthorized() {
  return NextResponse.json({ error: '未授权访问' }, { status: 401 })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canAccessPage(permissionContext, 'inventoryPurchasing')) {
    return unauthorized()
  }

  const batches = await prisma.inventoryImportBatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      fileName: true,
      fileHash: true,
      stockCapturedAt: true,
      importedAt: true,
      rowCount: true,
      matchedCount: true,
      unmatchedCount: true,
      status: true,
      note: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({
    batches: batches.map((batch) => ({
      ...batch,
      stockCapturedAt: batch.stockCapturedAt.toISOString(),
      importedAt: batch.importedAt?.toISOString() ?? null,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    })),
  })
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const permissionContext = getSessionPermissionContext(session)
    if (!canManagePage(permissionContext, 'inventoryPurchasing')) {
      return unauthorized()
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请上传库存 Excel 或 CSV 文件' }, { status: 400 })
    }

    const stockCapturedAt = parseStockCapturedAt(formData.get('stockCapturedAt'))
    const note = String(formData.get('note') || '').trim() || null
    const fileHash = await getInventoryFileHash(file)
    const parsed = await parseInventoryPreviewFile(file, stockCapturedAt)
    const duplicateConfirmedBatch = await prisma.inventoryImportBatch.findFirst({
      where: {
        fileHash,
        status: INVENTORY_BATCH_STATUS.CONFIRMED,
      },
      select: { id: true, importedAt: true },
    })

    const batch = await prisma.inventoryImportBatch.create({
      data: {
        fileName: file.name || 'inventory-import',
        fileHash,
        stockCapturedAt,
        rowCount: parsed.rowCount,
        matchedCount: parsed.matchedRows.length,
        unmatchedCount: parsed.unmatchedRows.length,
        status: INVENTORY_BATCH_STATUS.PREVIEW,
        note,
        matchedRows: parsed.matchedRows,
        unmatchedRows: parsed.unmatchedRows,
      },
    })

    return NextResponse.json({
      batch: {
        ...batch,
        stockCapturedAt: batch.stockCapturedAt.toISOString(),
        importedAt: batch.importedAt?.toISOString() ?? null,
        createdAt: batch.createdAt.toISOString(),
        updatedAt: batch.updatedAt.toISOString(),
      },
      matchedRows: parsed.matchedRows,
      unmatchedRows: parsed.unmatchedRows,
      duplicateConfirmedBatch,
      sheetName: parsed.sheetName ?? null,
    })
  } catch (error) {
    console.error('库存导入预览失败:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '库存导入预览失败' },
      { status: 400 },
    )
  }
}
