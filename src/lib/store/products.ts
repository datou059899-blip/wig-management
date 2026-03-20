import { createPersistedStore, useStore } from './createStore'
import type { ProductItem } from './types'

export type ProductsState = {
  products: ProductItem[]
}

function seedProducts(): ProductsState {
  return { products: [] }
}

function isProductsState(x: unknown): x is ProductsState {
  if (!x || typeof x !== 'object') return false
  const any = x as any
  return Array.isArray(any.products)
}

export const productsStore = createPersistedStore<ProductsState>({
  storageKey: 'core_products_v1',
  getInitialState: seedProducts,
  validate: isProductsState,
})

export const useProductsStore = <S,>(selector: (s: ProductsState) => S) => useStore(productsStore, selector)

export function hydrateProducts() {
  productsStore.hydrate()
}

export function setProducts(next: ProductItem[]) {
  productsStore.setState(() => ({ products: next }))
}

