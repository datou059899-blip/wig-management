'use client'

import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { hasPagePermission, PAGE_PERMISSIONS } from '@/lib/pagePermissions'

// 路径到页面ID的映射
const PATH_TO_PAGE_ID: Record<string, string> = {
  '/dashboard/workbench': 'workbench',
  '/dashboard/overview': 'overview',
  '/dashboard/products': 'products',
  '/dashboard/products/opportunities': 'productOpportunities',
  '/dashboard/influencers': 'influencers',
  '/dashboard/scripts': 'scripts',
  '/dashboard/viral-videos': 'viralVideos',
  '/dashboard/video-metrics': 'videoMetrics',
  '/dashboard/performance': 'performance',
  '/dashboard/tiktok-sync': 'tiktokSync',
  '/dashboard/price-check': 'priceCheck',
  '/dashboard/users': 'users',
  '/dashboard/settings': 'settings',
  '/dashboard/account': 'workbench', // 账号设置使用工作台权限
}

export function PageGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    if (!session) return

    const role = (session.user as any)?.role as string
    const permissionMode = (session.user as any)?.permissionMode as string
    const allowedPages = (session.user as any)?.allowedPages as string

    // 获取当前页面ID
    let pageId = PATH_TO_PAGE_ID[pathname]
    
    // 如果没有精确匹配，尝试前缀匹配
    if (!pageId) {
      for (const [path, id] of Object.entries(PATH_TO_PAGE_ID)) {
        if (pathname.startsWith(path)) {
          pageId = id
          break
        }
      }
    }

    // 如果找不到页面ID或者是账号设置页面，允许访问
    if (!pageId || pathname === '/dashboard/account') {
      return
    }

    // 检查权限
    const hasPermission = hasPagePermission(
      role,
      permissionMode,
      allowedPages,
      pageId as any
    )

    if (!hasPermission) {
      // 无权限，重定向到工作台
      router.replace('/dashboard/workbench')
    }
  }, [session, status, pathname, router])

  return <>{children}</>
}
