'use client'

import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { canAccessPage, findPageIdByPath, getSessionPermissionContext, isDashboardEntryPath } from '@/lib/pagePermissions'

export function PageGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    if (!session) return

    // 获取当前页面ID
    const pageId = findPageIdByPath(pathname)

    // /dashboard 是入口分流页；账号设置按当前策略继续允许
    if (isDashboardEntryPath(pathname) || pathname === '/dashboard/account') {
      return
    }

    // 当前阶段暂不改 unknown route 默认行为
    if (!pageId) {
      return
    }

    // 检查权限
    const hasPermission = canAccessPage(getSessionPermissionContext(session), pageId)

    if (!hasPermission) {
      // 无权限，重定向到工作台
      router.replace('/dashboard/workbench')
    }
  }, [session, status, pathname, router])

  return <>{children}</>
}
