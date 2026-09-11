import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Sidebar from '@/components/Sidebar'
import { PageGuard } from '@/components/PageGuard'
import { ToastProvider } from '@/components/ToastProvider'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect('/login')
  }

  // 检查是否需要强制修改密码
  if ((session.user as any).requirePasswordChange) {
    redirect('/change-password')
  }

  return (
    <div className="dashboard-shell min-h-screen bg-[#f7f8fa] text-sm text-gray-900 relative">
      <Sidebar />
      <ToastProvider>
        <main className="lg:ml-[200px] min-h-screen pt-14 lg:pt-0 relative">
          <div className="p-4 lg:p-6 xl:p-8">
            <PageGuard>{children}</PageGuard>
          </div>
        </main>
      </ToastProvider>
    </div>
  )
}
