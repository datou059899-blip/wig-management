'use client'

import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { findPageIdByPath, hasPagePermission } from '@/lib/pagePermissions'

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
    const pageId = findPageIdByPath(pathname)

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
