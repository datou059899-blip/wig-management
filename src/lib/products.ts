import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

type ProductClient = typeof prisma | Prisma.TransactionClient

export class ProductSkuConflictError extends Error {
  constructor() {
    super('SKU 已存在，请使用不同的 SKU')
    this.name = 'ProductSkuConflictError'
  }
}

export type CreateProductInput = {
  name?: unknown
  sku?: unknown
  skuId?: unknown
  image?: unknown
  images?: unknown
  description?: unknown
  material?: unknown
  length?: unknown
  color?: unknown
  style?: unknown
  costCny?: unknown
  firstLegLogisticsCostUsd?: unknown
  lastLegLogisticsCostUsd?: unknown
  laceSize?: unknown
  priceUsd?: unknown
  discountPriceUsd?: unknown
  influencerCommissionUsd?: unknown
  adCostUsd?: unknown
  tiktokPriceUsd?: unknown
  tiktokDiscountPriceUsd?: unknown
  stock?: unknown
  scene?: unknown
  materialUrl?: unknown
  tags?: unknown
  notes?: unknown
  defaultSupplierId?: unknown
  businessStatus?: unknown
  isActive?: unknown
}

function trimOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value
}

function nullableTrimmedString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function createProduct(input: CreateProductInput, client: ProductClient = prisma) {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) {
    throw new Error('请输入产品名称')
  }

  try {
    return await client.product.create({
      data: {
        name,
        sku: nullableTrimmedString(input.sku),
        skuId: trimOptionalString(input.skuId) as string | undefined,
        image: trimOptionalString(input.image) as string | undefined,
        images: trimOptionalString(input.images) as string | undefined,
        description: trimOptionalString(input.description) as string | undefined,
        material: trimOptionalString(input.material) as string | undefined,
        length: trimOptionalString(input.length) as string | undefined,
        color: trimOptionalString(input.color) as string | undefined,
        style: trimOptionalString(input.style) as string | undefined,
        costCny: typeof input.costCny === 'number' ? input.costCny : 0,
        firstLegLogisticsCostUsd: typeof input.firstLegLogisticsCostUsd === 'number' ? input.firstLegLogisticsCostUsd : 0,
        lastLegLogisticsCostUsd: typeof input.lastLegLogisticsCostUsd === 'number' ? input.lastLegLogisticsCostUsd : 0,
        laceSize: trimOptionalString(input.laceSize) as string | undefined,
        priceUsd: typeof input.priceUsd === 'number' ? input.priceUsd : 0,
        discountPriceUsd: typeof input.discountPriceUsd === 'number' ? input.discountPriceUsd : undefined,
        influencerCommissionUsd: typeof input.influencerCommissionUsd === 'number' ? input.influencerCommissionUsd : 0,
        adCostUsd: typeof input.adCostUsd === 'number' ? input.adCostUsd : 0,
        tiktokPriceUsd: typeof input.tiktokPriceUsd === 'number' ? input.tiktokPriceUsd : undefined,
        tiktokDiscountPriceUsd: typeof input.tiktokDiscountPriceUsd === 'number' ? input.tiktokDiscountPriceUsd : undefined,
        stock: typeof input.stock === 'number' ? input.stock : 0,
        scene: trimOptionalString(input.scene) as string | undefined,
        materialUrl: trimOptionalString(input.materialUrl) as string | undefined,
        tags: trimOptionalString(input.tags) as string | undefined,
        notes: trimOptionalString(input.notes) as string | undefined,
        defaultSupplierId: nullableTrimmedString(input.defaultSupplierId),
        businessStatus: typeof input.businessStatus === 'string' && input.businessStatus.trim() ? input.businessStatus.trim() : undefined,
        isActive: typeof input.isActive === 'boolean' ? input.isActive : undefined,
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ProductSkuConflictError()
    }
    throw error
  }
}
