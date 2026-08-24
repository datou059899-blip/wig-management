import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { buildEffectiveInventorySnapshotWhere } from '@/lib/productInventorySnapshots'
import {
  INVENTORY_BATCH_STATUS,
  jsonRows,
  type InventoryPreviewMatchedRow,
  type InventoryPreviewUnmatchedRow,
} from '@/lib/inventoryPurchasing'

const STOCK_CAPTURED_AT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000

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
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryImportBatch.findUnique({ where: { id } })
      if (!batch) {
        throw new Error('导入批次不存在')
      }
      if (batch.status !== INVENTORY_BATCH_STATUS.PREVIEW) {
        throw new Error('只有 PREVIEW 状态的批次可以确认导入')
      }

      const matchedRows = jsonRows<InventoryPreviewMatchedRow>(batch.matchedRows)
      const unmatchedRows = jsonRows<InventoryPreviewUnmatchedRow>(batch.unmatchedRows)
      const duplicateRows = unmatchedRows.filter((row) => row.reason.includes('重复 SKU 冲突'))
      if (duplicateRows.length > 0) {
        return {
          blocked: true,
          error: '存在重复 SKU 冲突，请先修正库存文件后重新生成预览',
          duplicateRows,
        }
      }

      if (unmatchedRows.length > 0 && !ignoreUnmatched) {
        return {
          blocked: true,
          error: '存在未匹配 SKU，请处理后再确认，或明确选择忽略未匹配 SKU',
          unmatchedRows,
        }
      }

      if (batch.stockCapturedAt.getTime() > Date.now() + STOCK_CAPTURED_AT_FUTURE_TOLERANCE_MS) {
        throw new Error('库存截点时间不能晚于当前时间 5 分钟以上')
      }

      const duplicate = await tx.inventoryImportBatch.findFirst({
        where: {
          id: { not: batch.id },
          fileHash: batch.fileHash,
          status: INVENTORY_BATCH_STATUS.CONFIRMED,
        },
        select: { id: true },
      })
      if (duplicate) {
        throw new Error('相同文件已存在 CONFIRMED 批次，禁止重复确认导入')
      }

      const matchedSkus = Array.from(new Set(matchedRows.map((row) => row.canonicalSku).filter(Boolean)))
      const latestSnapshots = matchedSkus.length
        ? await tx.productInventorySnapshot.findMany({
            where: buildEffectiveInventorySnapshotWhere({
              sku: { in: matchedSkus },
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
      const latestSnapshotBySku = new Map<string, Date>()
      latestSnapshots.forEach((snapshot) => {
        if (!latestSnapshotBySku.has(snapshot.sku)) {
          latestSnapshotBySku.set(snapshot.sku, snapshot.date)
        }
      })
      const staleRows = matchedRows.flatMap((row) => {
        const latestDate = latestSnapshotBySku.get(row.canonicalSku)
        if (!latestDate || batch.stockCapturedAt.getTime() > latestDate.getTime()) return []
        return [{
          sku: row.canonicalSku,
          latestSnapshotAt: latestDate.toISOString(),
          stockCapturedAt: batch.stockCapturedAt.toISOString(),
        }]
      })
      if (staleRows.length > 0) {
        return {
          blocked: true,
          error: '本次库存截点时间不能早于或等于 SKU 最新有效库存时间',
          staleRows,
        }
      }

      for (const row of matchedRows) {
        await tx.productInventorySnapshot.upsert({
          where: {
            sku_date: {
              sku: row.canonicalSku,
              date: batch.stockCapturedAt,
            },
          },
          create: {
            sku: row.canonicalSku,
            date: batch.stockCapturedAt,
            availableQty: 0,
            lockedQty: 0,
            totalQty: row.totalQty,
            sourceFileName: batch.fileName,
            importBatchId: batch.id,
          },
          update: {
            availableQty: 0,
            lockedQty: 0,
            totalQty: row.totalQty,
            sourceFileName: batch.fileName,
            importBatchId: batch.id,
          },
        })
      }

      const updatedBatch = await tx.inventoryImportBatch.update({
        where: { id: batch.id },
        data: {
          status: INVENTORY_BATCH_STATUS.CONFIRMED,
          importedAt: new Date(),
        },
      })

      return {
        blocked: false,
        batch: updatedBatch,
        importedSnapshotCount: matchedRows.length,
      }
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
