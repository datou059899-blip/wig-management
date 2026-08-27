export const PRICE_SOURCE = {
  MANUAL: 'MANUAL',
  TIKTOK_DISCOUNT: 'TIKTOK_DISCOUNT',
  TIKTOK: 'TIKTOK',
  BASE: 'BASE',
  NONE: 'NONE',
} as const

export type PriceSource = (typeof PRICE_SOURCE)[keyof typeof PRICE_SOURCE]

export type ProductPriceFields = {
  discountPriceUsd?: number | null
  tiktokDiscountPriceUsd?: number | null
  tiktokPriceUsd?: number | null
  priceUsd?: number | null
}

export type CurrentSellingPriceResult = {
  currentSellingPriceUsd: number | null
  priceSource: PriceSource
}

function positivePrice(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function resolveCurrentSellingPriceUsd(product: ProductPriceFields): CurrentSellingPriceResult {
  const manualPrice = positivePrice(product.discountPriceUsd)
  if (manualPrice !== null) {
    return { currentSellingPriceUsd: manualPrice, priceSource: PRICE_SOURCE.MANUAL }
  }

  const tiktokDiscountPrice = positivePrice(product.tiktokDiscountPriceUsd)
  if (tiktokDiscountPrice !== null) {
    return { currentSellingPriceUsd: tiktokDiscountPrice, priceSource: PRICE_SOURCE.TIKTOK_DISCOUNT }
  }

  const tiktokPrice = positivePrice(product.tiktokPriceUsd)
  if (tiktokPrice !== null) {
    return { currentSellingPriceUsd: tiktokPrice, priceSource: PRICE_SOURCE.TIKTOK }
  }

  const basePrice = positivePrice(product.priceUsd)
  if (basePrice !== null) {
    return { currentSellingPriceUsd: basePrice, priceSource: PRICE_SOURCE.BASE }
  }

  return { currentSellingPriceUsd: null, priceSource: PRICE_SOURCE.NONE }
}
