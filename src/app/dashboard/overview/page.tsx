import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export default async function OverviewPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (role !== 'viewer' && role !== 'admin') {
    return (
      <div className="text-center py-12 text-gray-500">
        此页面仅面向只读角色，当前角色：{role}
      </div>
    )
  }

  const [productCount, tiktokSyncCount, scriptCount, taskStats] = await Promise.all([
    prisma.product.count(),
    prisma.tiktokSync.count(),
    prisma.viralScript.count(),
    prisma.trainingTask.groupBy({
      by: ['status'],
      _count: { id: true },
    }),
  ])

  const taskByStatus = Object.fromEntries(taskStats.map((t) => [t.status, t._count.id]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">只读概览</h1>
        <p className="text-gray-600">产品概况、达人合作进度、脚本训练情况（仅查看）</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <h2 className="text-sm font-medium text-gray-500">产品概况</h2>
          <div className="mt-2 text-2xl font-bold text-gray-900">{productCount}</div>
          <div className="mt-1 text-sm text-gray-500">产品总数</div>
          <div className="mt-2 text-sm text-gray-600">{tiktokSyncCount} 个 TikTok SKU 已同步</div>
          {role === 'admin' && (
            <Link href="/dashboard/products" className="mt-3 inline-block text-sm text-primary-600 hover:underline">
              进入产品列表
            </Link>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <h2 className="text-sm font-medium text-gray-500">脚本训练情况</h2>
          <div className="mt-2 text-2xl font-bold text-gray-900">{scriptCount}</div>
          <div className="mt-1 text-sm text-gray-500">爆款脚本数</div>
          <div className="mt-3 space-y-1 text-sm text-gray-600">
            <div>待办：{taskByStatus.todo ?? 0}</div>
            <div>进行中：{taskByStatus.in_progress ?? 0}</div>
            <div>已提交：{taskByStatus.submitted ?? 0}</div>
            <div>已完成：{taskByStatus.done ?? 0}</div>
          </div>
          {role === 'admin' && (
            <Link href="/dashboard/scripts" className="mt-3 inline-block text-sm text-primary-600 hover:underline">
              进入脚本拆解
            </Link>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <h2 className="text-sm font-medium text-gray-500">达人合作进度</h2>
          <div className="mt-2 text-sm text-gray-600">合作与建联数据汇总（只读）</div>
          <div className="mt-3 text-sm text-gray-500">可在「达人建联」模块查看详情</div>
          {role === 'admin' && (
            <Link href="/dashboard/influencers" className="mt-3 inline-block text-sm text-primary-600 hover:underline">
              进入达人建联
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
