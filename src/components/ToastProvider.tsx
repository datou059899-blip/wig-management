'use client'

import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react'

type ToastType = 'success' | 'info' | 'warning' | 'error'
type Toast = {
  id: string
  type: ToastType
  message: string
}

type ToastContextValue = {
  success: (message: string) => void
  info: (message: string) => void
  warning: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const durations: Record<ToastType, number> = {
  success: 2800,
  info: 3000,
  warning: 4000,
  error: 5000,
}

const tone: Record<ToastType, { icon: string; className: string }> = {
  success: { icon: '✓', className: 'bg-emerald-50 text-emerald-600' },
  info: { icon: 'i', className: 'bg-sky-50 text-sky-600' },
  warning: { icon: '!', className: 'bg-amber-50 text-amber-600' },
  error: { icon: '!', className: 'bg-rose-50 text-rose-600' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback((type: ToastType, message: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`
    setToasts((current) => [...current, { id, type, message }])
    window.setTimeout(() => remove(id), durations[type])
  }, [remove])

  const value = useMemo(() => ({
    success: (message: string) => show('success', message),
    info: (message: string) => show('info', message),
    warning: (message: string) => show('warning', message),
    error: (message: string) => show('error', message),
  }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed left-1/2 top-24 z-40 flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 flex-col items-center gap-2 pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto inline-flex max-w-full items-start gap-2 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 text-sm text-slate-800 shadow-lg shadow-slate-900/10 transition-all duration-200 ease-out"
            >
              <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${tone[toast.type].className}`}>
                {tone[toast.type].icon}
              </span>
              <span className="leading-relaxed">{toast.message}</span>
              {toast.type === 'error' && (
                <button
                  type="button"
                  onClick={() => remove(toast.id)}
                  className="-mr-1 ml-1 text-xs text-slate-400 transition hover:text-slate-700"
                  aria-label="关闭错误提示"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
