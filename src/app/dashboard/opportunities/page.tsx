'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { canEditProducts } from '@/lib/permissions'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyStatePresets } from '@/components/EmptyState'

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
    高: 'badge-danger',
    中: 'badge-warning',
    低: 'badge-gray',
  }
  return <span className={`badge ${colors[priority] || colors['中']}`}>{priority}</span>
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    '建议马上补': 'badge-danger',
    '可观察': 'badge-primary',
    '已转入产品库': 'badge-success',
  }
  return <span className={`badge ${colors[status] || 'badge-gray'}`}>{status}</span>
}

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    '收集': 'badge-purple',
    '拿货': 'badge-warning',
    '打样': 'badge-primary',
    '观察': 'badge-gray',
    '已转入产品库': 'badge-success',
  }
  return <span className={`badge ${colors[action] || colors['观察']}`}>{action}</span>
}

function HeatBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    '高': 'text-red-600 bg-red-50',
    '中': 'text-amber-600 bg-amber-50',
    '低': 'text-gray-500 bg-gray-50',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${colors[level] || colors['中']}`}>
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
        const res = await fetch('/api/product-opportunities', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editTarget.id, ...form }),
        })
        if (res.ok) {
          alert('更新成功')
          setCreateOpen(false)
          fetchOpportunities()
        } else {
          alert('更新失败')
        }
      } else {
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
      const res = await fetch(`/api/product-opportunities?id=${id}`, { method: 'DELETE' })
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

  const totalCount = Object.values(statusCounts).reduce((a, b) => a + b, 0)
  const urgentCount = statusCounts['建议马上补'] || 0
  const observeCount = statusCounts['可观察'] || 0
  const doneCount = statusCounts['已转入产品库'] || 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="选品更新池"
        description="记录建议新增/更新的产品机会，回答「接下来该新增哪些产品」"
        actions={
          canEdit && (
            <button onClick={openCreate} className="btn-primary">
              + 新增机会
            </button>
          )
        }
      />

      {/* 顶部统计 - 橙红系主题 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => setStatusFilter('all')}
          className={`card p-4 text-left transition-all ${statusFilter === 'all' ? 'ring-2 ring-orange-300 border-orange-200' : ''}`}
        >
          <div className="text-xs text-gray-500">全部机会</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{totalCount}</div>
        </button>
        <button
          onClick={() => setStatusFilter('建议马上补')}
          className={`card p-4 text-left border-l-4 border-l-orange-500 transition-all ${statusFilter === '建议马上补' ? 'ring-2 ring-orange-300' : ''}`}
        >
          <div className="text-xs text-gray-500">🔥 建议马上补</div>
          <div className="text-2xl font-bold text-orange-600 mt-1">{urgentCount}</div>
        </button>
        <button
          onClick={() => setStatusFilter('可观察')}
          className={`card p-4 text-left border-l-4 border-l-blue-400 transition-all ${statusFilter === '可观察' ? 'ring-2 ring-blue-300' : ''}`}
        >
          <div className="text-xs text-gray-500">👀 可观察</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{observeCount}</div>
        </button>
        <button
          onClick={() => setStatusFilter('已转入产品库')}
          className={`card p-4 text-left border-l-4 border-l-green-500 transition-all ${statusFilter === '已转入产品库' ? 'ring-2 ring-green-300' : ''}`}
        >
          <div className="text-xs text-gray-500">✅ 已转入产品库</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{doneCount}</div>
        </button>
      </div>

      {/* 筛选工具条 */}
      <div className="filter-bar">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="搜索款式名、类别、来源..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchOpportunities()}
            className="input"
          />
        </div>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="input w-auto">
          {priorityOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button onClick={fetchOpportunities} className="btn-primary">
          搜索
        </button>
      </div>

      {/* 空状态 */}
      {!loading && totalCount === 0 && (
        <div className="card p-8">
          {EmptyStatePresets.noOpportunities(
            canEdit ? (
              <button onClick={openCreate} className="btn-primary">
                添加选品机会
              </button>
            ) : undefined
          )}
        </div>
      )}

      {/* 筛选结果为空 */}
      {!loading && totalCount > 0 && opportunities.length === 0 && (
        <div className="card p-8">
          {EmptyStatePresets.noSearchResults(
            <button onClick={() => { setStatusFilter('all'); setPriorityFilter('all'); setSearch(''); }} className="btn-secondary">
              清除筛选
            </button>
          )}
        </div>
      )}

      {/* 列表 */}
      {!loading && opportunities.length > 0 && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>款式</th>
                <th>类别</th>
                <th>热度</th>
                <th>状态</th>
                <th>建议动作</th>
                <th>优先级</th>
                <th>负责人</th>
                <th>来源说明</th>
                <th>更新时间</th>
                {canEdit && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {opportunities.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="font-medium text-gray-900">{item.name}</div>
                  </td>
                  <td>
                    <div className="text-gray-700">{item.category || '-'}</div>
                    <div className="text-xs text-gray-400">{item.styleType || '-'}</div>
                  </td>
                  <td>
                    <HeatBadge level={item.heatLevel} />
                  </td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>
                    <ActionBadge action={item.suggestedAction} />
                  </td>
                  <td>
                    <PriorityBadge priority={item.priority} />
                  </td>
                  <td className="text-gray-600">{item.assignee || '-'}</td>
                  <td className="max-w-[150px] truncate" title={item.sourceNote || ''}>
                    {item.sourceNote || '-'}
                  </td>
                  <td className="text-gray-400 text-xs">
                    {new Date(item.updatedAt).toLocaleString('zh-CN').slice(0, 16)}
                  </td>
                  {canEdit && (
                    <td>
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(item)} className="text-blue-600 hover:text-blue-800 text-xs">
                          编辑
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800 text-xs">
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

      {/* 选品来源提示 */}
      <div className="card p-4 bg-gradient-to-r from-orange-50 to-amber-50 border-orange-100">
        <div className="flex items-start gap-3">
          <div className="text-xl">💡</div>
          <div>
            <div className="text-sm font-medium text-orange-800">选品来源说明</div>
            <div className="text-xs text-orange-700 mt-1">
              选品机会主要来源于：TikTok 热度分析、竞争对手监测、市场调研、用户反馈等。
              建议优先处理「建议马上补」状态的机会。
            </div>
          </div>
        </div>
      </div>

      {/* 创建/编辑弹窗 */}
      {createOpen && (
        <div className="modal">
          <div className="modal-backdrop" onClick={() => setCreateOpen(false)} />
          <div className="modal-content">
            <div className="modal-header">
              <div className="text-base font-semibold text-gray-900">
                {editTarget ? '编辑选品机会' : '新增选品机会'}
              </div>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">建议款式名 *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                  placeholder="例如：法式刘海bob款"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">类别</label>
                  <input
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="input"
                    placeholder="例如：蕾丝假发"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">款式类型</label>
                  <input
                    value={form.styleType}
                    onChange={(e) => setForm({ ...form, styleType: e.target.value })}
                    className="input"
                    placeholder="例如：bob / 卷发"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">热度等级</label>
                  <select
                    value={form.heatLevel}
                    onChange={(e) => setForm({ ...form, heatLevel: e.target.value })}
                    className="input"
                  >
                    {heatLevelOptions.map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">状态</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="input"
                  >
                    {statusOptions.slice(1).map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">建议动作</label>
                  <select
                    value={form.suggestedAction}
                    onChange={(e) => setForm({ ...form, suggestedAction: e.target.value })}
                    className="input"
                  >
                    {suggestedActionOptions.map((action) => (
                      <option key={action} value={action}>{action}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">优先级</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="input"
                  >
                    <option value="高">高</option>
                    <option value="中">中</option>
                    <option value="低">低</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">负责人</label>
                  <input
                    value={form.assignee}
                    onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                    className="input"
                    placeholder="例如：Yuyuhan"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">来源说明</label>
                <textarea
                  value={form.sourceNote}
                  onChange={(e) => setForm({ ...form, sourceNote: e.target.value })}
                  className="input"
                  placeholder="例如：TikTok热度上升、竞争对手上新"
                  rows={2}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">当前店内相近款</label>
                <input
                  value={form.existingSimilar}
                  onChange={(e) => setForm({ ...form, existingSimilar: e.target.value })}
                  className="input"
                  placeholder="例如：店内已有类似款A"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">差异点</label>
                <textarea
                  value={form.diffPoints}
                  onChange={(e) => setForm({ ...form, diffPoints: e.target.value })}
                  className="input"
                  placeholder="例如：新增配色、长度更长"
                  rows={2}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1.5 block">备注</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="input"
                  placeholder="其他补充说明"
                  rows={2}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setCreateOpen(false)} className="btn-secondary">取消</button>
              <button onClick={handleSubmit} className="btn-primary">{editTarget ? '保存' : '创建'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
