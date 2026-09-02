import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDefaultRedirectForRole } from '@/lib/permissions'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const userRole = (session?.user as any)?.role
  
  // /dashboard 只作为后台入口分流，不再维护第二套 admin 首页 UI
  if (userRole === 'admin' || userRole === 'boss') {
    redirect('/dashboard/workbench')
  }

  if (userRole) {
    redirect(getDefaultRedirectForRole(userRole))
  }
  
  redirect('/dashboard/workbench')
}
