'use client'

import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

// 角色类型
type Role = 'admin' | 'operator' | 'influencer_operator' | 'editor' | 'optimizer' | 'viewer'

const roleLabels: Record<Role, string> = {
  admin: '管理员',
  operator: '产品运营',
  influencer_operator: '达人运营',
  editor: '剪辑',
  optimizer: '投手',
  viewer: '只读/老板',
}

// 统计卡片组件
function StatCard({ 
  title, 
  value, 
  subtitle, 
  href, 
  color = 'blue',
  icon 
}: { 
  title: string
  value: string | number
  subtitle?: string
  href: string
  color?: 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'pink' | 'cyan'
  icon?: React.ReactNode
}) {
  const colorClasses = {
    blue: 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-blue-500/25',
    green: 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-emerald-500/25',
    orange: 'bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-orange-500/25',
    purple: 'bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-purple-500/25',
    red: 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-rose-500/25',
    pink: 'bg-gradient-to-br from-pink-500 to-pink-600 text-white shadow-pink-500/25',
    cyan: 'bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-cyan-500/25',
  }

  return (
    <Link 
      href={href}
      className="group block p-6 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-xl transition-all duration-200"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
          {subtitle && (
            <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${colorClasses[color]}`}>
            {icon}
          </div>
        )}
      </div>
    </Link>
  )
}

// 进度条组件
function ProgressBar({ 
  label, 
  value, 
  total, 
  color = 'blue' 
}: { 
  label: string
  value: number
  total: number
  color?: 'blue' | 'green' | 'orange' | 'purple'
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    orange: 'bg-orange-500',
    purple: 'bg-purple-500',
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-900">{value}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div 
          className={`h-full ${colorClasses[color]} rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

// ============ 产品运营 Dashboard ============
function ProductOperatorDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [productsRes, opportunitiesRes] = await Promise.all([
          fetch('/api/products?pageSize=1000'),
          fetch('/api/product-opportunities'),
        ])
        const products = await productsRes.json()
        const opportunities = await opportunitiesRes.json()

        const productList = products.products || []
        
        const workflowStats = {
          待收集: 0,
          已收集: 0,
          已拿货: 0,
          已打样: 0,
          已确认主推: 0,
          已建联达人: 0,
          已有脚本: 0,
          已出片: 0,
        }

        const getStage = (p: any) => {
          if (p.postedAt) return '已出片'
          if (p.scriptReadyAt) return '已有脚本'
          if (p.outreachLinkedAt) return '已建联达人'
          if (p.mainConfirmedAt) return '已确认主推'
          if (p.sampleSentAt) return '已打样'
          if (p.pickedUpAt) return '已拿货'
          if (p.collectedAt) return '已收集'
          return '待收集'
        }

        productList.forEach((p: any) => {
          const stage = getStage(p)
          if (workflowStats[stage as keyof typeof workflowStats] !== undefined) {
            workflowStats[stage as keyof typeof workflowStats]++
          }
        })

        const needsOutreach = productList.filter((p: any) => 
          p.mainConfirmedAt && !p.outreachLinkedAt
        ).length

        const needsScript = productList.filter((p: any) => 
          p.outreachLinkedAt && !p.scriptReadyAt
        ).length

        const opportunitiesList = opportunities.opportunities || []
        const urgentOpportunities = opportunitiesList.filter((o: any) => 
          o.status === '建议马上补'
        ).length

        setStats({
          workflowStats,
          needsOutreach,
          needsScript,
          urgentOpportunities,
          totalProducts: productList.length,
          totalOpportunities: opportunitiesList.length,
        })
      } catch (error) {
        console.error('获取数据失败:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  const s = stats!

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">产品运营中心</h1>
        <p className="mt-1 text-slate-500">跟进产品推进状态，管理选品更新，把握主推款节奏</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="产品总数"
          value={s.totalProducts}
          subtitle="全部产品"
          href="/dashboard/products"
          color="blue"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />
        <StatCard
          title="选品机会"
          value={s.totalOpportunities}
          subtitle="待处理"
          href="/dashboard/opportunities"
          color="purple"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
        <StatCard
          title="待建联达人"
          value={s.needsOutreach}
          subtitle="主推款"
          href="/dashboard/products?needsOutreach=1"
          color="orange"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
        <StatCard
          title="建议马上补"
          value={s.urgentOpportunities}
          subtitle="紧急"
          href="/dashboard/opportunities?status=建议马上补"
          color="red"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
      </div>

      {/* 产品推进状态 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-900">产品推进状态</h2>
          <Link href="/dashboard/products" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            查看全部 →
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(s.workflowStats).map(([stage, count]) => (
            <Link
              key={stage}
              href={`/dashboard/products?workflow=${stage}`}
              className="p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <div className="text-sm text-slate-500">{stage}</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{String(count)}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* 快捷操作 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link 
          href="/dashboard/products"
          className="flex items-center gap-4 p-6 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl text-white hover:shadow-lg hover:shadow-blue-500/25 transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div>
            <div className="font-semibold">产品列表</div>
            <div className="text-sm text-blue-100">管理全部产品</div>
          </div>
        </Link>

        <Link 
          href="/dashboard/opportunities"
          className="flex items-center gap-4 p-6 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl text-white hover:shadow-lg hover:shadow-purple-500/25 transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold">选品更新池</div>
            <div className="text-sm text-purple-100">发现新机会</div>
          </div>
        </Link>

        <Link 
          href="/dashboard/influencers"
          className="flex items-center gap-4 p-6 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl text-white hover:shadow-lg hover:shadow-orange-500/25 transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold">达人建联</div>
            <div className="text-sm text-orange-100">管理合作关系</div>
          </div>
        </Link>
      </div>
    </div>
  )
}

// ============ 达人运营 Dashboard ============
function InfluencerOperatorDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/influencers')
        const data = await res.json()
        
        const influencers = data.influencers || []
        
        const statusStats = {
          to_outreach: 0,
          contacted: 0,
          sample_sent: 0,
          in_negotiation: 0,
          cooperation: 0,
          paused: 0,
        }

        const levelStats = {
          normal: 0,
          key: 0,
          deep: 0,
        }

        const pendingReply = influencers.filter((i: any) => 
          i.status === 'contacted' && !i.lastFollowUpAt
        ).length

        const samplePending = influencers.filter((i: any) => 
          i.status === 'sample_sent'
        ).length

        const deepCooperation = influencers.filter((i: any) => 
          i.cooperationLevel === 'deep'
        ).length

        influencers.forEach((i: any) => {
          if (statusStats[i.status as keyof typeof statusStats] !== undefined) {
            statusStats[i.status as keyof typeof statusStats]++
          }
          if (levelStats[i.cooperationLevel as keyof typeof levelStats] !== undefined) {
            levelStats[i.cooperationLevel as keyof typeof levelStats]++
          }
        })

        setStats({
          total: influencers.length,
          pendingReply,
          samplePending,
          deepCooperation,
          statusStats,
          levelStats,
        })
      } catch (error) {
        console.error('获取数据失败:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  const s = stats!

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">达人建联中心</h1>
        <p className="mt-1 text-slate-500">管理达人合作进度，跟进寄样、谈判和深度合作</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="达人总数"
          value={s.total}
          href="/dashboard/influencers"
          color="blue"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
        <StatCard
          title="待回复"
          value={s.pendingReply}
          href="/dashboard/influencers?pendingReply=1"
          color="orange"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          }
        />
        <StatCard
          title="已寄样待推进"
          value={s.samplePending}
          href="/dashboard/influencers?status=sample_sent"
          color="purple"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />
        <StatCard
          title="深度合作"
          value={s.deepCooperation}
          href="/dashboard/influencers?level=deep"
          color="green"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-6">合作状态分布</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Object.entries(s.statusStats).map(([status, count]) => {
            const labels: Record<string, string> = {
              to_outreach: '待联系',
              contacted: '已联系',
              sample_sent: '已寄样',
              in_negotiation: '谈判中',
              cooperation: '合作中',
              paused: '已暂停',
            }
            return (
              <Link
                key={status}
                href={`/dashboard/influencers?status=${status}`}
                className="p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors text-center"
              >
                <div className="text-sm text-slate-500">{labels[status]}</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{String(count)}</div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============ 剪辑 Dashboard ============
function EditorDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [scriptsRes, tasksRes] = await Promise.all([
          fetch('/api/scripts'),
          fetch('/api/training-tasks'),
        ])
        const scriptsData = await scriptsRes.json()
        const tasksData = await tasksRes.json()

        const scripts = scriptsData.scripts || []
        const tasks = tasksData.tasks || []

        const myTasks = tasks.filter((t: any) => t.status === 'todo' || t.status === 'in_progress')
        const pendingSubmit = tasks.filter((t: any) => t.status === 'submitted').length
        const completed = tasks.filter((t: any) => t.status === 'done').length
        const needReview = tasks.filter((t: any) => t.status === 'review').length

        setStats({
          totalScripts: scripts.length,
          myTasks: myTasks.length,
          pendingSubmit,
          completed,
          needReview,
          tasks,
        })
      } catch (error) {
        console.error('获取数据失败:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  const s = stats!

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">剪辑工作台</h1>
        <p className="mt-1 text-slate-500">完成脚本拆解、练习任务和视频剪辑，持续提升内容质量</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="待办任务"
          value={s.myTasks}
          href="/dashboard/scripts?filter=my-tasks"
          color="blue"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <StatCard
          title="待提交"
          value={s.pendingSubmit}
          href="/dashboard/scripts?filter=my-tasks&status=submitted"
          color="orange"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          }
        />
        <StatCard
          title="已完成"
          value={s.completed}
          href="/dashboard/scripts?filter=my-tasks&status=done"
          color="green"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="脚本库"
          value={s.totalScripts}
          href="/dashboard/scripts"
          color="purple"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link 
          href="/dashboard/scripts"
          className="flex items-center gap-4 p-6 bg-gradient-to-br from-violet-500 to-violet-600 rounded-2xl text-white hover:shadow-lg hover:shadow-violet-500/25 transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold">脚本拆解</div>
            <div className="text-sm text-violet-100">学习爆款脚本</div>
          </div>
        </Link>

        <Link 
          href="/dashboard/scripts?filter=my-tasks"
          className="flex items-center gap-4 p-6 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl text-white hover:shadow-lg hover:shadow-blue-500/25 transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <div className="font-semibold">我的任务</div>
            <div className="text-sm text-blue-100">查看待办事项</div>
          </div>
        </Link>
      </div>
    </div>
  )
}

// ============ 投手 Dashboard ============
function OptimizerDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [productsRes, perfRes] = await Promise.all([
          fetch('/api/products?pageSize=1000'),
          fetch('/api/performance/summary'),
        ])
        const products = await productsRes.json()
        const perf = await perfRes.json()

        const productList = products.products || []
        
        const exchangeRate = 7.2
        const goodToScale = productList.filter((p: any) => {
          const effectivePrice = p.discountPriceUsd ?? p.priceUsd ?? 0
          const costUsd = (p.costCny || 0) * exchangeRate
          const profit = effectivePrice - costUsd - (p.firstLegLogisticsCostUsd || 0) - (p.lastLegLogisticsCostUsd || 0)
          const margin = effectivePrice > 0 ? (profit / effectivePrice) * 100 : 0
          return margin >= 20 && (p.stock || 0) >= 10
        })

        const lowProfit = productList.filter((p: any) => {
          const effectivePrice = p.discountPriceUsd ?? p.priceUsd ?? 0
          const costUsd = (p.costCny || 0) * exchangeRate
          const profit = effectivePrice - costUsd - (p.firstLegLogisticsCostUsd || 0) - (p.lastLegLogisticsCostUsd || 0)
          const margin = effectivePrice > 0 ? (profit / effectivePrice) * 100 : 0
          return margin < 20
        })

        const lowStock = productList.filter((p: any) => (p.stock || 0) < 10)

        setStats({
          totalProducts: productList.length,
          goodToScale: goodToScale.length,
          lowProfit: lowProfit.length,
          lowStock: lowStock.length,
          perf: perf.summary || {},
        })
      } catch (error) {
        console.error('获取数据失败:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  const s = stats!

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">投放分析中心</h1>
        <p className="mt-1 text-slate-500">分析投放效果，优化广告策略，提升 ROI</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="可投放产品"
          value={s.goodToScale}
          subtitle="毛利≥20%"
          href="/dashboard/products?filter=scalable"
          color="green"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="低毛利预警"
          value={s.lowProfit}
          href="/dashboard/products?warning=profit"
          color="orange"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
        <StatCard
          title="库存预警"
          value={s.lowStock}
          subtitle="库存<10"
          href="/dashboard/products?warning=stock"
          color="red"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />
        <StatCard
          title="产品总数"
          value={s.totalProducts}
          href="/dashboard/products"
          color="blue"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link 
          href="/dashboard/performance"
          className="flex items-center gap-4 p-6 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl text-white hover:shadow-lg hover:shadow-emerald-500/25 transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold">经营数据</div>
            <div className="text-sm text-emerald-100">查看投放效果</div>
          </div>
        </Link>

        <Link 
          href="/dashboard/products"
          className="flex items-center gap-4 p-6 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl text-white hover:shadow-lg hover:shadow-blue-500/25 transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div>
            <div className="font-semibold">产品列表</div>
            <div className="text-sm text-blue-100">管理投放商品</div>
          </div>
        </Link>
      </div>
    </div>
  )
}

// ============ 管理员/老板 Dashboard ============
function AdminDashboard() {
  return <ProductOperatorDashboard />
}

// ============ 只读/老板视图 Dashboard ============
function ViewerDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [productsRes, influencersRes, scriptsRes] = await Promise.all([
          fetch('/api/products?pageSize=1000'),
          fetch('/api/influencers'),
          fetch('/api/scripts'),
        ])
        const products = await productsRes.json()
        const influencers = await influencersRes.json()
        const scripts = await scriptsRes.json()

        setStats({
          totalProducts: products.products?.length || 0,
          totalInfluencers: influencers.influencers?.length || 0,
          totalScripts: scripts.scripts?.length || 0,
        })
      } catch (error) {
        console.error('获取数据失败:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">业务数据概览</h1>
        <p className="mt-1 text-slate-500">快速了解整体业务进展和数据指标</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="产品总数"
          value={stats?.totalProducts || 0}
          href="/dashboard/products"
          color="blue"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />
        <StatCard
          title="达人总数"
          value={stats?.totalInfluencers || 0}
          href="/dashboard/influencers"
          color="purple"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
        <StatCard
          title="脚本总数"
          value={stats?.totalScripts || 0}
          href="/dashboard/scripts"
          color="green"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link 
          href="/dashboard/products"
          className="flex items-center gap-4 p-6 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-slate-900">产品概况</div>
            <div className="text-sm text-slate-500">查看产品列表和推进状态</div>
          </div>
        </Link>

        <Link 
          href="/dashboard/influencers"
          className="flex items-center gap-4 p-6 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-slate-900">达人合作概况</div>
            <div className="text-sm text-slate-500">查看达人合作进展</div>
          </div>
        </Link>

        <Link 
          href="/dashboard/performance"
          className="flex items-center gap-4 p-6 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-slate-900">经营数据</div>
            <div className="text-sm text-slate-500">查看销售和投放数据</div>
          </div>
        </Link>
      </div>
    </div>
  )
}

// ============ 主组件：根据角色渲染不同 Dashboard ============
export function RoleBasedDashboard() {
  const { data: session } = useSession()
  const userRole = (session?.user as any)?.role as Role

  switch (userRole) {
    case 'operator':
      return <ProductOperatorDashboard />
    case 'influencer_operator':
      return <InfluencerOperatorDashboard />
    case 'editor':
      return <EditorDashboard />
    case 'optimizer':
      return <OptimizerDashboard />
    case 'admin':
      return <AdminDashboard />
    case 'viewer':
      return <ViewerDashboard />
    default:
      return <AdminDashboard />
  }
}

export { roleLabels }
