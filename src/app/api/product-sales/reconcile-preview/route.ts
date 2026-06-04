import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { getProductSalesInventoryData } from '@/lib/productSalesInventory'

function startOfDay(date: Date) {
  const normalized = new Date(date)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeSkuFilterValues(input: unknown) {
  if (!Array.isArray(input)) return []
  return input
    .map((value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim()))
    .filter(Boolean)
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const permissionContext = getSessionPermissionContext(session)
    if (!canManagePage(permissionContext, 'productSales')) {
      return NextResponse.json({ error: '无权限操作销售库存' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const threshold = Math.max(0, Number(body?.threshold) || 10)
    const skuFilterValues = normalizeSkuFilterValues(body?.skuFilter)
    const includeOnlyWithBaseline = body?.includeOnlyWithBaseline !== false
    const includeOnlyWithSnapshot = body?.includeOnlyWithSnapshot !== false
    const skuFilterSet = new Set(skuFilterValues)

    const today = startOfDay(new Date())
    const startDate = addDays(today, -6)
    const data = await getProductSalesInventoryData({
      range: '7',
      startDate,
      endDate: today,
      endExclusive: addDays(today, 1),
      startDateText: formatDateKey(startDate),
      endDateText: formatDateKey(today),
    })

    let skippedNoBaseline = 0
    let skippedNoSnapshot = 0
    let skippedDiffTooSmall = 0
    let skippedBySkuFilter = 0

    const items = data.products.flatMap((product) => {
      if (skuFilterSet.size > 0 && !skuFilterSet.has(product.sku)) {
        skippedBySkuFilter += 1
        return []
      }

      if (includeOnlyWithBaseline && !product.hasBaseline) {
        skippedNoBaseline += 1
        return []
      }

      if (includeOnlyWithSnapshot && !product.hasPlatformSnapshot) {
        skippedNoSnapshot += 1
        return []
      }

      if (product.inventoryDiff === null || Math.abs(product.inventoryDiff) <= threshold) {
        skippedDiffTooSmall += 1
        return []
      }

      return [{
        sku: product.sku,
        productId: product.id,
        productName: product.name,
        baselineQty: product.baselineQty,
        adjustmentTotal: product.adjustmentTotal,
        cumulativeStockConsumedQty: product.cumulativeStockConsumedQty,
        estimatedStock: product.estimatedStock,
        platformStock: product.platformCurrentStock,
        availableQty: product.platformAvailableQty,
        lockedQty: product.platformLockedQty,
        totalQty: product.platformTotalQty,
        inventoryDiff: product.inventoryDiff,
        adjustmentQty: product.platformCurrentStock - product.estimatedStock,
        latestSnapshotDate: product.platformSnapshotDate ? product.platformSnapshotDate.slice(0, 10) : null,
        platformStockSource: product.platformStockSource,
        eligible: true,
        reason: null,
      }]
    })

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      threshold,
      summary: {
        candidateCount: items.length,
        skippedNoBaseline,
        skippedNoSnapshot,
        skippedDiffTooSmall,
        skippedBySkuFilter,
      },
      items,
    })
  } catch (error) {
    console.error('预览平台库存校准失败:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '预览平台库存校准失败' },
      { status: 500 },
    )
  }
}
