import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { buildEffectiveInventorySnapshotWhere } from '@/lib/productInventorySnapshots'
import { prepareInventoryConfirmRows } from '@/lib/inventoryImportConfirm'
import {
  INVENTORY_BATCH_STATUS,
} from '@/lib/inventoryPurchasing'

const STOCK_CAPTURED_AT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000
const CONFIRM_TRANSACTION_MAX_WAIT_MS = 10_000
const CONFIRM_TRANSACTION_TIMEOUT_MS = 30_000

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
  try {
    const batch = await prisma.inventoryImportBatch.findUnique({
      where: { id },
      include: {
        skuCandidates: {
          select: { rowNumber: true, normalizedSku: true, status: true, resolvedProductId: true, resolvedCanonicalSku: true },
        },
      },
    })
    if (!batch) {
      throw new Error('导入批次不存在')
    }
    if (batch.status !== INVENTORY_BATCH_STATUS.PREVIEW) {
      throw new Error('只有 PREVIEW 状态的批次可以确认导入')
    }

    const precheck = prepareInventoryConfirmRows(batch)
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
          skuCandidates: {
            select: { rowNumber: true, normalizedSku: true, status: true, resolvedProductId: true, resolvedCanonicalSku: true },
          },
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

      const finalRows = prepareInventoryConfirmRows(lockedBatch)
      if (finalRows.blocked) {
        return finalRows
      }

      const productIds = Array.from(new Set(finalRows.matchedRows.map((row) => row.productId).filter(Boolean)))
      const products = productIds.length
        ? await tx.product.findMany({
            where: {
              id: { in: productIds },
              isActive: true,
            },
            select: {
              id: true,
              sku: true,
            },
          })
        : []
      const canonicalSkuByProductId = new Map(
        products.flatMap((product) => (product.sku ? [[product.id, product.sku] as const] : [])),
      )
      const finalRowsWithDatabaseSku = prepareInventoryConfirmRows(lockedBatch, canonicalSkuByProductId)
      if (finalRowsWithDatabaseSku.blocked) {
        return finalRowsWithDatabaseSku
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

      const staleSnapshots = finalRowsWithDatabaseSku.matchedSkus.length
        ? await tx.productInventorySnapshot.findMany({
            where: buildEffectiveInventorySnapshotWhere({
              sku: { in: finalRowsWithDatabaseSku.matchedSkus },
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
        data: finalRowsWithDatabaseSku.snapshotCreateData,
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
