'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { canEditProducts } from '@/lib/permissions'
import { PageHeader } from '@/components/layout/PageHeader'

type Opportunity = {
  id: string
  name: string
  category: string | null
  styleType: string | null
  heatLevel: string
  sourceNote: string | null
  existingSimilar: string | null
  diffPoints: string | null
  suggestedAction: string
  priority: string
  assignee: string | null
  notes: string | null
  status: string
  productId: string | null
  createdAt: string
  updatedAt: string
}

const statusOptions = [
  { value: 'all', label: '全部' },
  { value: '建议马上补', label: '建议马上补' },
  { value: '可观察', label: '可观察' },
  { value: '已转入产品库', label: '已转入产品库' },
]

const priorityOptions = [
  { value: 'all', label: '全部' },
  { value: '高', label: '高' },
  { value: '中', label: '中' },
  { value: '低', label: '低' },
]

const heatLevelOptions = ['高', '中', '低']
const suggestedActionOptions = ['收集', '拿货', '打样', '观察', '已转入产品库']

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    高: 'bg-red-100 text-red-700 border-red-200',
    中: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    低: 'bg-gray-100 text-gray-700 border-gray-200',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${colors[priority] || colors['中']}`}>
      {priority}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    '建议马上补': 'bg-red-100 text-red-700 border-red-200',
    '可观察': 'bg-blue-100 text-blue-700 border-blue-200',
    '已转入产品库': 'bg-green-100 text-green-700 border-green-200',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${colors[status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
      {status}
    </span>
  )
}

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    '收集': 'bg-purple-100 text-purple-700 border-purple-200',
    '拿货': 'bg-orange-100 text-orange-700 border-orange-200',
    '打样': 'bg-amber-100 text-amber-700 border-amber-200',
    '观察': 'bg-gray-100 text-gray-700 border-gray-200',
    '已转入产品库': 'bg-green-100 text-green-700 border-green-200',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${colors[action] || colors['观察']}`}>
      {action}
    </span>
  )
}

function HeatBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    '高': 'bg-red-50 text-red-600',
    '中': 'bg-yellow-50 text-yellow-600',
    '低': 'bg-gray-50 text-gray-600',
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs ${colors[level] || colors['中']}`}>
      🔥 {level}
    </span>
  )
}

export default function ProductOpportunitiesPage() {
  const { data: session } = useSession()
  const userRole = (session?.user as any)?.role
  const canEdit = canEditProducts(userRole)

  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})

  // 创建弹窗状态
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Opportunity | null>(null)
  const [form, setForm] = useState({
    name: '',
    category: '',
    styleType: '',
    heatLevel: '中',
    sourceNote: '',
    existingSimilar: '',
    diffPoints: '',
    suggestedAction: '观察',
    priority: '中',
    assignee: '',
    notes: '',
    status: '可观察',
  })

  const fetchOpportunities = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (priorityFilter !== 'all') params.set('priority', priorityFilter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/product-opportunities?${params}`)
      const data = await res.json()
      if (res.ok) {
        setOpportunities(data.opportunities || [])
        setStatusCounts(data.statusCounts || {})
      }
    } catch (error) {
      console.error('获取选品机会失败:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOpportunities()
  }, [statusFilter, priorityFilter])

  const resetForm = () => {
    setForm({
      name: '',
      category: '',
      styleType: '',
      heatLevel: '中',
      sourceNote: '',
      existingSimilar: '',
      diffPoints: '',
      suggestedAction: '观察',
      priority: '中',
      assignee: '',
      notes: '',
      status: '可观察',
    })
    setEditTarget(null)
  }

  const openCreate = () => {
    resetForm()
    setCreateOpen(true)
  }

  const openEdit = (item: Opportunity) => {
    setForm({
      name: item.name || '',
      category: item.category || '',
      styleType: item.styleType || '',
      heatLevel: item.heatLevel || '中',
      sourceNote: item.sourceNote || '',
      existingSimilar: item.existingSimilar || '',
      diffPoints: item.diffPoints || '',
      suggestedAction: item.suggestedAction || '观察',
      priority: item.priority || '中',
      assignee: item.assignee || '',
      notes: item.notes || '',
      status: item.status || '可观察',
    })
    setEditTarget(item)
    setCreateOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      alert('请填写建议款式名')
      return
    }

    try {
      if (editTarget) {
        // 更新
        const res = await fetch('/api/product-opportunities', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editTarget.id,
            ...form,
          }),
        })
        if (res.ok) {
          alert('更新成功')
          setCreateOpen(false)
          fetchOpportunities()
        } else {
          alert('更新失败')
        }
      } else {
        // 创建
        const res = await fetch('/api/product-opportunities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (res.ok) {
          alert('创建成功')
          setCreateOpen(false)
          fetchOpportunities()
        } else {
          alert('创建失败')
        }
      }
    } catch (error) {
      console.error('提交失败:', error)
      alert('提交失败')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除这条选品机会吗？')) return
    try {
      const res = await fetch(`/api/product-opportunities?id=${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        alert('删除成功')
        fetchOpportunities()
      } else {
        alert('删除失败')
      }
    } catch (error) {
      console.error('删除失败:', error)
      alert('删除失败')
    }
  }

  const total = opportunities.length
  const urgentCount = statusCounts['建议马上补'] || 0
  const observeCount = statusCounts['可观察'] || 0
  const doneCount = statusCounts['已转入产品库'] || 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="选品更新池"
        description="用于记录建议新增/更新的产品机会，回答「接下来该新增哪些产品、更新哪些款式」。"
        actions={
          canEdit && (
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700"
            >
              + 新增选品机会
            </button>
          )
        }
      />

      {/* 顶部统计 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <button
          onClick={() => setStatusFilter('all')}
          className={`text-left bg-white rounded-xl shadow-sm border p-4 transition ${
            statusFilter === 'all' ? 'border-primary-500 ring-1 ring-primary-100' : 'border-gray-100'
          }`}
        >
          <div className="text-xs text-gray-500">全部机会</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">
            {Object.values(statusCounts).reduce((a, b) => a + b, 0)}
          </div>
        </button>
        <button
          onClick={() => setStatusFilter('建议马上补')}
          className={`text-left bg-white rounded-xl shadow-sm border p-4 transition ${
            statusFilter === '建议马上补' ? 'border-red-500 ring-1 ring-red-100' : 'border-gray-100'
          }`}
        >
          <div className="text-xs text-gray-500">建议马上补</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{urgentCount}</div>
        </button>
        <button
          onClick={() => setStatusFilter('可观察')}
          className={`text-left bg-white rounded-xl shadow-sm border p-4 transition ${
            statusFilter === '可观察' ? 'border-blue-500 ring-1 ring-blue-100' : 'border-gray-100'
          }`}
        >
          <div className="text-xs text-gray-500">可观察</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{observeCount}</div>
        </button>
        <button
          onClick={() => setStatusFilter('已转入产品库')}
          className={`text-left bg-white rounded-xl shadow-sm border p-4 transition ${
            statusFilter === '已转入产品库' ? 'border-green-500 ring-1 ring-green-100' : 'border-gray-100'
          }`}
        >
          <div className="text-xs text-gray-500">已转入产品库</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{doneCount}</div>
        </button>
      </div>

      {/* 筛选 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="搜索款式名、类别、来源..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchOpportunities()}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {priorityOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={fetchOpportunities}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700"
          >
            搜索
          </button>
        </div>
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        ) : opportunities.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {statusFilter === 'all' ? '暂无选品机会，点击上方按钮新增' : '当前筛选条件下没有数据'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">款式</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">类别</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">热度</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">建议动作</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">优先级</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">负责人</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">来源说明</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">相近款</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">差异点</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">更新时间</th>
                  {canEdit && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">操作</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {opportunities.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{item.name}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>{item.category || '-'}</div>
                      <div className="text-xs text-gray-400">{item.styleType || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <HeatBadge level={item.heatLevel} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={item.suggestedAction} />
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={item.priority} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.assignee || '-'}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[150px] truncate" title={item.sourceNote || ''}>
                      {item.sourceNote || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[150px] truncate" title={item.existingSimilar || ''}>
                      {item.existingSimilar || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[150px] truncate" title={item.diffPoints || ''}>
                      {item.diffPoints || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(item.updatedAt).toLocaleString('zh-CN').slice(0, 16)}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEdit(item)}
                            className="text-primary-600 hover:text-primary-800 text-xs"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-red-600 hover:text-red-800 text-xs"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 创建/编辑弹窗 */}
      {createOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setCreateOpen(false)} />
          <div className="absolute inset-0 flex items-start justify-center p-4 overflow-y-auto">
            <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-gray-200">
              <div className="p-4 border-b">
                <div className="text-sm font-semibold text-gray-900">
                  {editTarget ? '编辑选品机会' : '新增选品机会'}
                </div>
              </div>
              <div className="p-4 space-y-4 text-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <div className="text-xs text-gray-600 mb-1">建议款式名 *</div>
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="例如：法式刘海bob款"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">类别</div>
                    <input
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="例如：蕾丝假发"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">款式类型</div>
                    <input
                      value={form.styleType}
                      onChange={(e) => setForm({ ...form, styleType: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="例如：bob / 卷发"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">热度等级</div>
                    <select
                      value={form.heatLevel}
                      onChange={(e) => setForm({ ...form, heatLevel: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      {heatLevelOptions.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">状态</div>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      {statusOptions.slice(1).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">建议动作</div>
                    <select
                      value={form.suggestedAction}
                      onChange={(e) => setForm({ ...form, suggestedAction: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      {suggestedActionOptions.map((action) => (
                        <option key={action} value={action}>
                          {action}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">优先级</div>
                    <select
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="高">高</option>
                      <option value="中">中</option>
                      <option value="低">低</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">负责人</div>
                    <input
                      value={form.assignee}
                      onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="例如：Yuyuhan"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs text-gray-600 mb-1">来源说明</div>
                    <textarea
                      value={form.sourceNote}
                      onChange={(e) => setForm({ ...form, sourceNote: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="例如：TikTok热度上升、竞争对手上新、市场调研"
                      rows={2}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs text-gray-600 mb-1">当前店内相近款</div>
                    <input
                      value={form.existingSimilar}
                      onChange={(e) => setForm({ ...form, existingSimilar: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="例如：店内已有类似款A、类似款B"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs text-gray-600 mb-1">差异点</div>
                    <textarea
                      value={form.diffPoints}
                      onChange={(e) => setForm({ ...form, diffPoints: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="例如：新增配色、长度更长、材质更好"
                      rows={2}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs text-gray-600 mb-1">备注</div>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="其他补充说明"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
              <div className="p-4 border-t bg-gray-50 flex items-center justify-end gap-2">
                <button
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  {editTarget ? '保存' : '创建'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
