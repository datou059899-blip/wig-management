'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { getAllowedMenuItems } from '@/lib/pagePermissions'
import { useState, useEffect, useMemo } from 'react'
import GlobalSearchDialog from '@/components/GlobalSearchDialog'
import {
  BadgeDollarSign,
  BarChart3,
  Boxes,
  ClipboardList,
  FileText,
  Film,
  Handshake,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  Package,
  RefreshCw,
  Settings,
  UserCog,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  operator: '运营',
  viewer: '查看者',
}

const ICONS: Record<string, LucideIcon> = {
  workbench: ClipboardList,
  overview: LayoutDashboard,
  products: Package,
  productOpportunities: Lightbulb,
  productSales: BarChart3,
  inventoryPurchasing: Boxes,
  materials: Wrench,
  influencers: Handshake,
  scripts: FileText,
  viralVideos: Film,
  videoMetrics: BarChart3,
  performance: BadgeDollarSign,
  tiktokSync: RefreshCw,
  priceCheck: BadgeDollarSign,
  users: Users,
  settings: Settings,
}

const NAV_GROUPS = [
  { title: '今日', ids: ['workbench', 'overview'] },
  { title: '商品与供应链', ids: ['products', 'productOpportunities', 'inventoryPurchasing', 'materials'] },
  { title: '销售经营', ids: ['productSales', 'performance', 'priceCheck'] },
  { title: '内容增长', ids: ['influencers', 'viralVideos', 'videoMetrics'] },
  { title: '系统维护', ids: ['tiktokSync', 'users', 'settings'] },
] as const

function getNavLabel(item: { id: string; name: string }) {
  return item.id === 'productSales' ? '销售分析' : item.name
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') {
    return pathname === '/dashboard'
  }
  if (href === '/dashboard/products') {
    return pathname === href
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
    const rawItems = getAllowedMenuItems(role || 'viewer', permissionMode || 'role', allowedPages || '')
    const hasViralVideos = rawItems.some((item) => item.id === 'viralVideos')
    return rawItems.filter((item) => !(hasViralVideos && item.id === 'scripts'))
  }, [role, permissionMode, allowedPages])

  const groupedNavItems = useMemo(() => {
    const usedIds = new Set<string>()
    const groups: Array<{ title: string; items: typeof navItems }> = NAV_GROUPS.map((group) => {
      const items = group.ids
        .map((id) => navItems.find((item) => item.id === id))
        .filter(Boolean) as typeof navItems
      items.forEach((item) => usedIds.add(item.id))
      return { title: group.title, items }
    }).filter((group) => group.items.length > 0)

    const otherItems = navItems.filter((item) => !usedIds.has(item.id))
    if (otherItems.length > 0) {
      groups.push({ title: '其他', items: otherItems })
    }
    return groups
  }, [navItems])
  
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
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 border-b border-gray-200 bg-white text-gray-900 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Sunnymay" className="w-7 h-7 object-contain" />
          <span className="font-semibold text-sm">Sunnymay</span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="rounded-md p-2 hover:bg-gray-100" aria-label={mobileMenuOpen ? '关闭菜单' : '打开菜单'}>
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* 桌面端侧边栏 */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-[200px] border-r border-gray-200 bg-white text-gray-700 flex-col z-50">
        <div className="p-4 border-b border-gray-200">
          <Link href="/dashboard" className="flex items-center gap-2">
            <img src="/logo.png" alt="Sunnymay" className="w-8 h-8 object-contain" />
            <div className="flex flex-col">
              <span className="text-gray-900 font-semibold text-sm">Sunnymay</span>
              <span className="text-gray-500 text-[10px]">运营工作台</span>
            </div>
          </Link>
          <GlobalSearchDialog />
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <div className="space-y-4">
            {groupedNavItems.map((group) => (
              <div key={group.title}>
                <div className="px-3 pb-1 text-[10px] font-semibold text-gray-400">
                  {group.title}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.path)
                    const Icon = ICONS[item.id] || FileText
                    return (
                      <Link
                        key={item.id}
                        href={item.path}
                        className={`relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                          active
                            ? 'bg-brand-50 text-gray-900 before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-r before:bg-brand-500'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-brand-600' : 'text-gray-400'}`} />
                        <span className="truncate">{getNavLabel(item)}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="p-3 border-t border-gray-200">
          <div className="relative">
            <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="w-full flex items-center gap-2 rounded-md px-2 py-2 hover:bg-gray-100">
              <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center">
                <span className="text-brand-700 text-xs font-medium">
                  {(session?.user?.name || session?.user?.email || 'U')[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="text-xs font-medium text-gray-900 truncate">{session?.user?.name || session?.user?.email}</div>
                <div className="text-[10px] text-gray-500">{ROLE_LABELS[role || ''] || role}</div>
              </div>
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-md border border-gray-200 bg-white shadow-xl">
                <Link href="/dashboard/account" className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-100" onClick={() => setUserMenuOpen(false)}>
                  <UserCog className="h-4 w-4" /> 账号设置
                </Link>
                <button onClick={() => signOut({ callbackUrl: '/' })} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-100">
                  <LogOut className="h-4 w-4" /> 退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* 移动端侧边栏 */}
      <div className={`sidebar-container lg:hidden fixed inset-0 z-40 transition-opacity ${mobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
        <aside className={`absolute left-0 top-14 bottom-0 w-[260px] border-r border-gray-200 bg-white text-gray-700 flex flex-col shadow-2xl transform transition-transform ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <nav className="flex-1 overflow-y-auto py-3 px-3">
            <div className="space-y-4">
              {groupedNavItems.map((group) => (
                <div key={group.title}>
                  <div className="px-3 pb-1 text-[10px] font-semibold text-gray-400">
                    {group.title}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const active = isActive(pathname, item.path)
                      const Icon = ICONS[item.id] || FileText
                      return (
                        <Link key={item.id} href={item.path} className={`relative flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium ${active ? 'bg-brand-50 text-gray-900 before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:bg-brand-500' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
                          <Icon className={`h-4 w-4 ${active ? 'text-brand-600' : 'text-gray-400'}`} />
                          <span>{getNavLabel(item)}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>
        </aside>
      </div>
    </>
  )
}
