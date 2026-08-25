import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { buildEffectiveInventorySnapshotWhere } from '@/lib/productInventorySnapshots'
import {
  INVENTORY_BATCH_STATUS,
  MAX_IMPORT_STOCK_QTY,
  jsonRows,
  type InventoryPreviewMatchedRow,
  type InventoryPreviewUnmatchedRow,
} from '@/lib/inventoryPurchasing'

const STOCK_CAPTURED_AT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000
const CONFIRM_TRANSACTION_MAX_WAIT_MS = 10_000
const CONFIRM_TRANSACTION_TIMEOUT_MS = 30_000

type ConfirmBatchInput = {
  id: string
  fileHash: string
  fileName: string
  stockCapturedAt: Date
  matchedRows: Prisma.JsonValue
  unmatchedRows: Prisma.JsonValue
}

function prepareConfirmRows(batch: ConfirmBatchInput, ignoreUnmatched: boolean) {
  const matchedRows = jsonRows<InventoryPreviewMatchedRow>(batch.matchedRows)
  const unmatchedRows = jsonRows<InventoryPreviewUnmatchedRow>(batch.unmatchedRows)
  const duplicateRows = unmatchedRows.filter((row) => row.kind === 'duplicate_conflict' || row.reason.includes('重复 SKU 冲突'))
  if (duplicateRows.length > 0) {
    return {
      blocked: true as const,
      error: '存在未人工确认合并的重复 SKU 冲突，请先在预览中确认合并或修正库存文件',
      duplicateRows,
    }
  }

  if (unmatchedRows.length > 0 && !ignoreUnmatched) {
    return {
      blocked: true as const,
      error: '存在未匹配 SKU，请处理后再确认，或明确选择忽略未匹配 SKU',
      unmatchedRows,
    }
  }

  const matchedSkuCounts = new Map<string, number>()
  matchedRows.forEach((row) => {
    const key = row.canonicalSku.trim().toUpperCase()
    matchedSkuCounts.set(key, (matchedSkuCounts.get(key) || 0) + 1)
  })
  const duplicateMatchedSkus = Array.from(matchedSkuCounts.entries()).filter(([, count]) => count > 1)
  if (duplicateMatchedSkus.length > 0) {
    return {
      blocked: true as const,
      error: '预览中仍存在重复 canonical SKU，禁止确认导入',
      duplicateMatchedSkus: duplicateMatchedSkus.map(([sku, count]) => ({ sku, count })),
    }
  }

  const invalidRows = matchedRows.filter((row) => (
    !row.productId ||
    !row.canonicalSku ||
    !Number.isSafeInteger(row.totalQty) ||
    row.totalQty < 0 ||
    row.totalQty > MAX_IMPORT_STOCK_QTY
  ))
  if (invalidRows.length > 0) {
    return {
      blocked: true as const,
      error: '存在库存数量或 SKU 信息异常的匹配行，禁止确认导入',
      invalidRows: invalidRows.map((row) => ({
        rowNumber: row.rowNumber,
        canonicalSku: row.canonicalSku,
        totalQty: row.totalQty,
        productId: row.productId,
      })),
    }
  }

  const matchedSkus = Array.from(new Set(matchedRows.map((row) => row.canonicalSku).filter(Boolean)))
  const snapshotCreateData = matchedRows.map((row) => ({
    sku: row.canonicalSku,
    date: batch.stockCapturedAt,
    availableQty: 0,
    lockedQty: 0,
    totalQty: row.totalQty,
    sourceFileName: batch.fileName,
    importBatchId: batch.id,
  }))

  return {
    blocked: false as const,
    matchedRows,
    matchedSkus,
    snapshotCreateData,
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canManagePage(permissionContext, 'inventoryPurchasing')) {
    return NextResponse.json({ error: '未授权访问' }, { status: 401 })
  }

  const { id } = params
  const body = await request.json().catch(() => ({}))
  const ignoreUnmatched = Boolean(body?.ignoreUnmatched)

  try {
    const batch = await prisma.inventoryImportBatch.findUnique({ where: { id } })
    if (!batch) {
      throw new Error('导入批次不存在')
    }
    if (batch.status !== INVENTORY_BATCH_STATUS.PREVIEW) {
      throw new Error('只有 PREVIEW 状态的批次可以确认导入')
    }

    const precheck = prepareConfirmRows(batch, ignoreUnmatched)
    if (precheck.blocked) {
      return NextResponse.json(precheck, { status: 409 })
    }

    if (batch.stockCapturedAt.getTime() > Date.now() + STOCK_CAPTURED_AT_FUTURE_TOLERANCE_MS) {
      throw new Error('库存截点时间不能晚于当前时间 5 分钟以上')
    }

    const result = await prisma.$transaction(async (tx) => {
      const lockedBatch = await tx.inventoryImportBatch.findUnique({
        where: { id: batch.id },
        select: {
          id: true,
          status: true,
          fileHash: true,
          fileName: true,
          stockCapturedAt: true,
          matchedRows: true,
          unmatchedRows: true,
        },
      })
      if (!lockedBatch) {
        throw new Error('导入批次不存在')
      }
      if (lockedBatch.status !== INVENTORY_BATCH_STATUS.PREVIEW) {
        throw new Error('只有 PREVIEW 状态的批次可以确认导入')
      }
      if (lockedBatch.fileHash !== batch.fileHash || lockedBatch.stockCapturedAt.getTime() !== batch.stockCapturedAt.getTime()) {
        throw new Error('导入批次状态已变化，请重新打开预览后再确认')
      }

      const finalRows = prepareConfirmRows(lockedBatch, ignoreUnmatched)
      if (finalRows.blocked) {
        return finalRows
      }

      const duplicate = await tx.inventoryImportBatch.findFirst({
        where: {
          id: { not: lockedBatch.id },
          fileHash: lockedBatch.fileHash,
          status: INVENTORY_BATCH_STATUS.CONFIRMED,
        },
        select: { id: true },
      })
      if (duplicate) {
        throw new Error('相同文件已存在 CONFIRMED 批次，禁止重复确认导入')
      }

      const staleSnapshots = finalRows.matchedSkus.length
        ? await tx.productInventorySnapshot.findMany({
            where: buildEffectiveInventorySnapshotWhere({
              sku: { in: finalRows.matchedSkus },
              date: { gte: lockedBatch.stockCapturedAt },
            }),
            select: {
              sku: true,
              date: true,
            },
            orderBy: [
              { sku: 'asc' },
              { date: 'desc' },
            ],
          })
        : []
      if (staleSnapshots.length > 0) {
        const staleRows = staleSnapshots.map((snapshot) => ({
          sku: snapshot.sku,
          latestSnapshotAt: snapshot.date.toISOString(),
          stockCapturedAt: lockedBatch.stockCapturedAt.toISOString(),
        }))
        return {
          blocked: true,
          error: '本次库存截点时间不能早于或等于 SKU 最新有效库存时间',
          staleRows,
        }
      }

      const created = await tx.productInventorySnapshot.createMany({
        data: finalRows.snapshotCreateData,
      })

      const updatedBatch = await tx.inventoryImportBatch.update({
        where: { id: lockedBatch.id },
        data: {
          status: INVENTORY_BATCH_STATUS.CONFIRMED,
          importedAt: new Date(),
        },
      })

      return {
        blocked: false,
        batch: updatedBatch,
        importedSnapshotCount: created.count,
      }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: CONFIRM_TRANSACTION_MAX_WAIT_MS,
      timeout: CONFIRM_TRANSACTION_TIMEOUT_MS,
    })

    if (result.blocked) {
      return NextResponse.json(result, { status: 409 })
    }

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '确认导入失败' },
      { status: 400 },
    )
  }
}
