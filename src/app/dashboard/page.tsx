import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDefaultRedirectForRole } from '@/lib/permissions'
import { RoleBasedDashboard } from './role-dashboard'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const userRole = (session?.user as any)?.role
  
  // 非 admin 角色跳转到对应默认页面
  if (userRole && userRole !== 'admin') {
    redirect(getDefaultRedirectForRole(userRole))
  }
  
  // admin 角色使用角色化工作台组件
  return <RoleBasedDashboard />
}
