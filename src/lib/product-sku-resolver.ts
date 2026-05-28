export type ProductSkuResolverProduct = {
  id: string
  sku: string | null
  name?: string | null
}

export type ProductSkuResolverAlias = {
  productId: string
  aliasSku: string | null
}

export type ResolvedProductMatch<T extends ProductSkuResolverProduct> = {
  product: T
  primarySku: string | null
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
  const explicitAliasListByProductId = new Map<string, string[]>()
  const relatedSkuSetByProductId = new Map<string, Set<string>>()
  const primarySkuByProductId = new Map<string, string | null>()
  const lookupByKey = new Map<string, ResolvedProductMatch<T>>()
  const normalizedLookupByKey = new Map<string, ResolvedProductMatch<T>>()
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

  const registerLookup = (product: T, sku: string | null | undefined) => {
    const primarySku = primarySkuByProductId.get(product.id) ?? null
    buildSkuMatchVariants(sku).forEach((item) => {
      if (!lookupByKey.has(item)) {
        lookupByKey.set(item, { product, primarySku })
      }
      const normalizedKey = normalizeSkuForCompare(item)
      if (normalizedKey && !normalizedLookupByKey.has(normalizedKey)) {
        normalizedLookupByKey.set(normalizedKey, { product, primarySku })
      }
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
    const extractedPrimarySku = normalizeSkuText(extractMainSkuFromText(product.sku))
      || normalizeSkuText(product.sku)
      || null
    const explicitAliases = explicitAliasListByProductId.get(product.id) || []
    const preferredPrimarySku = extractedPrimarySku
      ? buildTypoVariants(extractedPrimarySku).find((variant) => explicitAliases.includes(variant)) || extractedPrimarySku
      : null
    const primarySku = preferredPrimarySku
    primarySkuByProductId.set(product.id, primarySku)

    registerRelatedSku(product.id, product.sku)
    registerRelatedSku(product.id, primarySku)
    extractAliasSkusFromText(product.sku).forEach((aliasSku) => registerRelatedSku(product.id, aliasSku))
    extractAliasSkusFromText(product.name).forEach((aliasSku) => registerRelatedSku(product.id, aliasSku))

    registerLookup(product, product.sku)
    registerLookup(product, primarySku)
    extractAliasSkusFromText(product.sku).forEach((aliasSku) => registerLookup(product, aliasSku))
    extractAliasSkusFromText(product.name).forEach((aliasSku) => registerLookup(product, aliasSku))
  })

  aliases.forEach((alias) => {
    const product = productById.get(alias.productId)
    if (!product) return
    registerRelatedSku(product.id, alias.aliasSku)
    registerLookup(product, alias.aliasSku)
  })

  const resolveProductBySku = (sku: string | null | undefined): ResolvedProductMatch<T> | null => {
    const raw = normalizeSkuText(sku)
    if (!raw) return null

    const exactMatch = lookupByKey.get(raw)
    if (exactMatch) return exactMatch

    const normalizedKey = normalizeSkuForCompare(raw)
    if (normalizedKey && normalizedLookupByKey.has(normalizedKey)) {
      return normalizedLookupByKey.get(normalizedKey) || null
    }

    for (const variant of buildSkuMatchVariants(raw)) {
      if (lookupByKey.has(variant)) {
        return lookupByKey.get(variant) || null
      }
      const variantNormalizedKey = normalizeSkuForCompare(variant)
      if (variantNormalizedKey && normalizedLookupByKey.has(variantNormalizedKey)) {
        return normalizedLookupByKey.get(variantNormalizedKey) || null
      }
    }

    return null
  }

  const resolveExplicitAliasTargetBySku = (sku: string | null | undefined): ResolvedProductMatch<T> | null => {
    const normalizedSku = normalizeSkuForCompare(sku)
    if (!normalizedSku) return null

    const targetProductId = explicitAliasTargetProductIdByNormalizedKey.get(normalizedSku)
    if (!targetProductId) return null

    const product = productById.get(targetProductId)
    if (!product) return null

    return {
      product,
      primarySku: primarySkuByProductId.get(targetProductId) || null,
    }
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
    getPrimarySku: (productId: string) => primarySkuByProductId.get(productId) || null,
    getFilterPrimarySkuForProduct,
    getRelatedSkus: (productId: string) => Array.from(relatedSkuSetByProductId.get(productId) || []),
  }
}
