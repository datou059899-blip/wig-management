'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { getNavItemsForRole, MORE_MENU_ITEMS, ROLE_LABELS } from '@/lib/permissions'
import { useState } from 'react'

const SITE_NAME = 'Sunnymay'
const SITE_SUBTITLE = '运营工作台'

// 判断是否为当前页面（支持路径前缀匹配）
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
  const roleNavItems = getNavItemsForRole(role)
  
  // 获取更多菜单项（系统模块）
  const moreMenuItems = MORE_MENU_ITEMS.filter(item => 
    roleNavItems.some(nav => nav.href === item.href)
  )
  
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo + 品牌名 + 副标题 */}
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
            
            {/* 垂直分隔线 */}
            <div className="hidden sm:block h-8 w-px bg-gray-200 mx-1"></div>
            
            {/* 导航菜单 */}
            <div className="hidden lg:flex items-center gap-0.5 ml-2">
              {/* 业务导航 */}
              {roleNavItems.filter(item => 
                !MORE_MENU_ITEMS.some(more => more.href === item.href)
              ).map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
                    isActive(pathname, item.href)
                      ? 'text-primary-700 bg-primary-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <span className="mr-1.5">{item.icon}</span>
                  {item.name}
                </Link>
              ))}
              
              {/* 更多下拉菜单 */}
              {moreMenuItems.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setMoreOpen(!moreOpen)}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 flex items-center gap-1 ${
                      moreMenuItems.some(item => isActive(pathname, item.href))
                        ? 'text-primary-700 bg-primary-50'
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
                      {moreMenuItems.map((item) => (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={`flex items-center gap-2.5 px-3.5 py-2.5 text-sm ${
                            isActive(pathname, item.href)
                              ? 'bg-primary-50 text-primary-700 font-medium'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                          onClick={() => setMoreOpen(false)}
                        >
                          <span className="text-base">{item.icon}</span>
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
            {/* 移动端菜单按钮 */}
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className="lg:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            
            <div className="h-6 w-px bg-gray-200 hidden sm:block"></div>
            
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                <span className="text-white text-xs font-medium">
                  {(session?.user?.name || session?.user?.email || 'U')[0].toUpperCase()}
                </span>
              </div>
              <span className="hidden sm:block max-w-[120px] truncate">
                {session?.user?.name || session?.user?.email}
              </span>
              <span className="hidden md:block rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700 font-medium">
                {ROLE_LABELS[role || ''] || role}
              </span>
            </button>
            
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <div className="text-xs text-gray-500">已登录为</div>
                  <div className="text-sm font-medium text-gray-900">{ROLE_LABELS[role || ''] || role}</div>
                </div>
                <div className="py-1">
                  <Link
                    href="/dashboard/account"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    账号设置
                  </Link>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      signOut({ callbackUrl: '/' })
                    }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    退出登录
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* 点击其他地方关闭更多菜单 */}
      {moreOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setMoreOpen(false)} 
        />
      )}
    </nav>
  )
}
