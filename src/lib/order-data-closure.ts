import { Prisma } from '@prisma/client'

// The export has no reporting timezone: this is a calendar key, not an instant.
export function parseOrderCalendarDate(value: string) {
  const text = value.replace(/\t/g, '').trim()
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/)
  const dash = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]|$)/)
  if (!slash && !dash) return null
  const [year, month, day] = slash
    ? [slash[3], slash[1], slash[2]].map(Number)
    : [dash![1], dash![2], dash![3]].map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return { paidDate: date, paidTime: null, dateStr: date.toISOString().slice(0, 10) }
}

export function parseOrderMerchandiseAmount(value: unknown) {
  // Never convert money through Number, including numeric XLSX cells.
  const text = String(value ?? '').trim()
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(text)) {
    throw new Error('SKU Subtotal After Discount 缺失或不是有效的非负两位小数金额')
  }
  return new Prisma.Decimal(text)
}

export function buildStrictOrderSkuMap(
  products: Array<{ id: string; sku: string | null; name: string }>,
  aliases: Array<{ productId: string; aliasSku: string }>,
) {
  const candidates = new Map<string, Set<string>>()
  const byId = new Map(products.map(product => [product.id, product]))
  const add = (sku: string, id: string) => {
    const ids = candidates.get(sku) || new Set<string>()
    ids.add(id)
    candidates.set(sku, ids)
  }
  products.forEach(product => { if (product.sku) add(product.sku, product.id) })
  aliases.forEach(alias => { if (byId.has(alias.productId)) add(alias.aliasSku, alias.productId) })
  const matched = new Map<string, { productId: string; sku: string; name: string }>()
  candidates.forEach((ids, sku) => {
    if (ids.size === 1) {
      const product = byId.get(Array.from(ids)[0])!
      if (product.sku) matched.set(sku, { productId: product.id, sku: product.sku, name: product.name })
    }
  })
  return { matched, ambiguous: new Set(Array.from(candidates).filter(([, ids]) => ids.size > 1).map(([sku]) => sku)) }
}

export const ORDER_PLATFORM = 'TIKTOK'
export const PRODUCT_EXTERNAL_IDENTIFIER_TYPE = {
  TIKTOK_SKU_ID: 'TIKTOK_SKU_ID',
  TIKTOK_PRODUCT_ID: 'TIKTOK_PRODUCT_ID',
  TIKTOK_PRODUCT_SKU_PAIR: 'TIKTOK_PRODUCT_SKU_PAIR',
} as const
export const ORDER_LINE_CLASSIFICATION = {
  MERCHANDISE: 'MERCHANDISE',
  GIFT: 'NON_MERCHANDISE_GIFT',
} as const

export type OrderLineClassification = typeof ORDER_LINE_CLASSIFICATION[keyof typeof ORDER_LINE_CLASSIFICATION]

type ExternalIdentifier = {
  platform: string
  shopKey: string
  identifierType: string
  identifierValue: string
  productId: string
}

type ClassificationRule = {
  platform: string
  shopKey: string
  identityKey: string
  classification: string
  requireZeroAmount: boolean
}

type IdentityProduct = { id: string; sku: string | null; name: string }

export function sellerSkuIdentityKey(sellerSku: string) {
  return `SELLER_SKU:${sellerSku}`
}

export function tiktokSkuProductIdentityKey(skuId: string, productId: string) {
  return `TIKTOK_SKU_PRODUCT:${skuId}:${productId}`
}

export function makeTikTokProductSkuPair(productId: string, skuId: string) {
  const normalizedProductId = productId.trim()
  const normalizedSkuId = skuId.trim()
  if (!normalizedProductId || !normalizedSkuId) {
    throw new Error('TikTok Product ID 和 SKU ID 均不能为空')
  }
  return `${normalizedProductId}:${normalizedSkuId}`
}

export function buildOrderLineIdentityResolver(params: {
  products: IdentityProduct[]
  aliases: Array<{ productId: string; aliasSku: string }>
  externalIdentifiers: ExternalIdentifier[]
  classificationRules: ClassificationRule[]
  platform: string
  shopKey: string
}) {
  const strictSkuResolver = buildStrictOrderSkuMap(params.products, params.aliases)
  const productsById = new Map(params.products.map(product => [product.id, product]))
  const externalByKey = new Map<string, Set<string>>()
  const rulesByIdentityKey = new Map<string, ClassificationRule[]>()

  params.externalIdentifiers.forEach(identifier => {
    if (identifier.platform !== params.platform || identifier.shopKey !== params.shopKey) return
    const key = `${identifier.identifierType}:${identifier.identifierValue}`
    const owners = externalByKey.get(key) || new Set<string>()
    owners.add(identifier.productId)
    externalByKey.set(key, owners)
  })
  params.classificationRules.forEach(rule => {
    if (rule.platform !== params.platform || rule.shopKey !== params.shopKey) return
    const rules = rulesByIdentityKey.get(rule.identityKey) || []
    rules.push(rule)
    rulesByIdentityKey.set(rule.identityKey, rules)
  })

  return {
    strictSkuResolver,
    resolve(input: {
      sellerSku: string
      skuId: string | null
      tiktokProductId: string | null
      skuSubtotalAfterDiscount: Prisma.Decimal
    }) {
      const decisiveOwners: Set<string>[] = []
      let identityAmbiguous = false
      let missingProductIdCorroboration = false

      if (input.sellerSku) {
        if (strictSkuResolver.ambiguous.has(input.sellerSku)) identityAmbiguous = true
        const match = strictSkuResolver.matched.get(input.sellerSku)
        if (match) decisiveOwners.push(new Set([match.productId]))
      }

      const pairOwners = input.skuId && input.tiktokProductId
        ? externalByKey.get(`${PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_PRODUCT_SKU_PAIR}:${makeTikTokProductSkuPair(input.tiktokProductId, input.skuId)}`) || new Set<string>()
        : new Set<string>()
      if (pairOwners.size > 1) identityAmbiguous = true
      if (pairOwners.size > 0) decisiveOwners.push(pairOwners)

      const skuOwners = input.skuId
        ? externalByKey.get(`${PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_SKU_ID}:${input.skuId}`) || new Set<string>()
        : new Set<string>()
      if (skuOwners.size > 1) identityAmbiguous = true
      if (skuOwners.size > 0) decisiveOwners.push(skuOwners)

      const productOwners = input.tiktokProductId
        ? externalByKey.get(`${PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_PRODUCT_ID}:${input.tiktokProductId}`) || new Set<string>()
        : new Set<string>()
      if (productOwners.size > 1) identityAmbiguous = true
      if (skuOwners.size === 1 && pairOwners.size === 0 && productOwners.size === 0 && input.tiktokProductId) {
        missingProductIdCorroboration = true
      }

      const decisiveProductIds = new Set(decisiveOwners.flatMap(owners => Array.from(owners)))
      const giftIdentityKeys = [
        input.sellerSku ? sellerSkuIdentityKey(input.sellerSku) : null,
        input.skuId && input.tiktokProductId
          ? tiktokSkuProductIdentityKey(input.skuId, input.tiktokProductId)
          : null,
      ].filter((value): value is string => Boolean(value))
      const giftRules = giftIdentityKeys.flatMap(key => rulesByIdentityKey.get(key) || [])
      const giftIdentities = new Set(giftRules.map(rule => rule.identityKey))

      if (identityAmbiguous || giftIdentities.size > 1) {
        return { status: 'AMBIGUOUS' as const, missingProductIdCorroboration }
      }
      if (decisiveProductIds.size > 1) {
        return { status: 'HARD_IDENTITY_CONFLICT' as const, missingProductIdCorroboration }
      }
      if (decisiveProductIds.size === 1 && giftIdentities.size === 1) {
        return { status: 'IDENTITY_CONFLICT' as const, missingProductIdCorroboration }
      }
      if (giftIdentities.size === 1) {
        const rule = giftRules[0]
        if (rule.classification !== ORDER_LINE_CLASSIFICATION.GIFT) {
          return { status: 'AMBIGUOUS' as const, missingProductIdCorroboration }
        }
        if (rule.requireZeroAmount && !input.skuSubtotalAfterDiscount.isZero()) {
          return { status: 'AMOUNT_CONSTRAINT_FAILED' as const, missingProductIdCorroboration }
        }
        return {
          status: ORDER_LINE_CLASSIFICATION.GIFT,
          classification: ORDER_LINE_CLASSIFICATION.GIFT,
          identityKey: rule.identityKey,
          product: null,
          missingProductIdCorroboration,
        }
      }
      if (decisiveProductIds.size === 1) {
        const product = productsById.get(Array.from(decisiveProductIds)[0])
        if (!product?.sku) return { status: 'UNRESOLVED' as const, missingProductIdCorroboration }
        return {
          status: ORDER_LINE_CLASSIFICATION.MERCHANDISE,
          classification: ORDER_LINE_CLASSIFICATION.MERCHANDISE,
          identityKey: null,
          product,
          missingProductIdCorroboration,
        }
      }
      return { status: 'UNRESOLVED' as const, missingProductIdCorroboration }
    },
  }
}

export function classifyReferencedOrderSkus(
  rawSkus: string[],
  resolver: ReturnType<typeof buildStrictOrderSkuMap>,
) {
  const referencedSkus = Array.from(new Set(rawSkus.filter(Boolean)))
  const ambiguousSkus = referencedSkus.filter(sku => resolver.ambiguous.has(sku))
  const unmatchedSkus = referencedSkus.filter(sku => (
    !resolver.matched.has(sku) && !resolver.ambiguous.has(sku)
  ))
  const matchedSkus = referencedSkus.filter(sku => resolver.matched.has(sku))

  return { matchedSkus, unmatchedSkus, ambiguousSkus }
}

export function findOrderFileDuplicates(items: Array<{ dedupeKey: string; skuId: string | null }>) {
  const seen = new Set<string>()
  const keyTypes = new Set<string>()
  let duplicateCount = 0
  items.forEach(item => {
    if (seen.has(item.dedupeKey)) {
      duplicateCount++
      keyTypes.add(item.skuId ? 'orderId+skuId' : 'orderId+sellerSku')
    }
    seen.add(item.dedupeKey)
  })
  return { duplicateCount, keyTypes: Array.from(keyTypes) }
}

export function completeMerchandiseSum(amounts: Array<Prisma.Decimal | null>) {
  return amounts.some(amount => amount === null)
    ? null
    : amounts.reduce<Prisma.Decimal>((sum, amount) => sum.plus(amount!), new Prisma.Decimal('0'))
}
