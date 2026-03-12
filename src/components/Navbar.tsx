'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'

const baseNavItems = [
  { name: '产品列表', href: '/dashboard/products', icon: '📦' },
  { name: 'TikTok 同步', href: '/dashboard/tiktok-sync', icon: '🔄' },
  { name: '价格对账', href: '/dashboard/price-check', icon: '💰' },
]

const canSeeScripts = (role?: string) => role === 'admin' || role === 'operator' || role === 'editor' || role === 'advertiser'
const canSeeSettings = (role?: string) => role === 'admin'
const canSeeUsers = (role?: string) => role === 'admin'

export default function Navbar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = (session?.user as any)?.role as string | undefined

  const navItems = [
    ...baseNavItems,
    ...(canSeeScripts(role) ? [{ name: '脚本拆解', href: '/dashboard/scripts', icon: '✂️' }] : []),
    ...(canSeeUsers(role) ? [{ name: '用户管理', href: '/dashboard/users', icon: '👥' }] : []),
    ...(canSeeSettings(role) ? [{ name: '系统设置', href: '/dashboard/settings', icon: '⚙️' }] : []),
  ]

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/dashboard" className="text-xl font-bold text-gray-900">
              假发管理系统
            </Link>
            <div className="ml-10 flex items-baseline space-x-4">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === item.href
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="mr-1">{item.icon}</span>
                  {item.name}
                </Link>
              ))}
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center">
            <span className="text-sm text-gray-700 mr-4">
              {session?.user?.name || session?.user?.email}
              <span className="ml-2 px-2 py-1 text-xs bg-gray-100 rounded">
                {(session?.user as any)?.role}
              </span>
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
            >
              退出登录
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
