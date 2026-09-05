'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type GlobalSearchResult = {
  id: string
  group: string
  title: string
  subtitle: string
  meta: string
  href: string
}

type GlobalSearchGroup = {
  label: string
  items: GlobalSearchResult[]
}

export default function GlobalSearchDialog() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<GlobalSearchGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const results = useMemo(() => groups.flatMap((group) => group.items), [groups])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setGroups([])
      setLoading(false)
      setActiveIndex(0)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/global-search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || '搜索失败')
        setGroups(Array.isArray(data.groups) ? data.groups : [])
        setActiveIndex(0)
      } catch (error) {
        if (!controller.signal.aborted) {
          setGroups([])
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [open, query])

  function closeDialog() {
    setOpen(false)
    setQuery('')
    setGroups([])
    setActiveIndex(0)
  }

  function openResult(result: GlobalSearchResult | undefined) {
    if (!result) return
    closeDialog()
    router.push(result.href)
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeDialog()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      openResult(results[activeIndex])
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-left text-xs text-slate-300 hover:border-slate-600 hover:bg-slate-800"
      >
        <span>全局搜索</span>
        <span className="rounded border border-slate-600 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">⌘K</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/35 px-4 pt-[12vh]"
          onMouseDown={closeDialog}
        >
          <div
            className="w-full max-w-[660px] rounded-lg border border-slate-200 bg-white shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={handleDialogKeyDown}
          >
            <div className="border-b border-slate-100 px-4 py-3">
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索 SKU、商品、采购单、供应商、达人、任务…"
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="max-h-[58vh] overflow-y-auto py-2">
              {query.trim().length < 2 && (
                <div className="px-4 py-3 text-sm text-slate-500">输入至少 2 个字符开始搜索</div>
              )}
              {query.trim().length >= 2 && loading && (
                <div className="px-4 py-3 text-sm text-slate-500">搜索中...</div>
              )}
              {query.trim().length >= 2 && !loading && results.length === 0 && (
                <div className="px-4 py-3 text-sm text-slate-500">没有找到匹配结果</div>
              )}
              {!loading && groups.map((group) => (
                <div key={group.label} className="py-1">
                  <div className="px-4 pb-1 pt-2 text-[11px] font-semibold text-slate-400">{group.label}</div>
                  {group.items.map((item) => {
                    const index = results.findIndex((result) => result.id === item.id)
                    const active = index === activeIndex
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => openResult(item)}
                        className={`grid w-full grid-cols-[1fr_auto] gap-3 px-4 py-2 text-left ${
                          active ? 'bg-slate-100' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-900">{item.title}</span>
                          <span className="block truncate text-xs text-slate-500">{item.subtitle}</span>
                        </span>
                        <span className="self-center whitespace-nowrap text-xs text-slate-500">{item.meta}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
