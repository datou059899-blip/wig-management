import { useSyncExternalStore } from 'react'

type Listener = () => void

export type StoreApi<T> = {
  getState: () => T
  setState: (updater: (prev: T) => T, opts?: { persist?: boolean }) => void
  subscribe: (listener: Listener) => () => void
  hydrate: () => void
  reset: (next: T) => void
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function createPersistedStore<T>(params: {
  storageKey: string
  getInitialState: () => T
  validate?: (x: unknown) => x is T
}): StoreApi<T> {
  const { storageKey, getInitialState, validate } = params
  let state: T = getInitialState()
  const listeners = new Set<Listener>()

  const emit = () => {
    listeners.forEach((l) => l())
  }

  const persist = (next: T) => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  const hydrate = () => {
    if (typeof window === 'undefined') return
    const parsed = safeParse<unknown>(window.localStorage.getItem(storageKey))
    if (parsed && (!validate || validate(parsed))) {
      state = parsed as T
      emit()
    } else if (parsed) {
      // 数据结构不兼容：覆盖为初始值，避免页面崩溃
      state = getInitialState()
      persist(state)
      emit()
    }
  }

  const api: StoreApi<T> = {
    getState: () => state,
    setState: (updater, opts) => {
      state = updater(state)
      if (opts?.persist !== false) persist(state)
      emit()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    hydrate,
    reset: (next) => {
      state = next
      persist(state)
      emit()
    },
  }

  // 跨 tab 同步
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== storageKey) return
      const parsed = safeParse<unknown>(e.newValue)
      if (parsed && (!validate || validate(parsed))) {
        state = parsed as T
        emit()
      }
    })
  }

  return api
}

export function useStore<T, S>(store: StoreApi<T>, selector: (state: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  )
}

