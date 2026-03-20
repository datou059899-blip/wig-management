'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { getNavItemsForRole, ROLE_LABELS } from '@/lib/permissions'
import { useState } from 'react'

const SITE_NAME = 'Sunnymay Hair'

export default function Navbar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = (session?.user as any)?.role as string | undefined
  const navItems = getNavItemsForRole(role)
  const [menuOpen, setMenuOpen] = useState(false)
  const [logoLoaded, setLogoLoaded] = useState(false)
  const [logoError, setLogoError] = useState(false)

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo + 站点名称 */}
          <div className="flex items-center min-w-0">
            <Link href="/dashboard" className="flex items-center gap-2 text-gray-900">
              <img
                src="/logo.png"
                alt=""
                className="h-8 w-auto max-w-[120px] object-contain hidden sm:block"
                style={{
                  visibility: logoError ? 'hidden' : logoLoaded ? 'visible' : 'hidden',
                }}
                onLoad={() => setLogoLoaded(true)}
                onError={() => setLogoError(true)}
              />
              <span className="text-xl font-bold">{SITE_NAME}</span>
            </Link>
            {/* 移动端：单行横向滚动 tab；桌面端保持原样 */}
            <div className="ml-3 sm:ml-10 min-w-0 flex-1">
              <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto sm:overflow-visible">
                <div className="flex flex-nowrap items-center gap-2 sm:gap-4 whitespace-nowrap">
                  {navItems.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`shrink-0 px-3 py-2 rounded-md text-sm font-medium ${
                        pathname === item.href
                          ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-600'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span className="mr-1 hidden sm:inline">{item.icon}</span>
                      {item.name}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* User Menu */}
          <div className="relative flex items-center">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              <span className="max-w-[160px] truncate">
                {session?.user?.name || session?.user?.email}
              </span>
              <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                {ROLE_LABELS[role || ''] || role}
              </span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-11 w-48 rounded-lg border border-gray-200 bg-white shadow-lg text-sm">
                <div className="px-3 py-2 border-b border-gray-100 text-xs text-gray-500">
                  已登录为 {ROLE_LABELS[role || ''] || role}
                </div>
                <Link
                  href="/dashboard/account"
                  className="block px-3 py-2 hover:bg-gray-50 text-gray-700"
                  onClick={() => setMenuOpen(false)}
                >
                  修改密码
                </Link>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    signOut({ callbackUrl: '/' })
                  }}
                  className="block w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-50"
                >
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
