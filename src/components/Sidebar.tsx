'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { getAllowedMenuItems, PAGE_PERMISSIONS } from '@/lib/pagePermissions'
import { useState, useEffect, useMemo } from 'react'

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  operator: '运营',
  viewer: '查看者',
}

// 图标映射
const ICONS: Record<string, string> = {
  workbench: '📋',
  overview: '📊',
  products: '📦',
  productOpportunities: '💡',
  influencers: '👥',
  scripts: '📝',
  viralVideos: '🎬',
  videoMetrics: '📈',
  performance: '💰',
  tiktokSync: '🔄',
  priceCheck: '💵',
  users: '⚙️',
  settings: '🔧',
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') {
    return pathname === '/dashboard'
  }
  return pathname.startsWith(href)
}

export default function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = (session?.user as any)?.role as string | undefined
  const permissionMode = (session?.user as any)?.permissionMode as string | undefined
  const allowedPages = (session?.user as any)?.allowedPages as string | undefined
  
  // 使用新的权限系统获取菜单项
  const navItems = useMemo(() => {
    return getAllowedMenuItems(role || 'viewer', permissionMode || 'role', allowedPages || '')
  }, [role, permissionMode, allowedPages])
  
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (mobileMenuOpen && !target.closest('.sidebar-container')) {
        setMobileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mobileMenuOpen])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  return (
    <>
      {/* 移动端顶部导航栏 */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-gradient-to-r from-slate-900 to-slate-800 text-white z-50 flex items-center justify-between px-4 shadow-lg">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Sunnymay" className="w-7 h-7 object-contain" />
          <span className="font-semibold text-sm">Sunnymay</span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 hover:bg-slate-700/50 rounded-lg">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      </header>

      {/* 桌面端侧边栏 */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-[200px] bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-slate-300 flex-col z-50 shadow-xl">
        <div className="p-4 border-b border-slate-700/50">
          <Link href="/dashboard" className="flex items-center gap-2">
            <img src="/logo.png" alt="Sunnymay" className="w-8 h-8 object-contain" />
            <div className="flex flex-col">
              <span className="text-white font-semibold text-sm">Sunnymay</span>
              <span className="text-slate-500 text-[10px]">运营工作台</span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <div className="space-y-0.5">
            {navItems.map((item) => {
              const active = isActive(pathname, item.path)
              return (
                <Link
                  key={item.id}
                  href={item.path}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    active
                      ? 'bg-gradient-to-r from-pink-500 to-pink-600 text-white shadow-lg shadow-pink-500/25'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <span>{ICONS[item.id] || '📄'}</span>
                  <span className="truncate">{item.name}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        <div className="p-3 border-t border-slate-700/50">
          <div className="relative">
            <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-800/50">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-400 to-blue-400 flex items-center justify-center">
                <span className="text-white text-xs font-medium">
                  {(session?.user?.name || session?.user?.email || 'U')[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="text-xs font-medium text-white truncate">{session?.user?.name || session?.user?.email}</div>
                <div className="text-[10px] text-slate-500">{ROLE_LABELS[role || ''] || role}</div>
              </div>
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-slate-800 rounded-lg border border-slate-700 shadow-xl overflow-hidden">
                <Link href="/dashboard/account" className="flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700" onClick={() => setUserMenuOpen(false)}>
                  <span>⚙️</span> 账号设置
                </Link>
                <button onClick={() => signOut({ callbackUrl: '/' })} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-300 hover:bg-slate-700">
                  <span>🚪</span> 退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* 移动端侧边栏 */}
      <div className={`sidebar-container lg:hidden fixed inset-0 z-40 transition-opacity ${mobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
        <aside className={`absolute left-0 top-14 bottom-0 w-[260px] bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-slate-300 flex flex-col shadow-2xl transform transition-transform ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <nav className="flex-1 overflow-y-auto py-3 px-3">
            <div className="space-y-1">
              {navItems.map((item) => {
                const active = isActive(pathname, item.path)
                return (
                  <Link key={item.id} href={item.path} className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium ${active ? 'bg-gradient-to-r from-pink-500 to-pink-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}>
                    <span>{ICONS[item.id] || '📄'}</span>
                    <span>{item.name}</span>
                  </Link>
                )
              })}
            </div>
          </nav>
        </aside>
      </div>
    </>
  )
}
