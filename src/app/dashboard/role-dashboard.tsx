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

const roleDescriptions: Record<Role, string> = {
  admin: '全面掌握业务进展，监控各项指标',
  operator: '管理产品推进，协调达人合作',
  influencer_operator: '负责达人建联和合作推进',
  editor: '完成脚本拆解和视频剪辑任务',
  optimizer: '分析投放效果，优化广告策略',
  viewer: '查看业务数据，了解整体进展',
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
        
        // 产品推进状态统计
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

        // 待办统计
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
    return <div className="text-center py-12 text-gray-500">加载中...</div>
  }

  const s = stats!

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl shadow-lg overflow-hidden">
        <div className="p-6 md:p-8 text-white">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="text-sm text-primary-100">
                {roleLabels.operator} · 工作台
              </div>
              <h1 className="mt-2 text-2xl md:text-3xl font-bold">
                产品运营中心
              </h1>
              <p className="mt-2 text-primary-100 max-w-2xl">
                跟进产品推进状态，管理选品更新，把握主推款节奏
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/dashboard/products"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white text-primary-700 hover:bg-primary-50 transition"
                >
                  📦 产品列表
                </Link>
                <Link
                  href="/dashboard/opportunities"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-400 transition"
                >
                  🎯 选品更新池
                </Link>
                <Link
                  href="/dashboard/influencers"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-primary-300 text-white hover:bg-primary-400 transition"
                >
                  🤝 达人建联
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full md:w-[280px]">
              <div className="rounded-xl bg-white/10 p-4">
                <div className="text-xs text-primary-100">产品总数</div>
                <div className="mt-1 text-2xl font-bold">{s.totalProducts}</div>
              </div>
              <div className="rounded-xl bg-white/10 p-4">
                <div className="text-xs text-primary-100">选品机会</div>
                <div className="mt-1 text-2xl font-bold">{s.totalOpportunities}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 产品推进状态 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">📊 产品推进状态</h2>
          <Link href="/dashboard/products" className="text-sm text-primary-700 hover:underline">
            查看详情 →
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {Object.entries(s.workflowStats).map(([stage, count]) => (
            <Link
              key={stage}
              href={`/dashboard/products?workflow=${stage}`}
              className="rounded-xl border border-gray-100 p-3 hover:bg-gray-50 transition text-center"
            >
              <div className="text-xs text-gray-500">{stage}</div>
              <div className="mt-1 text-xl font-bold text-gray-900">{String(count)}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* 待办事项 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900">⚡ 今日待办</h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/dashboard/products?needsOutreach=1" className="group rounded-xl border border-orange-100 p-4 hover:bg-orange-50 transition">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎯</span>
              <div className="font-medium text-gray-900">主推款待建联达人</div>
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-orange-600">{s.needsOutreach}</div>
              <div className="text-sm text-orange-700 group-hover:underline">去建联</div>
            </div>
          </Link>

          <Link href="/dashboard/products?needsScript=1" className="group rounded-xl border border-purple-100 p-4 hover:bg-purple-50 transition">
            <div className="flex items-center gap-2">
              <span className="text-xl">✂️</span>
              <div className="font-medium text-gray-900">达人已建联待脚本</div>
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-purple-600">{s.needsScript}</div>
              <div className="text-sm text-purple-700 group-hover:underline">去安排</div>
            </div>
          </Link>

          <Link href="/dashboard/opportunities?status=建议马上补" className="group rounded-xl border border-red-100 p-4 hover:bg-red-50 transition">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔥</span>
              <div className="font-medium text-gray-900">建议马上补</div>
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-red-600">{s.urgentOpportunities}</div>
              <div className="text-sm text-red-700 group-hover:underline">去处理</div>
            </div>
          </Link>
        </div>
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

        // 待跟进：已发送未回复
        const pendingReply = influencers.filter((i: any) => 
          i.status === 'contacted' && !i.lastFollowUpAt
        ).length

        // 已寄样待推进
        const samplePending = influencers.filter((i: any) => 
          i.status === 'sample_sent'
        ).length

        // 合作中待确认
        const cooperationPending = influencers.filter((i: any) => 
          i.status === 'in_negotiation'
        ).length

        // 深度合作
        const deepCooperation = influencers.filter((i: any) => 
          i.cooperationLevel === 'deep'
        ).length

        // 今日需跟进
        const todayFollowUp = influencers.filter((i: any) => {
          if (!i.nextFollowUpAt) return false
          const nextDate = new Date(i.nextFollowUpAt)
          const today = new Date()
          return nextDate <= today
        }).length

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
          cooperationPending,
          deepCooperation,
          todayFollowUp,
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
    return <div className="text-center py-12 text-gray-500">加载中...</div>
  }

  const s = stats!

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-r from-pink-500 to-rose-600 rounded-2xl shadow-lg overflow-hidden">
        <div className="p-6 md:p-8 text-white">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="text-sm text-pink-100">
                {roleLabels.influencer_operator} · 工作台
              </div>
              <h1 className="mt-2 text-2xl md:text-3xl font-bold">
                达人建联中心
              </h1>
              <p className="mt-2 text-pink-100 max-w-2xl">
                管理达人合作进度，跟进寄样、谈判和深度合作
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/dashboard/influencers"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white text-pink-700 hover:bg-pink-50 transition"
                >
                  🤝 达人列表
                </Link>
                <Link
                  href="/dashboard/products"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-pink-500 text-white hover:bg-pink-400 transition"
                >
                  📦 产品列表
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full md:w-[280px]">
              <div className="rounded-xl bg-white/10 p-4">
                <div className="text-xs text-pink-100">达人总数</div>
                <div className="mt-1 text-2xl font-bold">{s.total}</div>
              </div>
              <div className="rounded-xl bg-white/10 p-4">
                <div className="text-xs text-pink-100">深度合作</div>
                <div className="mt-1 text-2xl font-bold">{s.deepCooperation}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 待跟进事项 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900">⚡ 今日待跟进</h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link href="/dashboard/influencers?status=to_outreach" className="group rounded-xl border border-gray-100 p-4 hover:bg-gray-50 transition">
            <div className="text-sm text-gray-600">待联系</div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-gray-900">{s.statusStats.to_outreach}</div>
              <div className="text-sm text-primary-700 group-hover:underline">去联系</div>
            </div>
          </Link>

          <Link href="/dashboard/influencers?pendingReply=1" className="group rounded-xl border border-orange-100 p-4 hover:bg-orange-50 transition">
            <div className="text-sm text-gray-600">已发送未回复</div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-orange-600">{s.pendingReply}</div>
              <div className="text-sm text-orange-700 group-hover:underline">去跟进</div>
            </div>
          </Link>

          <Link href="/dashboard/influencers?status=sample_sent" className="group rounded-xl border border-purple-100 p-4 hover:bg-purple-50 transition">
            <div className="text-sm text-gray-600">已寄样待推进</div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-purple-600">{s.samplePending}</div>
              <div className="text-sm text-purple-700 group-hover:underline">去推进</div>
            </div>
          </Link>

          <Link href="/dashboard/influencers?level=deep" className="group rounded-xl border border-red-100 p-4 hover:bg-red-50 transition">
            <div className="text-sm text-gray-600">深度合作达人</div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-red-600">{s.deepCooperation}</div>
              <div className="text-sm text-red-700 group-hover:underline">查看</div>
            </div>
          </Link>
        </div>
      </div>

      {/* 合作状态概览 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900">📊 合作状态分布</h2>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-3">
          {Object.entries(s.statusStats).map(([status, count]) => (
            <Link
              key={status}
              href={`/dashboard/influencers?status=${status}`}
              className="rounded-xl border border-gray-100 p-3 hover:bg-gray-50 transition text-center"
            >
              <div className="text-xs text-gray-500">
                {status === 'to_outreach' && '待联系'}
                {status === 'contacted' && '已联系'}
                {status === 'sample_sent' && '已寄样'}
                {status === 'in_negotiation' && '谈判中'}
                {status === 'cooperation' && '合作中'}
                {status === 'paused' && '已暂停'}
              </div>
              <div className="mt-1 text-xl font-bold text-gray-900">{String(count)}</div>
            </Link>
          ))}
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

        // 我的任务统计
        const myTasks = tasks.filter((t: any) => t.status === 'todo' || t.status === 'in_progress')
        
        // 待提交
        const pendingSubmit = tasks.filter((t: any) => t.status === 'submitted').length
        
        // 已完成
        const completed = tasks.filter((t: any) => t.status === 'done').length

        // 待复盘
        const needReview = tasks.filter((t: any) => t.status === 'review').length

        // 脚本统计
        const totalScripts = scripts.length

        setStats({
          totalScripts,
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
    return <div className="text-center py-12 text-gray-500">加载中...</div>
  }

  const s = stats!

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl shadow-lg overflow-hidden">
        <div className="p-6 md:p-8 text-white">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="text-sm text-violet-100">
                {roleLabels.editor} · 工作台
              </div>
              <h1 className="mt-2 text-2xl md:text-3xl font-bold">
                剪辑工作台
              </h1>
              <p className="mt-2 text-violet-100 max-w-2xl">
                完成脚本拆解、练习任务和视频剪辑，持续提升内容质量
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/dashboard/scripts"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white text-violet-700 hover:bg-violet-50 transition"
                >
                  ✂️ 脚本拆解
                </Link>
                <Link
                  href="/dashboard/scripts?filter=my-tasks"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-violet-500 text-white hover:bg-violet-400 transition"
                >
                  📋 我的任务
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full md:w-[280px]">
              <div className="rounded-xl bg-white/10 p-4">
                <div className="text-xs text-violet-100">待办任务</div>
                <div className="mt-1 text-2xl font-bold">{s.myTasks}</div>
              </div>
              <div className="rounded-xl bg-white/10 p-4">
                <div className="text-xs text-violet-100">已完成后复盘</div>
                <div className="mt-1 text-2xl font-bold">{s.completed}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 今日任务 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900">⚡ 今日任务</h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link href="/dashboard/scripts?filter=my-tasks&status=todo" className="group rounded-xl border border-gray-100 p-4 hover:bg-gray-50 transition">
            <div className="text-sm text-gray-600">待开始</div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-gray-900">
                {s.tasks.filter((t: any) => t.status === 'todo').length}
              </div>
              <div className="text-sm text-primary-700 group-hover:underline">开始</div>
            </div>
          </Link>

          <Link href="/dashboard/scripts?filter=my-tasks&status=in_progress" className="group rounded-xl border border-blue-100 p-4 hover:bg-blue-50 transition">
            <div className="text-sm text-gray-600">进行中</div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-blue-600">
                {s.tasks.filter((t: any) => t.status === 'in_progress').length}
              </div>
              <div className="text-sm text-blue-700 group-hover:underline">继续</div>
            </div>
          </Link>

          <Link href="/dashboard/scripts?filter=my-tasks&status=submitted" className="group rounded-xl border border-orange-100 p-4 hover:bg-orange-50 transition">
            <div className="text-sm text-gray-600">待提交</div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-orange-600">{s.pendingSubmit}</div>
              <div className="text-sm text-orange-700 group-hover:underline">提交</div>
            </div>
          </Link>

          <Link href="/dashboard/scripts?filter=my-review" className="group rounded-xl border border-purple-100 p-4 hover:bg-purple-50 transition">
            <div className="text-sm text-gray-600">待复盘</div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-purple-600">{s.needReview}</div>
              <div className="text-sm text-purple-700 group-hover:underline">查看</div>
            </div>
          </Link>
        </div>
      </div>

      {/* 脚本学习 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900">📚 脚本拆解</h2>
        <div className="mt-4">
          <Link href="/dashboard/scripts" className="group flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:bg-gray-50 transition">
            <div>
              <div className="font-medium text-gray-900">热门爆款脚本</div>
              <div className="text-sm text-gray-500">共 {s.totalScripts} 个脚本可供学习</div>
            </div>
            <div className="text-sm text-primary-700 group-hover:underline">进入学习 →</div>
          </Link>
        </div>
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
        
        // 可投放产品
        const exchangeRate = 7.2
        const goodToScale = productList.filter((p: any) => {
          const effectivePrice = p.discountPriceUsd ?? p.priceUsd ?? 0
          const costUsd = (p.costCny || 0) * exchangeRate
          const profit = effectivePrice - costUsd - (p.firstLegLogisticsCostUsd || 0) - (p.lastLegLogisticsCostUsd || 0)
          const margin = effectivePrice > 0 ? (profit / effectivePrice) * 100 : 0
          return margin >= 20 && (p.stock || 0) >= 10
        })

        // 低毛利产品
        const lowProfit = productList.filter((p: any) => {
          const effectivePrice = p.discountPriceUsd ?? p.priceUsd ?? 0
          const costUsd = (p.costCny || 0) * exchangeRate
          const profit = effectivePrice - costUsd - (p.firstLegLogisticsCostUsd || 0) - (p.lastLegLogisticsCostUsd || 0)
          const margin = effectivePrice > 0 ? (profit / effectivePrice) * 100 : 0
          return margin < 20
        })

        // 库存预警
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
    return <div className="text-center py-12 text-gray-500">加载中...</div>
  }

  const s = stats!

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl shadow-lg overflow-hidden">
        <div className="p-6 md:p-8 text-white">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="text-sm text-emerald-100">
                {roleLabels.optimizer} · 工作台
              </div>
              <h1 className="mt-2 text-2xl md:text-3xl font-bold">
                投放分析中心
              </h1>
              <p className="mt-2 text-emerald-100 max-w-2xl">
                分析投放效果，优化广告策略，提升 ROI
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/dashboard/performance"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white text-emerald-700 hover:bg-emerald-50 transition"
                >
                  📈 经营数据
                </Link>
                <Link
                  href="/dashboard/products"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-400 transition"
                >
                  📦 产品列表
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full md:w-[280px]">
              <div className="rounded-xl bg-white/10 p-4">
                <div className="text-xs text-emerald-100">可投放产品</div>
                <div className="mt-1 text-2xl font-bold">{s.goodToScale}</div>
              </div>
              <div className="rounded-xl bg-white/10 p-4">
                <div className="text-xs text-emerald-100">低毛利预警</div>
                <div className="mt-1 text-2xl font-bold">{s.lowProfit}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 投放建议 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900">⚡ 投放建议</h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/dashboard/products?filter=scalable" className="group rounded-xl border border-green-100 p-4 hover:bg-green-50 transition">
            <div className="flex items-center gap-2">
              <span className="text-xl">✅</span>
              <div className="font-medium text-gray-900">可继续投放</div>
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-green-600">{s.goodToScale}</div>
              <div className="text-sm text-green-700 group-hover:underline">查看产品</div>
            </div>
          </Link>

          <Link href="/dashboard/products?warning=profit" className="group rounded-xl border border-orange-100 p-4 hover:bg-orange-50 transition">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              <div className="font-medium text-gray-900">低毛利需调整</div>
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-orange-600">{s.lowProfit}</div>
              <div className="text-sm text-orange-700 group-hover:underline">优化成本</div>
            </div>
          </Link>

          <Link href="/dashboard/products?warning=stock" className="group rounded-xl border border-red-100 p-4 hover:bg-red-50 transition">
            <div className="flex items-center gap-2">
              <span className="text-xl">🚨</span>
              <div className="font-medium text-gray-900">库存预警</div>
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div className="text-2xl font-bold text-red-600">{s.lowStock}</div>
              <div className="text-sm text-red-700 group-hover:underline">及时补货</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

// ============ 管理员/老板 Dashboard ============
function AdminDashboard() {
  return (
    <div className="space-y-6">
      <ProductOperatorDashboard />
    </div>
  )
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
    return <div className="text-center py-12 text-gray-500">加载中...</div>
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 rounded-2xl shadow-lg overflow-hidden">
        <div className="p-6 md:p-8 text-white">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="text-sm text-slate-300">
                {roleLabels.viewer} · 概览
              </div>
              <h1 className="mt-2 text-2xl md:text-3xl font-bold">
                业务数据概览
              </h1>
              <p className="mt-2 text-slate-300 max-w-2xl">
                快速了解整体业务进展和数据指标
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 w-full md:w-[320px]">
              <div className="rounded-xl bg-white/10 p-4">
                <div className="text-xs text-slate-300">产品</div>
                <div className="mt-1 text-2xl font-bold">{stats?.totalProducts || 0}</div>
              </div>
              <div className="rounded-xl bg-white/10 p-4">
                <div className="text-xs text-slate-300">达人</div>
                <div className="mt-1 text-2xl font-bold">{stats?.totalInfluencers || 0}</div>
              </div>
              <div className="rounded-xl bg-white/10 p-4">
                <div className="text-xs text-slate-300">脚本</div>
                <div className="mt-1 text-2xl font-bold">{stats?.totalScripts || 0}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 快速入口 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900">📊 数据详情</h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/dashboard/products" className="group rounded-xl border border-gray-100 p-4 hover:bg-gray-50 transition">
            <div className="font-medium text-gray-900">产品概况</div>
            <div className="text-sm text-gray-500 mt-1">查看产品列表和推进状态</div>
            <div className="mt-2 text-primary-700 group-hover:underline">进入 →</div>
          </Link>

          <Link href="/dashboard/influencers" className="group rounded-xl border border-gray-100 p-4 hover:bg-gray-50 transition">
            <div className="font-medium text-gray-900">达人合作概况</div>
            <div className="text-sm text-gray-500 mt-1">查看达人合作进展</div>
            <div className="mt-2 text-primary-700 group-hover:underline">进入 →</div>
          </Link>

          <Link href="/dashboard/performance" className="group rounded-xl border border-gray-100 p-4 hover:bg-gray-50 transition">
            <div className="font-medium text-gray-900">经营数据</div>
            <div className="text-sm text-gray-500 mt-1">查看销售和投放数据</div>
            <div className="mt-2 text-primary-700 group-hover:underline">进入 →</div>
          </Link>
        </div>
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

export { roleLabels, roleDescriptions }
