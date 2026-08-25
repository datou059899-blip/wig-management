import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessPage, canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import {
  INVENTORY_BATCH_STATUS,
  MAX_IMPORT_STOCK_QTY,
  jsonRows,
  type InventoryPreviewMatchedRow,
  type InventoryPreviewSourceRow,
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canManagePage(permissionContext, 'inventoryPurchasing')) {
    return NextResponse.json({ error: '未授权访问' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body?.action || '')
  const canonicalSku = String(body?.canonicalSku || '').trim()
  if (action !== 'approveDuplicateMerge' || !canonicalSku) {
    return NextResponse.json({ error: '请求参数无效' }, { status: 400 })
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryImportBatch.findUnique({ where: { id: params.id } })
      if (!batch) throw new Error('导入批次不存在')
      if (batch.status !== INVENTORY_BATCH_STATUS.PREVIEW) throw new Error('只有 PREVIEW 状态的批次可以处理重复 SKU')

      const matchedRows = jsonRows<InventoryPreviewMatchedRow>(batch.matchedRows)
      const unmatchedRows = jsonRows<InventoryPreviewUnmatchedRow>(batch.unmatchedRows)
      const targetKey = canonicalSku.toUpperCase()
      const duplicateRows = unmatchedRows.filter(
        (row) => row.kind === 'duplicate_conflict' && String(row.canonicalSku || '').toUpperCase() === targetKey,
      )
      if (duplicateRows.length < 2) throw new Error('未找到可合并的重复 SKU 分组')
      if (duplicateRows.some((row) => row.totalQty === null || row.totalQty === undefined || !Number.isInteger(row.totalQty) || row.totalQty < 0)) {
        throw new Error('重复 SKU 分组存在库存异常，不能合并')
      }

      const first = duplicateRows[0]
      if (!first.productId || !first.productName || !first.canonicalSku) {
        throw new Error('重复 SKU 分组缺少 canonical 产品信息，不能合并')
      }
      if (duplicateRows.some((row) => row.productId !== first.productId || row.canonicalSku !== first.canonicalSku)) {
        throw new Error('重复 SKU 分组 canonical 产品不一致，不能合并')
      }

      const totalQty = duplicateRows.reduce((sum, row) => sum + Number(row.totalQty || 0), 0)
      if (!Number.isSafeInteger(totalQty) || totalQty > MAX_IMPORT_STOCK_QTY) {
        throw new Error(`重复 SKU 合并库存超过安全上限 ${MAX_IMPORT_STOCK_QTY}，请人工检查`)
      }
      const sourceRows: InventoryPreviewSourceRow[] = duplicateRows.map((row) => ({
        rowNumber: row.rowNumber,
        inputSku: row.inputSku,
        productName: row.inputProductName || row.productName || first.productName || '',
        totalQty: Number(row.totalQty || 0),
      }))
      const previousTotalQty = duplicateRows.find((row) => row.previousTotalQty !== undefined)?.previousTotalQty ?? null
      const mergedRow: InventoryPreviewMatchedRow = {
        rowNumber: Math.min(...duplicateRows.map((row) => row.rowNumber)),
        inputSku: first.inputSku,
        canonicalSku: first.canonicalSku,
        productId: first.productId,
        productName: first.productName,
        totalQty,
        previousTotalQty,
        diffQty: previousTotalQty === null ? null : totalQty - previousTotalQty,
        sourceRows,
        resolution: 'duplicate_merge_approved',
      }

      const remainingUnmatchedRows = unmatchedRows.filter(
        (row) => !(row.kind === 'duplicate_conflict' && String(row.canonicalSku || '').toUpperCase() === targetKey),
      )
      const nextMatchedRows = [...matchedRows, mergedRow].sort((a, b) => a.rowNumber - b.rowNumber)

      const saved = await tx.inventoryImportBatch.update({
        where: { id: batch.id },
        data: {
          matchedRows: nextMatchedRows,
          unmatchedRows: remainingUnmatchedRows,
          matchedCount: nextMatchedRows.length,
          unmatchedCount: remainingUnmatchedRows.length,
        },
      })

      return { saved, matchedRows: nextMatchedRows, unmatchedRows: remainingUnmatchedRows }
    })

    return NextResponse.json({
      batch: {
        ...updated.saved,
        stockCapturedAt: updated.saved.stockCapturedAt.toISOString(),
        importedAt: updated.saved.importedAt?.toISOString() ?? null,
        createdAt: updated.saved.createdAt.toISOString(),
        updatedAt: updated.saved.updatedAt.toISOString(),
        matchedRows: undefined,
        unmatchedRows: undefined,
      },
      matchedRows: updated.matchedRows,
      unmatchedRows: updated.unmatchedRows,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '处理重复 SKU 失败' },
      { status: 400 },
    )
  }
}
