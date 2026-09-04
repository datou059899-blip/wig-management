import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessPage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { getProductBusinessItems } from '@/lib/inventoryPurchasingBusiness'
import { getProductSalesInventoryData } from '@/lib/productSalesInventory'
import { listPurchaseOrders } from '@/lib/purchaseOrders'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ error: '未授权访问' }, { status: 403 })
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
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

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canAccessPage(permissionContext, 'products')) {
    return unauthorized()
  }

  const product = await prisma.product.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      sku: true,
      image: true,
      images: true,
      color: true,
      length: true,
      style: true,
      material: true,
      laceSize: true,
      description: true,
      productUrl: true,
      materialUrl: true,
      notes: true,
      tags: true,
      businessStatus: true,
      isActive: true,
      costCny: true,
      priceUsd: true,
      discountPriceUsd: true,
      tiktokPriceUsd: true,
      tiktokDiscountPriceUsd: true,
      stock: true,
      defaultSupplier: {
        select: { id: true, name: true, isActive: true },
      },
      aliases: {
        select: { id: true, aliasSku: true, source: true },
        orderBy: { aliasSku: 'asc' },
      },
      tiktokSync: true,
    },
  })

  if (!product) {
    return NextResponse.json({ error: '产品不存在' }, { status: 404 })
  }

  const today = startOfLocalDay(new Date())
  const endExclusive = addDays(today, 1)
  const startDate = addDays(today, -6)

  const [businessItems, salesData, purchaseData] = await Promise.all([
    getProductBusinessItems(),
    getProductSalesInventoryData({
      range: '7',
      startDate,
      endDate: today,
      endExclusive,
      startDateText: formatDateKey(startDate),
      endDateText: formatDateKey(today),
    }),
    listPurchaseOrders(),
  ])

  const business = businessItems.find((item) => item.productId === product.id) || null
  const salesRow = salesData.products.find((item) => item.id === product.id) || null

  const purchases = purchaseData.orders
    .flatMap((order) =>
      order.items
        .filter((item) => item.productId === product.id)
        .map((item) => ({
          purchaseOrderId: order.id,
          purchaseOrderItemId: item.id,
          orderNo: order.orderNo,
          supplier: order.supplier
            ? { id: order.supplier.id, name: order.supplier.name, isActive: order.supplier.isActive }
            : null,
          supplierNameSnapshot: order.supplierNameSnapshot,
          status: order.status,
          statusLabel: order.statusLabel,
          orderedAt: order.orderedAt ? order.orderedAt.toISOString() : null,
          expectedArrivalDate: order.expectedArrivalDate ? order.expectedArrivalDate.toISOString() : null,
          createdAt: order.createdAt.toISOString(),
          orderedQty: item.orderedQty,
          receivedQty: item.receivedQty,
          outstandingQty: Math.max(item.orderedQty - item.receivedQty, 0),
          unitCostRmb: item.unitCostRmb,
        })),
    )
    .sort((a, b) => {
      const aTime = new Date(a.orderedAt || a.expectedArrivalDate || a.createdAt).getTime()
      const bTime = new Date(b.orderedAt || b.expectedArrivalDate || b.createdAt).getTime()
      return bTime - aTime
    })

  return NextResponse.json({
    product: {
      id: product.id,
      name: product.name,
      sku: product.sku,
      image: product.image,
      images: product.images,
      color: product.color,
      length: product.length,
      style: product.style,
      material: product.material,
      laceSize: product.laceSize,
      description: product.description,
      productUrl: product.productUrl,
      materialUrl: product.materialUrl,
      notes: product.notes,
      tags: product.tags,
      businessStatus: product.businessStatus,
      isActive: product.isActive,
      defaultSupplier: product.defaultSupplier,
      costCny: product.costCny,
      priceUsd: product.priceUsd,
      discountPriceUsd: product.discountPriceUsd,
      tiktokPriceUsd: product.tiktokPriceUsd,
      tiktokDiscountPriceUsd: product.tiktokDiscountPriceUsd,
      legacyStock: product.stock,
      aliases: product.aliases,
      tiktokSync: product.tiktokSync,
    },
    business,
    sales: salesRow
      ? {
          sevenDaySales: salesRow.sevenDaySales,
          monthSales: salesRow.monthSales,
          avgDailySales: salesRow.avgDailySales,
          currentSellableDays: salesRow.currentSellableDays,
          inventoryRisk: salesRow.inventoryRisk,
          salesRank: salesRow.salesRank,
          stockStatus: salesRow.stockStatus,
        }
      : null,
    purchases,
  })
}
