export type ProductSkuResolverProduct = {
  id: string
  sku: string | null
  name?: string | null
  skuId?: string | null
}

export type ProductSkuResolverAlias = {
  productId: string
  aliasSku: string | null
}

export type ResolvedProductMatch<T extends ProductSkuResolverProduct> = {
  product: T
  primarySku: string | null
  originalSku: string
  resolvedSku: string
  productId: string
  matchedBy: 'alias' | 'product' | 'normalized' | 'raw'
  aliasSku: string | null
  productSku: string | null
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => normalizeCell(value)).filter(Boolean)))
}

export function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value.trim() : String(value).trim()
}

export function normalizeSkuText(value: string | null | undefined) {
  return normalizeCell(value)
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeSkuForCompare(value: string | null | undefined) {
  return normalizeSkuText(value).replace(/\s+/g, '').toUpperCase()
}

export function isSpecialLinkSku(value: string | null | undefined) {
  return normalizeSkuForCompare(value) === 'FG+GQ'
}

export function extractAliasSkusFromText(value: string | null | undefined) {
  const aliases = new Set<string>()
  const text = normalizeSkuText(value)
  if (!text) return []

  const pattern = /[（(]\s*([^()（）]+?)\s*[)）]/g
  let match = pattern.exec(text)
  while (match) {
    const alias = normalizeSkuText(match[1])
    if (alias) {
      aliases.add(alias)
    }
    match = pattern.exec(text)
  }

  return Array.from(aliases)
}

export function extractMainSkuFromText(value: string | null | undefined) {
  const text = normalizeSkuText(value)
  if (!text) return ''

  const match = text.match(/^(.+?)[(][^()]+[)]$/)
  if (!match) return text

  return normalizeSkuText(match[1])
}

function buildTypoVariants(value: string) {
  const normalized = normalizeSkuText(value)
  if (!normalized) return []

  const variants = new Set<string>()

  if (/^SHM-/i.test(normalized)) {
    variants.add(normalized.replace(/^SHM-/i, 'SMH-'))
  }
  if (/^SMH-/i.test(normalized)) {
    variants.add(normalized.replace(/^SMH-/i, 'SHM-'))
  }
  if (/^C\d/i.test(normalized)) {
    variants.add(`L${normalized}`)
  }
  if (/^LC\d/i.test(normalized)) {
    variants.add(normalized.replace(/^LC/i, 'C'))
  }

  return Array.from(variants)
}

function resolveCanonicalProductSku(value: string | null | undefined) {
  return normalizeSkuText(extractMainSkuFromText(value))
    || normalizeSkuText(value)
    || null
}

export function buildSkuMatchVariants(value: string | null | undefined) {
  const rawLiteral = normalizeCell(value)
  const raw = normalizeSkuText(value)
  if (!rawLiteral && !raw) return []

  const mainSku = extractMainSkuFromText(raw)
  const aliasSkus = extractAliasSkusFromText(raw)
  const allValues = new Set<string>()

  if (rawLiteral) {
    allValues.add(rawLiteral)
  }
  if (raw) {
    allValues.add(raw)
  }

  if (mainSku) {
    allValues.add(mainSku)
  }
  aliasSkus.forEach((aliasSku) => allValues.add(aliasSku))

  Array.from(allValues).forEach((item) => {
    buildTypoVariants(item).forEach((variant) => allValues.add(variant))
  })

  return Array.from(allValues)
}

export function buildProductSkuResolver<T extends ProductSkuResolverProduct>(
  products: T[],
  aliases: ProductSkuResolverAlias[],
) {
  const productById = new Map(products.map((product) => [product.id, product]))
  const productBySkuId = new Map<string, T>()
  const productByName = new Map<string, T>()
  const explicitAliasListByProductId = new Map<string, string[]>()
  const relatedSkuSetByProductId = new Map<string, Set<string>>()
  const primarySkuByProductId = new Map<string, string | null>()
  const matchByNormalizedKey = new Map<string, Omit<ResolvedProductMatch<T>, 'originalSku'>>()
  const matchPriorityByNormalizedKey = new Map<string, number>()
  const explicitAliasTargetProductIdByNormalizedKey = new Map<string, string>()

  const ensureRelatedSkuSet = (productId: string) => {
    if (!relatedSkuSetByProductId.has(productId)) {
      relatedSkuSetByProductId.set(productId, new Set<string>())
    }
    return relatedSkuSetByProductId.get(productId)!
  }

  const registerRelatedSku = (productId: string, sku: string | null | undefined) => {
    uniqueValues(buildSkuMatchVariants(sku)).forEach((item) => ensureRelatedSkuSet(productId).add(item))
  }

  const registerLookup = (
    product: T,
    sku: string | null | undefined,
    options: {
      matchedBy: 'alias' | 'product' | 'normalized'
      aliasSku?: string | null
      productSku?: string | null
    },
  ) => {
    const priority = options.matchedBy === 'alias' ? 1 : options.matchedBy === 'product' ? 2 : 3
    const primarySku = primarySkuByProductId.get(product.id)
      || resolveCanonicalProductSku(product.sku)
      || null
    const resolvedSku = primarySku || normalizeSkuText(product.sku) || normalizeSkuText(sku) || ''

    buildSkuMatchVariants(sku).forEach((item) => {
      const normalizedKey = normalizeSkuForCompare(item)
      if (!normalizedKey) return

      const existingPriority = matchPriorityByNormalizedKey.get(normalizedKey)
      if (existingPriority !== undefined && existingPriority <= priority) return

      matchByNormalizedKey.set(normalizedKey, {
        product,
        primarySku,
        resolvedSku,
        productId: product.id,
        matchedBy: options.matchedBy,
        aliasSku: normalizeSkuText(options.aliasSku) || null,
        productSku: normalizeSkuText(options.productSku || product.sku) || null,
      })
      matchPriorityByNormalizedKey.set(normalizedKey, priority)
    })
  }

  aliases.forEach((alias) => {
    const aliasSku = normalizeSkuText(alias.aliasSku)
    if (!aliasSku) return
    const bucket = explicitAliasListByProductId.get(alias.productId) || []
    if (!bucket.includes(aliasSku)) {
      bucket.push(aliasSku)
      explicitAliasListByProductId.set(alias.productId, bucket)
    }

    const normalizedAliasKey = normalizeSkuForCompare(aliasSku)
    if (normalizedAliasKey && !explicitAliasTargetProductIdByNormalizedKey.has(normalizedAliasKey)) {
      explicitAliasTargetProductIdByNormalizedKey.set(normalizedAliasKey, alias.productId)
    }
  })

  products.forEach((product) => {
    const normalizedSkuId = normalizeCell(product.skuId)
    if (normalizedSkuId && !productBySkuId.has(normalizedSkuId)) {
      productBySkuId.set(normalizedSkuId, product)
    }

    const normalizedName = normalizeSkuText(product.name)
    if (normalizedName && !productByName.has(normalizedName)) {
      productByName.set(normalizedName, product)
    }

    const primarySku = resolveCanonicalProductSku(product.sku)
    primarySkuByProductId.set(product.id, primarySku)

    registerRelatedSku(product.id, product.sku)
    registerRelatedSku(product.id, primarySku)
    extractAliasSkusFromText(product.sku).forEach((aliasSku) => registerRelatedSku(product.id, aliasSku))
    extractAliasSkusFromText(product.name).forEach((aliasSku) => registerRelatedSku(product.id, aliasSku))

    registerLookup(product, product.sku, {
      matchedBy: 'product',
      productSku: product.sku,
    })

    if (primarySku && normalizeSkuForCompare(primarySku) !== normalizeSkuForCompare(product.sku)) {
      registerLookup(product, primarySku, {
        matchedBy: 'normalized',
        productSku: product.sku,
      })
    }

    extractAliasSkusFromText(product.sku).forEach((aliasSku) => registerLookup(product, aliasSku, {
      matchedBy: 'normalized',
      productSku: product.sku,
    }))
    extractAliasSkusFromText(product.name).forEach((aliasSku) => registerLookup(product, aliasSku, {
      matchedBy: 'normalized',
      productSku: product.sku,
    }))
  })

  aliases.forEach((alias) => {
    const product = productById.get(alias.productId)
    if (!product) return
    registerRelatedSku(product.id, alias.aliasSku)
    registerLookup(product, alias.aliasSku, {
      matchedBy: 'alias',
      aliasSku: alias.aliasSku,
      productSku: product.sku,
    })
  })

  const resolveProductBySku = (sku: string | null | undefined): ResolvedProductMatch<T> | null => {
    const originalSku = normalizeCell(sku)
    const raw = normalizeSkuText(sku)
    if (!raw) return null

    const normalizedKey = normalizeSkuForCompare(raw)
    const match = normalizedKey ? matchByNormalizedKey.get(normalizedKey) || null : null
    if (!match) return null

    return {
      ...match,
      originalSku,
    }
  }

  const resolveExplicitAliasTargetBySku = (sku: string | null | undefined): ResolvedProductMatch<T> | null => {
    const originalSku = normalizeCell(sku)
    const normalizedSku = normalizeSkuForCompare(sku)
    if (!normalizedSku) return null

    const targetProductId = explicitAliasTargetProductIdByNormalizedKey.get(normalizedSku)
    if (!targetProductId) return null

    const product = productById.get(targetProductId)
    if (!product) return null

    return {
      product,
      primarySku: primarySkuByProductId.get(targetProductId) || null,
      originalSku,
      resolvedSku: primarySkuByProductId.get(targetProductId)
        || resolveCanonicalProductSku(product.sku)
        || originalSku,
      productId: targetProductId,
      matchedBy: 'alias',
      aliasSku: normalizeSkuText(sku) || null,
      productSku: normalizeSkuText(product.sku) || null,
    }
  }

  const resolveProductReference = (params: {
    originalSku?: string | null | undefined
    skuCandidates?: Array<string | null | undefined>
    skuIdCandidates?: Array<string | null | undefined>
    nameCandidates?: Array<string | null | undefined>
  }): ResolvedProductMatch<T> | null => {
    const originalSku = normalizeCell(params.originalSku)

    for (const candidate of params.skuCandidates || []) {
      const match = resolveProductBySku(candidate)
      if (match) {
        return originalSku && match.originalSku !== originalSku
          ? { ...match, originalSku }
          : match
      }
    }

    for (const candidate of params.skuIdCandidates || []) {
      const normalizedSkuId = normalizeCell(candidate)
      if (!normalizedSkuId) continue
      const product = productBySkuId.get(normalizedSkuId)
      if (!product) continue
      const primarySku = primarySkuByProductId.get(product.id)
        || resolveCanonicalProductSku(product.sku)
        || originalSku
      return {
        product,
        primarySku,
        originalSku,
        resolvedSku: primarySku,
        productId: product.id,
        matchedBy: 'product',
        aliasSku: null,
        productSku: normalizeSkuText(product.sku) || null,
      }
    }

    for (const candidate of params.nameCandidates || []) {
      const normalizedName = normalizeSkuText(candidate)
      if (!normalizedName) continue
      const product = productByName.get(normalizedName)
      if (!product) continue
      const primarySku = primarySkuByProductId.get(product.id)
        || resolveCanonicalProductSku(product.sku)
        || originalSku
      return {
        product,
        primarySku,
        originalSku,
        resolvedSku: primarySku,
        productId: product.id,
        matchedBy: 'product',
        aliasSku: null,
        productSku: normalizeSkuText(product.sku) || null,
      }
    }

    return null
  }

  const getFilterPrimarySkuForProduct = (product: T) => {
    const explicitAliasTarget = resolveExplicitAliasTargetBySku(product.sku)
    if (explicitAliasTarget && explicitAliasTarget.product.id !== product.id) {
      return explicitAliasTarget.primarySku
        || normalizeSkuText(extractMainSkuFromText(explicitAliasTarget.product.sku))
        || normalizeSkuText(explicitAliasTarget.product.sku)
        || null
    }

    return primarySkuByProductId.get(product.id)
      || normalizeSkuText(extractMainSkuFromText(product.sku))
      || normalizeSkuText(product.sku)
      || null
  }

  return {
    primarySkuByProductId,
    relatedSkuSetByProductId,
    resolveProductBySku,
    resolveExplicitAliasTargetBySku,
    resolveProductReference,
    getPrimarySku: (productId: string) => primarySkuByProductId.get(productId) || null,
    getFilterPrimarySkuForProduct,
    getRelatedSkus: (productId: string) => Array.from(relatedSkuSetByProductId.get(productId) || []),
  }
}
