import { createPersistedStore, useStore } from './createStore'
import type { Influencer } from './types'

export type InfluencersState = {
  items: Influencer[]
}

function seedInfluencers(): InfluencersState {
  // 注意：这里只提供极简 seed，真实示例数据仍然在 influencers 页面内 mockData（后续会迁移掉）
  return { items: [] }
}

function isInfluencersState(x: unknown): x is InfluencersState {
  if (!x || typeof x !== 'object') return false
  const any = x as any
  return Array.isArray(any.items)
}

export const influencersStore = createPersistedStore<InfluencersState>({
  storageKey: 'core_influencers_v1',
  getInitialState: seedInfluencers,
  validate: isInfluencersState,
})

export const useInfluencersStore = <S,>(selector: (s: InfluencersState) => S) => useStore(influencersStore, selector)

export function hydrateInfluencers() {
  influencersStore.hydrate()
}

export function setInfluencers(next: Influencer[]) {
  influencersStore.setState(() => ({ items: next }))
}

