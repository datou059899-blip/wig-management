import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentInventoryByProduct } from '@/lib/productInventorySnapshots'
import { resolveCurrentSellingPriceUsd } from '@/lib/productPricing'

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

function strictSkuKey(value: string | null | undefined) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text.toUpperCase() : ''
}

function uniqueProductSkus(product: { sku: string | null; aliases: Array<{ aliasSku: string | null }> }) {
  const seen = new Set<string>()
  return [product.sku, ...product.aliases.map((alias) => alias.aliasSku)].flatMap((value) => {
    const sku = typeof value === 'string' ? value.trim() : ''
    const key = strictSkuKey(sku)
    if (!sku || !key || seen.has(key)) return []
    seen.add(key)
    return [sku]
  })
}

async function getSalesByProductId(
  products: Array<{ id: string; sku: string | null; aliases: Array<{ aliasSku: string | null }> }>,
) {
  const today = startOfDay(new Date())
  const endExclusive = addDays(today, 1)
  const start30 = addDays(today, -29)
  const start7 = addDays(today, -6)
  const skuToProductIds = new Map<string, Set<string>>()

  products.forEach((product) => {
    uniqueProductSkus(product).forEach((sku) => {
      const key = strictSkuKey(sku)
      const bucket = skuToProductIds.get(key) || new Set<string>()
      bucket.add(product.id)
      skuToProductIds.set(key, bucket)
    })
  })

  const sellerSkus = Array.from(skuToProductIds.keys())
  const rows = sellerSkus.length
    ? await prisma.productOrderItem.findMany({
        where: {
          productMatched: true,
          isSample: false,
          stockConsumedQty: { gt: 0 },
          sellerSku: { in: sellerSkus },
          paidDate: {
            gte: start30,
            lt: endExclusive,
          },
        },
        select: {
          sellerSku: true,
          paidDate: true,
          stockConsumedQty: true,
        },
      })
    : []

  const result = new Map<string, { sales7d: number; sales30d: number }>()
  rows.forEach((row) => {
    const productIds = skuToProductIds.get(strictSkuKey(row.sellerSku))
    productIds?.forEach((productId) => {
      const current = result.get(productId) || { sales7d: 0, sales30d: 0 }
      const qty = row.stockConsumedQty || 0
      current.sales30d += qty
      if (row.paidDate >= start7) current.sales7d += qty
      result.set(productId, current)
    })
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

  const [inventoryByProductId, salesByProductId] = await Promise.all([
    getCurrentInventoryByProduct(products),
    getSalesByProductId(products),
  ])

  return products.flatMap((product) => {
    if (!product.sku) return []
    const inventory = inventoryByProductId.get(product.id)
    const currentInventory = inventory?.currentStock ?? 0
    const sales = salesByProductId.get(product.id) || { sales7d: 0, sales30d: 0 }
    const { currentSellingPriceUsd, priceSource } = resolveCurrentSellingPriceUsd(product)
    const costCny = product.costCny || 0

    return [{
      productId: product.id,
      sku: product.sku,
      name: product.name,
      currentInventory,
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
