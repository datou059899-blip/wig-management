export type ProductSalesRiskFields = {
  businessStatus: unknown
  inventoryRisk: unknown
}

const NEEDS_ACTION_INVENTORY_RISKS = new Set(['断货', '高风险', '需关注'])

export function isNeedsActionProduct(product: ProductSalesRiskFields) {
  return product.businessStatus === 'ACTIVE'
    && typeof product.inventoryRisk === 'string'
    && NEEDS_ACTION_INVENTORY_RISKS.has(product.inventoryRisk)
}

export function parseProductSalesProducts<T extends ProductSalesRiskFields>(payload: unknown): T[] {
  if (!payload || typeof payload !== 'object') {
    throw new Error('销售分析响应格式无效')
  }

  const products = (payload as { products?: unknown }).products
  if (!Array.isArray(products)) {
    throw new Error('销售分析响应缺少 products')
  }

  if (products.some((product) => (
    !product
    || typeof product !== 'object'
    || typeof (product as ProductSalesRiskFields).businessStatus !== 'string'
    || typeof (product as ProductSalesRiskFields).inventoryRisk !== 'string'
  ))) {
    throw new Error('销售分析商品数据格式无效')
  }

  return products as T[]
}
