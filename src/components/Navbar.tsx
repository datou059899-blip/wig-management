'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useState, useMemo } from 'react'
import { getAllowedMenuItems, PAGE_PERMISSIONS } from '@/lib/pagePermissions'

const SITE_NAME = 'Sunnymay'
const SITE_SUBTITLE = '运营工作台'

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

// 判断是否为当前页面
function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') {
    return pathname === '/dashboard'
  }
  return pathname.startsWith(href)
}

export default function Navbar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = (session?.user as any)?.role as string | undefined
  const permissionMode = (session?.user as any)?.permissionMode as string | undefined
  const allowedPages = (session?.user as any)?.allowedPages as string | undefined
  
  // 使用新的权限系统获取菜单项
  const navItems = useMemo(() => {
    return getAllowedMenuItems(role || 'viewer', permissionMode || 'role', allowedPages || '')
  }, [role, permissionMode, allowedPages])
  
  // 分离主要菜单和更多菜单
  const mainItems = navItems.slice(0, 6)
  const moreItems = navItems.slice(6)
  
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo + 品牌名 */}
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <img 
                src="/logo.png" 
                alt="Sunnymay"
                className="h-9 w-auto object-contain"
              />
              <div className="flex flex-col">
                <span className="text-base font-semibold text-gray-900 leading-tight">{SITE_NAME}</span>
                <span className="text-[10px] text-gray-400 leading-tight">{SITE_SUBTITLE}</span>
              </div>
            </Link>
            
            <div className="hidden sm:block h-8 w-px bg-gray-200 mx-1"></div>
            
            {/* 导航菜单 */}
            <div className="hidden lg:flex items-center gap-0.5 ml-2">
              {mainItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.path}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
                    isActive(pathname, item.path)
                      ? 'text-blue-700 bg-blue-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <span className="mr-1.5">{ICONS[item.id] || '📄'}</span>
                  {item.name}
                </Link>
              ))}
              
              {/* 更多下拉菜单 */}
              {moreItems.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setMoreOpen(!moreOpen)}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 flex items-center gap-1 ${
                      moreItems.some(item => isActive(pathname, item.path))
                        ? 'text-blue-700 bg-blue-50'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <span>更多</span>
                    <svg className={`w-3.5 h-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {moreOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-48 rounded-lg border border-gray-200 bg-white shadow-lg z-50 py-1.5">
                      {moreItems.map((item) => (
                        <Link
                          key={item.id}
                          href={item.path}
                          className={`flex items-center gap-2.5 px-3.5 py-2.5 text-sm ${
                            isActive(pathname, item.path)
                              ? 'bg-blue-50 text-blue-700 font-medium'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                          onClick={() => setMoreOpen(false)}
                        >
                          <span className="text-base">{ICONS[item.id] || '📄'}</span>
                          {item.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 右侧：用户菜单 */}
          <div className="relative flex items-center gap-3">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                <span className="text-white text-xs font-medium">
                  {(session?.user?.name || session?.user?.email || 'U')[0].toUpperCase()}
                </span>
              </div>
              <span className="hidden sm:block max-w-[120px] truncate">
                {session?.user?.name || session?.user?.email}
              </span>
              <span className="hidden md:block rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 font-medium">
                {ROLE_LABELS[role || ''] || role}
              </span>
            </button>
            
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <div className="text-xs text-gray-500">已登录为</div>
                  <div className="text-sm font-medium text-gray-900">{ROLE_LABELS[role || ''] || role}</div>
                  {permissionMode === 'custom' && (
                    <div className="text-xs text-orange-600 mt-1">自定义权限</div>
                  )}
                </div>
                <div className="py-1">
                  <Link
                    href="/dashboard/account"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span>⚙️</span>
                    账号设置
                  </Link>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      signOut({ callbackUrl: '/' })
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <span>🚪</span>
                    退出登录
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* 点击其他地方关闭菜单 */}
      {(moreOpen || menuOpen) && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => {
            setMoreOpen(false)
            setMenuOpen(false)
          }} 
        />
      )}
    </nav>
  )
}
