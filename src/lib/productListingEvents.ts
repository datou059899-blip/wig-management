import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { getCurrentInventoryByProduct } from '@/lib/productInventorySnapshots'
import {
  makeTikTokProductSkuPair,
  ORDER_PLATFORM,
  PRODUCT_EXTERNAL_IDENTIFIER_TYPE,
} from '@/lib/order-data-closure'

export const PRODUCT_LISTING_EVENT_REASON = {
  SOLD_OUT: 'SOLD_OUT',
  LINK_CHANGED: 'LINK_CHANGED',
  OTHER: 'OTHER',
} as const

export type ProductListingEventReason = typeof PRODUCT_LISTING_EVENT_REASON[keyof typeof PRODUCT_LISTING_EVENT_REASON]

const LISTING_EVENT_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
}

export class ProductListingEventError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 422) {
    super(message)
    this.name = 'ProductListingEventError'
  }
}

type ListingEventInput = {
  productId: string
  platform?: unknown
  shopKey?: unknown
  reason?: unknown
  oldTikTokProductId?: unknown
  oldTikTokSkuId?: unknown
  newTikTokProductId?: unknown
  newTikTokSkuId?: unknown
  changedAt?: unknown
  note?: unknown
  recordedBy: string
}

type ListingPair = {
  tiktokProductId: string
  tiktokSkuId: string
  value: string
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseChangedAt(value: unknown) {
  const raw = text(value)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    throw new ProductListingEventError('changedAt必须是带Z或明确时区偏移的ISO时间', 400)
  }
  const changedAt = new Date(raw)
  if (Number.isNaN(changedAt.getTime())) {
    throw new ProductListingEventError('changedAt无效', 400)
  }
  return changedAt
}

function parsePairValue(value: string): ListingPair | null {
  const separator = value.indexOf(':')
  if (separator <= 0 || separator === value.length - 1 || value.indexOf(':', separator + 1) !== -1) return null
  const tiktokProductId = value.slice(0, separator).trim()
  const tiktokSkuId = value.slice(separator + 1).trim()
  if (!tiktokProductId || !tiktokSkuId) return null
  return { tiktokProductId, tiktokSkuId, value: makeTikTokProductSkuPair(tiktokProductId, tiktokSkuId) }
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

async function getConfiguredShopKey() {
  const config = await prisma.config.findUnique({
    where: { key: 'tiktok_shop_key' },
    select: { value: true },
  })
  const shopKey = text(config?.value)
  if (!shopKey) throw new ProductListingEventError('TikTok店铺上下文未配置', 422)
  return shopKey
}

function linkChangedWhere(input: {
  productId: string
  platform: string
  shopKey: string
  oldTikTokProductId: string
  oldTikTokSkuId: string
  newTikTokProductId: string
  newTikTokSkuId: string
}) {
  return {
    productId: input.productId,
    platform: input.platform,
    shopKey: input.shopKey,
    reason: PRODUCT_LISTING_EVENT_REASON.LINK_CHANGED,
    oldTikTokProductId: input.oldTikTokProductId,
    oldTikTokSkuId: input.oldTikTokSkuId,
    newTikTokProductId: input.newTikTokProductId,
    newTikTokSkuId: input.newTikTokSkuId,
  }
}

async function confirmedPairValues(
  db: Prisma.TransactionClient | typeof prisma,
  productId: string,
  platform: string,
  shopKey: string,
) {
  const identifiers = await db.productExternalIdentifier.findMany({
    where: {
      productId,
      platform,
      shopKey,
      identifierType: PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_PRODUCT_SKU_PAIR,
    },
    select: { identifierValue: true },
    orderBy: { createdAt: 'asc' },
  })
  return identifiers.flatMap(identifier => {
    const pair = parsePairValue(identifier.identifierValue)
    return pair ? [pair] : []
  })
}

async function oldPairIsConfirmed(
  tx: Prisma.TransactionClient,
  input: {
    productId: string
    platform: string
    shopKey: string
    oldTikTokProductId: string
    oldTikTokSkuId: string
    oldPairValue: string
  },
) {
  const exact = await tx.productExternalIdentifier.findUnique({
    where: {
      platform_shopKey_identifierType_identifierValue: {
        platform: input.platform,
        shopKey: input.shopKey,
        identifierType: PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_PRODUCT_SKU_PAIR,
        identifierValue: input.oldPairValue,
      },
    },
    select: { productId: true },
  })
  if (exact) {
    if (exact.productId !== input.productId) {
      throw new ProductListingEventError('旧Listing身份已属于其他Product', 409)
    }
    return true
  }

  const legacy = await tx.productExternalIdentifier.findMany({
    where: {
      platform: input.platform,
      shopKey: input.shopKey,
      OR: [
        {
          identifierType: PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_PRODUCT_ID,
          identifierValue: input.oldTikTokProductId,
        },
        {
          identifierType: PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_SKU_ID,
          identifierValue: input.oldTikTokSkuId,
        },
      ],
    },
    select: { identifierType: true, productId: true },
  })
  const productIdentity = legacy.find(row => row.identifierType === PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_PRODUCT_ID)
  const skuIdentity = legacy.find(row => row.identifierType === PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_SKU_ID)
  if (productIdentity?.productId === input.productId && skuIdentity?.productId === input.productId) return true
  if (
    (productIdentity && productIdentity.productId !== input.productId)
    || (skuIdentity && skuIdentity.productId !== input.productId)
  ) {
    throw new ProductListingEventError('旧Listing身份已属于其他Product', 409)
  }
  return false
}

async function ensurePairsBelongToProduct(
  tx: Prisma.TransactionClient,
  params: {
    eventId: string
    productId: string
    platform: string
    shopKey: string
    pairValues: string[]
    recordedBy: string
  },
) {
  const pairValues = Array.from(new Set(params.pairValues))
  await tx.productExternalIdentifier.createMany({
    data: pairValues.map(identifierValue => ({
      id: randomUUID(),
      platform: params.platform,
      shopKey: params.shopKey,
      identifierType: PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_PRODUCT_SKU_PAIR,
      identifierValue,
      productId: params.productId,
      evidence: `LISTING_CHANGE:${params.eventId}`,
      approvedBy: params.recordedBy,
      approvedAt: new Date(),
    })),
    skipDuplicates: true,
  })

  const persisted = await tx.productExternalIdentifier.findMany({
    where: {
      platform: params.platform,
      shopKey: params.shopKey,
      identifierType: PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_PRODUCT_SKU_PAIR,
      identifierValue: { in: pairValues },
    },
    select: { identifierValue: true, productId: true },
  })
  if (
    persisted.length !== pairValues.length
    || persisted.some(identifier => identifier.productId !== params.productId)
  ) {
    throw new ProductListingEventError('Listing identity已属于其他Product', 409)
  }
}

export async function getProductListingEventContext(productId: string) {
  const shopKey = await getConfiguredShopKey()
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      sku: true,
      stock: true,
      aliases: { select: { aliasSku: true } },
    },
  })
  if (!product) throw new ProductListingEventError('Product不存在', 404)

  const [events, pairRows, legacyRows, inventory] = await Promise.all([
    prisma.productListingEvent.findMany({
      where: { productId },
      orderBy: [{ changedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    confirmedPairValues(prisma, productId, ORDER_PLATFORM, shopKey),
    prisma.productExternalIdentifier.findMany({
      where: {
        productId,
        platform: ORDER_PLATFORM,
        shopKey,
        identifierType: { in: [
          PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_PRODUCT_ID,
          PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_SKU_ID,
        ] },
      },
      select: { identifierType: true, identifierValue: true },
    }),
    getCurrentInventoryByProduct([product]),
  ])

  const latestLinkChange = events.find(event => event.reason === PRODUCT_LISTING_EVENT_REASON.LINK_CHANGED)
  const latestPair = latestLinkChange?.newTikTokProductId && latestLinkChange.newTikTokSkuId
    ? parsePairValue(makeTikTokProductSkuPair(latestLinkChange.newTikTokProductId, latestLinkChange.newTikTokSkuId))
    : null
  const pairMap = new Map(pairRows.map(pair => [pair.value, pair]))
  if (latestPair) pairMap.set(latestPair.value, latestPair)

  if (pairMap.size === 0) {
    const productIds = legacyRows.filter(row => row.identifierType === PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_PRODUCT_ID)
    const skuIds = legacyRows.filter(row => row.identifierType === PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_SKU_ID)
    if (productIds.length === 1 && skuIds.length === 1) {
      const pair = parsePairValue(makeTikTokProductSkuPair(productIds[0].identifierValue, skuIds[0].identifierValue))
      if (pair) pairMap.set(pair.value, pair)
    }
  }

  const confirmedPairs = Array.from(pairMap.values())
  const currentPair = latestPair || (confirmedPairs.length === 1 ? confirmedPairs[0] : null)
  const currentInventory = inventory.get(product.id)?.currentStock ?? 0

  return {
    product: { id: product.id, canonicalSku: product.sku },
    platform: ORDER_PLATFORM,
    shopKey,
    currentInventory,
    confirmedPairs,
    currentPair,
    events,
  }
}

async function createLinkChangedEvent(input: ListingEventInput, changedAt: Date) {
  const productId = text(input.productId)
  const platform = text(input.platform) || ORDER_PLATFORM
  const shopKey = text(input.shopKey)
  const recordedBy = text(input.recordedBy)
  const oldTikTokProductId = text(input.oldTikTokProductId)
  const oldTikTokSkuId = text(input.oldTikTokSkuId)
  const newTikTokProductId = text(input.newTikTokProductId)
  const newTikTokSkuId = text(input.newTikTokSkuId)
  const note = text(input.note) || null
  if (platform !== ORDER_PLATFORM) throw new ProductListingEventError('仅支持TIKTOK listing identity', 400)
  if (!shopKey) throw new ProductListingEventError('shopKey不能为空', 400)
  if (shopKey !== await getConfiguredShopKey()) throw new ProductListingEventError('shopKey与已配置店铺不一致', 400)
  if (!oldTikTokProductId || !oldTikTokSkuId || !newTikTokProductId || !newTikTokSkuId) {
    throw new ProductListingEventError('换链接必须完整填写旧/新Product ID和SKU ID', 400)
  }
  const oldPairValue = makeTikTokProductSkuPair(oldTikTokProductId, oldTikTokSkuId)
  const newPairValue = makeTikTokProductSkuPair(newTikTokProductId, newTikTokSkuId)
  if (oldPairValue === newPairValue) throw new ProductListingEventError('新旧Listing identity不能相同', 400)

  const where = linkChangedWhere({
    productId,
    platform,
    shopKey,
    oldTikTokProductId,
    oldTikTokSkuId,
    newTikTokProductId,
    newTikTokSkuId,
  })
  const existing = await prisma.productListingEvent.findFirst({ where })
  if (existing) return { event: existing, idempotent: true, needsAdjustment: false, suggestedAdjustmentQty: 0 }

  try {
    const event = await prisma.$transaction(async tx => {
      const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true, sku: true } })
      if (!product) throw new ProductListingEventError('Product不存在', 404)
      if (!product.sku?.trim()) throw new ProductListingEventError('Product缺少canonical SKU', 400)

      const confirmed = await oldPairIsConfirmed(tx, {
        productId,
        platform,
        shopKey,
        oldTikTokProductId,
        oldTikTokSkuId,
        oldPairValue,
      })
      if (!confirmed) throw new ProductListingEventError('旧Listing身份尚未确认，请补证或改用OTHER', 422)

      const eventId = randomUUID()
      await ensurePairsBelongToProduct(tx, {
        eventId,
        productId,
        platform,
        shopKey,
        pairValues: [oldPairValue, newPairValue],
        recordedBy,
      })
      return tx.productListingEvent.create({
        data: {
          id: eventId,
          productId,
          platform,
          shopKey,
          reason: PRODUCT_LISTING_EVENT_REASON.LINK_CHANGED,
          oldTikTokProductId,
          oldTikTokSkuId,
          newTikTokProductId,
          newTikTokSkuId,
          changedAt,
          note,
          recordedBy,
        },
      })
    }, LISTING_EVENT_TRANSACTION_OPTIONS)
    return { event, idempotent: false, needsAdjustment: false, suggestedAdjustmentQty: 0 }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const duplicate = await prisma.productListingEvent.findFirst({ where })
      if (duplicate) return { event: duplicate, idempotent: true, needsAdjustment: false, suggestedAdjustmentQty: 0 }
    }
    throw error
  }
}

async function createSoldOutEvent(input: ListingEventInput, changedAt: Date) {
  const productId = text(input.productId)
  const platform = text(input.platform) || ORDER_PLATFORM
  const shopKey = text(input.shopKey)
  const recordedBy = text(input.recordedBy)
  const note = text(input.note) || null
  if (!shopKey) throw new ProductListingEventError('shopKey不能为空', 400)
  if (shopKey !== await getConfiguredShopKey()) throw new ProductListingEventError('shopKey与已配置店铺不一致', 400)

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, sku: true, stock: true, aliases: { select: { aliasSku: true } } },
  })
  if (!product) throw new ProductListingEventError('Product不存在', 404)
  if (!product.sku?.trim()) throw new ProductListingEventError('Product缺少canonical SKU', 400)
  const inventory = await getCurrentInventoryByProduct([product])
  const systemInventoryQty = inventory.get(product.id)?.currentStock ?? 0

  const event = await prisma.$transaction(async tx => {
    const created = await tx.productListingEvent.create({
      data: {
        productId,
        platform,
        shopKey,
        reason: PRODUCT_LISTING_EVENT_REASON.SOLD_OUT,
        actualInventoryQty: 0,
        systemInventoryQty,
        changedAt,
        note,
        recordedBy,
      },
    })
    await tx.product.update({
      where: { id: productId },
      data: { businessStatus: 'OUT_OF_STOCK_DELISTED' },
    })
    return created
  }, LISTING_EVENT_TRANSACTION_OPTIONS)

  return {
    event,
    idempotent: false,
    needsAdjustment: systemInventoryQty > 0,
    suggestedAdjustmentQty: systemInventoryQty > 0 ? -systemInventoryQty : 0,
  }
}

async function createOtherEvent(input: ListingEventInput, changedAt: Date) {
  const productId = text(input.productId)
  const platform = text(input.platform) || ORDER_PLATFORM
  const shopKey = text(input.shopKey)
  const recordedBy = text(input.recordedBy)
  const note = text(input.note)
  if (!shopKey) throw new ProductListingEventError('shopKey不能为空', 400)
  if (shopKey !== await getConfiguredShopKey()) throw new ProductListingEventError('shopKey与已配置店铺不一致', 400)
  if (!note) throw new ProductListingEventError('OTHER必须填写备注', 400)
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, sku: true } })
  if (!product) throw new ProductListingEventError('Product不存在', 404)
  if (!product.sku?.trim()) throw new ProductListingEventError('Product缺少canonical SKU', 400)
  const event = await prisma.productListingEvent.create({
    data: {
      productId,
      platform,
      shopKey,
      reason: PRODUCT_LISTING_EVENT_REASON.OTHER,
      changedAt,
      note,
      recordedBy,
    },
  })
  return { event, idempotent: false, needsAdjustment: false, suggestedAdjustmentQty: 0 }
}

export async function createProductListingEvent(input: ListingEventInput) {
  const reason = text(input.reason) as ProductListingEventReason
  if (!Object.values(PRODUCT_LISTING_EVENT_REASON).includes(reason)) {
    throw new ProductListingEventError('下架原因无效', 400)
  }
  if (!text(input.recordedBy)) throw new ProductListingEventError('操作人不能为空', 400)
  const changedAt = parseChangedAt(input.changedAt)
  if (reason === PRODUCT_LISTING_EVENT_REASON.LINK_CHANGED) return createLinkChangedEvent(input, changedAt)
  if (reason === PRODUCT_LISTING_EVENT_REASON.SOLD_OUT) return createSoldOutEvent(input, changedAt)
  return createOtherEvent(input, changedAt)
}
