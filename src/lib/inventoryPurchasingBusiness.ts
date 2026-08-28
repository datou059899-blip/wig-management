import { Prisma, PurchaseOrderStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentInventoryByProduct } from '@/lib/productInventorySnapshots'
import { resolveCurrentSellingPriceUsd } from '@/lib/productPricing'
import {
  buildProductSkuResolver,
  isSpecialLinkSku,
} from '@/lib/product-sku-resolver'

export type SupplierInput = {
  name?: unknown
  notes?: unknown
  isActive?: unknown
}

export type ProductBusinessInput = {
  discountPriceUsd?: unknown
  costCny?: unknown
  defaultSupplierId?: unknown
}

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseOptionalPositiveNumber(value: unknown, fieldName: string) {
  if (value === null || value === undefined || value === '') return null
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error(`${fieldName}必须是大于0的有限数字`)
  }
  return numberValue
}

function parseNonNegativeNumber(value: unknown, fieldName: string) {
  if (value === null || value === undefined || value === '') return 0
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`${fieldName}必须是大于等于0的有限数字`)
  }
  return numberValue
}

function normalizeSupplierNotes(value: unknown) {
  const notes = trimString(value)
  return notes || null
}

export function buildSupplierCreateData(input: SupplierInput) {
  const name = trimString(input.name)
  if (!name) throw new Error('供应商名称不能为空')

  return {
    name,
    notes: normalizeSupplierNotes(input.notes),
    isActive: true,
  }
}

export function buildSupplierUpdateData(input: SupplierInput) {
  const data: { name?: string; notes?: string | null; isActive?: boolean } = {}

  if (Object.prototype.hasOwnProperty.call(input, 'name')) {
    const name = trimString(input.name)
    if (!name) throw new Error('供应商名称不能为空')
    data.name = name
  }

  if (Object.prototype.hasOwnProperty.call(input, 'notes')) {
    data.notes = normalizeSupplierNotes(input.notes)
  }

  if (Object.prototype.hasOwnProperty.call(input, 'isActive')) {
    if (typeof input.isActive !== 'boolean') throw new Error('isActive必须是布尔值')
    data.isActive = input.isActive
  }

  return data
}

export function buildProductBusinessUpdateData(input: ProductBusinessInput) {
  const data: {
    discountPriceUsd?: number | null
    costCny?: number
    defaultSupplierId?: string | null
  } = {}

  if (Object.prototype.hasOwnProperty.call(input, 'discountPriceUsd')) {
    data.discountPriceUsd = parseOptionalPositiveNumber(input.discountPriceUsd, '当前实际售价')
  }

  if (Object.prototype.hasOwnProperty.call(input, 'costCny')) {
    data.costCny = parseNonNegativeNumber(input.costCny, '默认拿货价')
  }

  if (Object.prototype.hasOwnProperty.call(input, 'defaultSupplierId')) {
    const supplierId = trimString(input.defaultSupplierId)
    data.defaultSupplierId = supplierId || null
  }

  return data
}

export function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export async function listSuppliers(options: { includeInactive?: boolean } = {}) {
  return prisma.supplier.findMany({
    where: options.includeInactive ? undefined : { isActive: true },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      isActive: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

export async function createSupplier(input: SupplierInput) {
  return prisma.supplier.create({
    data: buildSupplierCreateData(input),
    select: {
      id: true,
      name: true,
      isActive: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

export async function updateSupplier(id: string, input: SupplierInput) {
  const data = buildSupplierUpdateData(input)
  if (!Object.keys(data).length) throw new Error('没有可更新的供应商字段')

  return prisma.supplier.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      isActive: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

async function getSalesByProductId(
  products: Array<{
    id: string
    sku: string | null
    name?: string | null
    aliases: Array<{ aliasSku: string | null }>
  }>,
) {
  const today = startOfDay(new Date())
  const endExclusive = addDays(today, 1)
  const start30 = addDays(today, -29)
  const start7 = addDays(today, -6)
  const salesProducts = products.filter((product) => !isSpecialLinkSku(product.sku))
  const aliases = salesProducts.flatMap((product) => product.aliases.map((alias) => ({
    productId: product.id,
    aliasSku: alias.aliasSku,
  })))
  const { resolveProductBySku } = buildProductSkuResolver(salesProducts, aliases)

  const rows = await prisma.performanceDaily.findMany({
    where: {
      date: {
        gte: start30,
        lt: endExclusive,
      },
    },
    select: {
      sku: true,
      date: true,
      orders: true,
    },
  })

  const result = new Map<string, { sales7d: number; sales30d: number }>()
  rows.forEach((row) => {
    if (!row.sku) return
    const match = resolveProductBySku(row.sku)
    if (!match) return
    const current = result.get(match.product.id) || { sales7d: 0, sales30d: 0 }
    const qty = row.orders || 0
    const date = startOfDay(new Date(row.date))
    current.sales30d += qty
    if (date >= start7) current.sales7d += qty
    result.set(match.product.id, current)
  })

  return result
}

async function getPurchaseStockByProductId(productIds: string[]) {
  if (!productIds.length) return new Map<string, { orderedOpenQty: number; inTransitQty: number }>()

  const rows = await prisma.purchaseOrderItem.findMany({
    where: {
      productId: { in: productIds },
      purchaseOrder: {
        status: {
          in: [
            PurchaseOrderStatus.ORDERED,
            PurchaseOrderStatus.PRODUCING,
            PurchaseOrderStatus.IN_TRANSIT,
            PurchaseOrderStatus.PARTIALLY_RECEIVED,
          ],
        },
      },
    },
    select: {
      productId: true,
      orderedQty: true,
      receivedQty: true,
      purchaseOrder: {
        select: { status: true },
      },
    },
  })

  const result = new Map<string, { orderedOpenQty: number; inTransitQty: number }>()
  rows.forEach((row) => {
    if (!row.productId) return
    const openQty = Math.max(row.orderedQty - row.receivedQty, 0)
    if (openQty <= 0) return
    const current = result.get(row.productId) || { orderedOpenQty: 0, inTransitQty: 0 }
    if (row.purchaseOrder.status === PurchaseOrderStatus.ORDERED || row.purchaseOrder.status === PurchaseOrderStatus.PRODUCING) {
      current.orderedOpenQty += openQty
    }
    if (row.purchaseOrder.status === PurchaseOrderStatus.IN_TRANSIT || row.purchaseOrder.status === PurchaseOrderStatus.PARTIALLY_RECEIVED) {
      current.inTransitQty += openQty
    }
    result.set(row.productId, current)
  })

  return result
}

export async function getProductBusinessItems() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      stock: true,
      aliases: { select: { aliasSku: true } },
      discountPriceUsd: true,
      tiktokDiscountPriceUsd: true,
      tiktokPriceUsd: true,
      priceUsd: true,
      costCny: true,
      defaultSupplier: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
    },
    orderBy: { sku: 'asc' },
  })

  const productIds = products.map((product) => product.id)
  const [inventoryByProductId, salesByProductId, purchaseStockByProductId] = await Promise.all([
    getCurrentInventoryByProduct(products),
    getSalesByProductId(products),
    getPurchaseStockByProductId(productIds),
  ])

  return products.flatMap((product) => {
    if (!product.sku) return []
    const inventory = inventoryByProductId.get(product.id)
    const currentInventory = inventory?.currentStock ?? 0
    const purchaseStock = purchaseStockByProductId.get(product.id) || { orderedOpenQty: 0, inTransitQty: 0 }
    const futureInventory = currentInventory + purchaseStock.orderedOpenQty + purchaseStock.inTransitQty
    const sales = salesByProductId.get(product.id) || { sales7d: 0, sales30d: 0 }
    const { currentSellingPriceUsd, priceSource } = resolveCurrentSellingPriceUsd(product)
    const costCny = product.costCny || 0

    return [{
      productId: product.id,
      sku: product.sku,
      name: product.name,
      currentInventory,
      orderedOpenQty: purchaseStock.orderedOpenQty,
      inTransitQty: purchaseStock.inTransitQty,
      futureInventory,
      sales7d: sales.sales7d,
      sales30d: sales.sales30d,
      discountPriceUsd: product.discountPriceUsd,
      tiktokDiscountPriceUsd: product.tiktokDiscountPriceUsd,
      tiktokPriceUsd: product.tiktokPriceUsd,
      priceUsd: product.priceUsd,
      currentSellingPriceUsd,
      priceSource,
      costCny,
      defaultSupplier: product.defaultSupplier,
      inventoryCostRmb: costCny > 0 ? currentInventory * costCny : null,
      retailInventoryValueUsd: currentSellingPriceUsd !== null ? currentInventory * currentSellingPriceUsd : null,
    }]
  })
}

export async function updateProductBusinessFields(productId: string, input: ProductBusinessInput) {
  const data = buildProductBusinessUpdateData(input)
  if (!Object.keys(data).length) throw new Error('没有可更新的经营字段')

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  })
  if (!product) {
    const error = new Error('Product不存在')
    error.name = 'NotFound'
    throw error
  }

  if (data.defaultSupplierId) {
    const supplier = await prisma.supplier.findUnique({
      where: { id: data.defaultSupplierId },
      select: { id: true, isActive: true },
    })
    if (!supplier) {
      const error = new Error('Supplier不存在')
      error.name = 'NotFound'
      throw error
    }
    if (!supplier.isActive) {
      throw new Error('不能将已停用供应商设置为新的默认供应商')
    }
  }

  return prisma.product.update({
    where: { id: productId },
    data,
    select: {
      id: true,
      name: true,
      sku: true,
      discountPriceUsd: true,
      tiktokDiscountPriceUsd: true,
      tiktokPriceUsd: true,
      priceUsd: true,
      costCny: true,
      defaultSupplier: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
      updatedAt: true,
    },
  })
}
