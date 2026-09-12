'use client'

import Link from 'next/link'
import { MoreHorizontal, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

type InteractiveMetricProps = {
  label: string
  value: ReactNode
  description?: ReactNode
  active?: boolean
  onPress?: () => void
  className?: string
}

export function InteractiveMetric({
  label,
  value,
  description,
  active = false,
  onPress,
  className = '',
}: InteractiveMetricProps) {
  const content = (
    <>
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums text-gray-950">{value}</div>
      {description ? <div className="mt-1 text-xs text-gray-400">{description}</div> : null}
    </>
  )

  const classes = `min-w-0 px-4 py-3 text-left transition-colors duration-150 [transition-timing-function:cubic-bezier(0.25,0.1,0.25,1)] ${
    active ? 'bg-brand-50/70' : onPress ? 'hover:bg-gray-50 focus-visible:bg-gray-50' : ''
  } ${className}`

  if (!onPress) return <div className={classes}>{content}</div>

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onPress}
      className={`${classes} w-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500`}
    >
      {content}
    </button>
  )
}

export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`移除筛选：${label}`}
      className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 transition-colors duration-150 hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      {label}
      <X className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  )
}

export function StickyToolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`sticky top-0 z-20 flex min-h-12 flex-wrap items-center gap-2 border-y border-gray-200/80 bg-white/90 px-4 py-2 backdrop-blur-md ${className}`}
    >
      {children}
    </div>
  )
}

type OverflowItem = {
  label: string
  href: string
}

export function OverflowMenu({ items, label = '更多操作' }: { items: OverflowItem[]; label?: string }) {
  return (
    <details className="group relative">
      <summary
        aria-label={label}
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-colors duration-150 hover:bg-gray-50 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white/95 p-1 shadow-lg backdrop-blur-md">
        {items.map((item) => (
          <Link
            key={`${item.href}-${item.label}`}
            href={item.href}
            className="block rounded-md px-3 py-2 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </details>
  )
}

export function CompactEmptyState({ children }: { children: ReactNode }) {
  return <div className="px-4 py-5 text-center text-sm text-gray-500">{children}</div>
}

export function useDelayedVisibility(visible: boolean, delay = 180) {
  const [delayedVisible, setDelayedVisible] = useState(false)

  useEffect(() => {
    if (!visible) {
      setDelayedVisible(false)
      return
    }
    const timer = window.setTimeout(() => setDelayedVisible(true), delay)
    return () => window.clearTimeout(timer)
  }, [delay, visible])

  return delayedVisible
}
