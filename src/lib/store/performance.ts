import { createPersistedStore, useStore } from './createStore'
import type { DataStatus, DayPoint, ProductPerf } from './types'

export type PerformanceState = {
  trend: DayPoint[]
  rows: ProductPerf[]
  dataStatus: DataStatus
}

function seedPerformance(): PerformanceState {
  return {
    trend: [],
    rows: [],
    dataStatus: { shopLastSyncAt: null, adsLastSyncAt: null, lastImportedBy: null, state: 'stale' },
  }
}

function isPerformanceState(x: unknown): x is PerformanceState {
  if (!x || typeof x !== 'object') return false
  const any = x as any
  return Array.isArray(any.trend) && Array.isArray(any.rows) && typeof any.dataStatus === 'object'
}

export const performanceStore = createPersistedStore<PerformanceState>({
  storageKey: 'core_performance_v1',
  getInitialState: seedPerformance,
  validate: isPerformanceState,
})

export const usePerformanceStore = <S,>(selector: (s: PerformanceState) => S) => useStore(performanceStore, selector)

export function hydratePerformance() {
  performanceStore.hydrate()
}

export function setPerformance(next: Partial<PerformanceState>) {
  performanceStore.setState((prev) => ({ ...prev, ...next }))
}

