'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { canEditProducts } from '@/lib/permissions'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyStatePresets } from '@/components/EmptyState'
import { useToast } from '@/components/ToastProvider'

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
  purchaseOrderItemId: string | null
  createdAt: string
  updatedAt: string
}

type PurchaseDevelopmentLinkStatus = 'NEW_PRODUCT' | 'DIFFERENT_CRAFT' | 'SKU_PENDING'

type PurchaseDevelopmentItem = {
  id: string
  productNameSnapshot: string
  linkStatus: PurchaseDevelopmentLinkStatus
  linkStatusLabel: string
  supplierName: string
  orderedQty: number
  receivedQty: number
  openQty: number
  expectedArrivalDate: string | null
  orderNo: string
  purchaseOrderStatus: string
  productStatus: string
  opportunityId: string | null
  opportunityExists: boolean
  opportunity: Opportunity | null
}

const statusOptions = [
  { value: 'all', label: '全部' },
  { value: 'NEW_PRODUCT', label: '新品待建档' },
  { value: 'DIFFERENT_CRAFT', label: '同名不同工艺' },
  { value: 'SKU_PENDING', label: '待确认SKU' },
]

const legacyStatusOptions = [
  { value: '建议马上补', label: '建议马上补' },
  { value: '可观察', label: '可观察' },
  { value: '已转入产品库', label: '已转入产品库' },
]

const purchaseSourceStatusOptions = [
  { value: '待整理', label: '待整理' },
  { value: '资料整理中', label: '资料整理中' },
  { value: '待确认', label: '待确认' },
  { value: '待建商品', label: '待建商品' },
  { value: '已完成', label: '已完成' },
]
const purchaseSourceStatusValues = purchaseSourceStatusOptions.map((option) => option.value)

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
  const toast = useToast()
  const userRole = (session?.user as any)?.role
  const canEdit = canEditProducts(userRole)

  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [purchaseDevelopmentItems, setPurchaseDevelopmentItems] = useState<PurchaseDevelopmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [purchaseDevelopmentStats, setPurchaseDevelopmentStats] = useState({
    NEW_PRODUCT: 0,
    DIFFERENT_CRAFT: 0,
    SKU_PENDING: 0,
    total: 0,
  })
  const [supplierOptions, setSupplierOptions] = useState<string[]>([])
  const [legacyOpen, setLegacyOpen] = useState(false)
  const [purchaseSource, setPurchaseSource] = useState<PurchaseDevelopmentItem | null>(null)

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
    purchaseOrderItemId: null as string | null,
  })

  const fetchOpportunities = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (priorityFilter !== 'all') params.set('priority', priorityFilter)
      if (supplierFilter !== 'all') params.set('supplier', supplierFilter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/product-opportunities?${params}`)
      const data = await res.json()
      if (res.ok) {
        setOpportunities(data.opportunities || [])
        setPurchaseDevelopmentItems(data.purchaseDevelopmentItems || [])
        setStatusCounts(data.statusCounts || {})
        setPurchaseDevelopmentStats(data.purchaseDevelopmentStats || {
          NEW_PRODUCT: 0,
          DIFFERENT_CRAFT: 0,
          SKU_PENDING: 0,
          total: 0,
        })
        setSupplierOptions(data.supplierOptions || [])
      }
    } catch (error) {
      console.error('获取选品机会失败:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOpportunities()
  }, [statusFilter, priorityFilter, supplierFilter])

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
      purchaseOrderItemId: null,
    })
    setEditTarget(null)
    setPurchaseSource(null)
  }

  const openCreate = () => {
    resetForm()
    setCreateOpen(true)
  }

  const openDevelopmentForm = (item: PurchaseDevelopmentItem) => {
    setPurchaseSource(item)
    if (item.opportunity) {
      openEdit(item.opportunity, item)
      return
    }

    setEditTarget(null)
    setForm({
      name: item.productNameSnapshot || '',
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
      status: '待整理',
      purchaseOrderItemId: item.id,
    })
    setCreateOpen(true)
  }

  const openEdit = (item: Opportunity, source?: PurchaseDevelopmentItem) => {
    setPurchaseSource(source || null)
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
      status: source && !purchaseSourceStatusValues.includes(item.status) ? '待整理' : item.status || (source ? '待整理' : '可观察'),
      purchaseOrderItemId: item.purchaseOrderItemId || null,
    })
    setEditTarget(item)
    setCreateOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('请填写建议款式名')
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
          toast.success('修改已保存')
          setCreateOpen(false)
          fetchOpportunities()
        } else {
          toast.error('更新失败')
        }
      } else {
        const res = await fetch('/api/product-opportunities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (res.ok) {
          toast.success(form.purchaseOrderItemId ? '开发档案已保存' : '独立新品已创建')
          setCreateOpen(false)
          fetchOpportunities()
        } else {
          toast.error('创建失败')
        }
      }
    } catch (error) {
      console.error('提交失败:', error)
      toast.error('提交失败')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除这条选品机会吗？')) return
    try {
      const res = await fetch(`/api/product-opportunities?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('删除成功')
        fetchOpportunities()
      } else {
        toast.error('删除失败')
      }
    } catch (error) {
      console.error('删除失败:', error)
      toast.error('删除失败')
    }
  }

  const totalCount = Object.values(statusCounts).reduce((a, b) => a + b, 0)
  const newProductCount = purchaseDevelopmentStats.NEW_PRODUCT || 0
  const differentCraftCount = purchaseDevelopmentStats.DIFFERENT_CRAFT || 0
  const skuPendingCount = purchaseDevelopmentStats.SKU_PENDING || 0
  const developmentTotalCount = purchaseDevelopmentStats.total || 0

  const formatDate = (value: string | null) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  const getDevelopmentStatusClass = (status: PurchaseDevelopmentLinkStatus) => {
    if (status === 'NEW_PRODUCT') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    if (status === 'DIFFERENT_CRAFT') return 'bg-amber-50 text-amber-700 border-amber-200'
    return 'bg-sky-50 text-sky-700 border-sky-200'
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="新品开发池"
        description="用于管理采购中的新品、同名不同工艺款和待确认 SKU，完成正式商品建档前的整理。"
        actions={
          canEdit && (
            <button onClick={openCreate} className="btn-primary">
              + 新增独立新品
            </button>
          )
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => setStatusFilter('all')}
          className={`card p-4 text-left transition-all ${statusFilter === 'all' ? 'ring-2 ring-orange-300 border-orange-200' : ''}`}
        >
          <div className="text-xs text-gray-500">待处理总数</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{developmentTotalCount}</div>
        </button>
        <button
          onClick={() => setStatusFilter('NEW_PRODUCT')}
          className={`card p-4 text-left border-l-4 border-l-emerald-500 transition-all ${statusFilter === 'NEW_PRODUCT' ? 'ring-2 ring-emerald-300' : ''}`}
        >
          <div className="text-xs text-gray-500">新品待建档</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{newProductCount}</div>
        </button>
        <button
          onClick={() => setStatusFilter('DIFFERENT_CRAFT')}
          className={`card p-4 text-left border-l-4 border-l-amber-500 transition-all ${statusFilter === 'DIFFERENT_CRAFT' ? 'ring-2 ring-amber-300' : ''}`}
        >
          <div className="text-xs text-gray-500">同名不同工艺</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{differentCraftCount}</div>
        </button>
        <button
          onClick={() => setStatusFilter('SKU_PENDING')}
          className={`card p-4 text-left border-l-4 border-l-sky-500 transition-all ${statusFilter === 'SKU_PENDING' ? 'ring-2 ring-sky-300' : ''}`}
        >
          <div className="text-xs text-gray-500">待确认SKU</div>
          <div className="text-2xl font-bold text-sky-600 mt-1">{skuPendingCount}</div>
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
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto">
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="input w-auto">
          <option value="all">全部 Supplier</option>
          {supplierOptions.map((supplier) => (
            <option key={supplier} value={supplier}>{supplier}</option>
          ))}
        </select>
        <button onClick={fetchOpportunities} className="btn-primary">
          搜索
        </button>
      </div>

      {/* 空状态 */}
      {!loading && developmentTotalCount === 0 && purchaseDevelopmentItems.length === 0 && (
        <div className="card p-8">
          <div className="text-center text-gray-500">
            当前没有来自采购明细的新品待建档记录。
          </div>
        </div>
      )}

      {/* 筛选结果为空 */}
      {!loading && developmentTotalCount > 0 && purchaseDevelopmentItems.length === 0 && (
        <div className="card p-8">
          {EmptyStatePresets.noSearchResults(
            <button onClick={() => { setStatusFilter('all'); setSupplierFilter('all'); setSearch(''); }} className="btn-secondary">
              清除筛选
            </button>
          )}
        </div>
      )}

      {!loading && purchaseDevelopmentItems.length > 0 && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>款式名称</th>
                <th>当前状态</th>
                <th>Supplier</th>
                <th>采购数量</th>
                <th>已到货</th>
                <th>未到数量</th>
                <th>预计到货</th>
                <th>来源采购单</th>
                <th>Product状态</th>
                <th>开发档案</th>
                {canEdit && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {purchaseDevelopmentItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="font-medium text-gray-900">{item.productNameSnapshot}</div>
                  </td>
                  <td>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getDevelopmentStatusClass(item.linkStatus)}`}>
                      {item.linkStatusLabel}
                    </span>
                  </td>
                  <td className="text-gray-700">{item.supplierName}</td>
                  <td className="text-gray-700">{item.orderedQty.toLocaleString('zh-CN')}</td>
                  <td className="text-gray-700">{item.receivedQty.toLocaleString('zh-CN')}</td>
                  <td className="font-medium text-gray-900">{item.openQty.toLocaleString('zh-CN')}</td>
                  <td className="text-gray-600">{formatDate(item.expectedArrivalDate)}</td>
                  <td className="text-gray-600">{item.orderNo}</td>
                  <td>
                    <span className="badge badge-gray">{item.productStatus}</span>
                  </td>
                  <td>
                    <span className={`badge ${item.opportunityExists ? 'badge-success' : 'badge-warning'}`}>
                      {item.opportunityExists ? '已建档' : '未建档'}
                    </span>
                    {item.opportunity?.name && (
                      <div className="mt-1 text-xs text-gray-500">{item.opportunity.name}</div>
                    )}
                  </td>
                  {canEdit && (
                    <td>
                      <button onClick={() => openDevelopmentForm(item)} className="text-blue-600 hover:text-blue-800 text-xs">
                        {item.opportunityExists ? '编辑资料' : '完善资料'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card p-4 bg-gradient-to-r from-orange-50 to-amber-50 border-orange-100">
        <div className="flex items-start gap-3">
          <div className="text-xl">💡</div>
          <div>
            <div className="text-sm font-medium text-orange-800">新品开发池规则</div>
            <div className="text-xs text-orange-700 mt-1">
              这里只汇总未关联 Product 且已人工标记为「新品待建档 / 同名不同工艺 / 待确认SKU」的采购明细。
              不按名称自动匹配，不自动创建 Product，也不合并同名款。
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <button
          type="button"
          onClick={() => setLegacyOpen((value) => !value)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="font-medium text-gray-900">旧选品机会记录</span>
          <span className="text-sm text-gray-500">{legacyOpen ? '收起' : `展开（${totalCount}）`}</span>
        </button>

        {legacyOpen && (
          <div className="mt-4">
            {opportunities.length === 0 ? (
              <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">暂无旧选品机会记录。</div>
            ) : (
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
                        <td><div className="font-medium text-gray-900">{item.name}</div></td>
                        <td>
                          <div className="text-gray-700">{item.category || '-'}</div>
                          <div className="text-xs text-gray-400">{item.styleType || '-'}</div>
                        </td>
                        <td><HeatBadge level={item.heatLevel} /></td>
                        <td><StatusBadge status={item.status} /></td>
                        <td><ActionBadge action={item.suggestedAction} /></td>
                        <td><PriorityBadge priority={item.priority} /></td>
                        <td className="text-gray-600">{item.assignee || '-'}</td>
                        <td className="max-w-[150px] truncate" title={item.sourceNote || ''}>{item.sourceNote || '-'}</td>
                        <td className="text-gray-400 text-xs">{new Date(item.updatedAt).toLocaleString('zh-CN').slice(0, 16)}</td>
                        {canEdit && (
                          <td>
                            <div className="flex gap-2">
                              <button onClick={() => openEdit(item)} className="text-blue-600 hover:text-blue-800 text-xs">编辑</button>
                              <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800 text-xs">删除</button>
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
        )}
      </div>

      {/* 创建/编辑弹窗 */}
      {createOpen && (
        <div className="modal">
          <div className="modal-backdrop" onClick={() => setCreateOpen(false)} />
          <div className="modal-content">
            <div className="modal-header">
              <div className="text-base font-semibold text-gray-900">
                {editTarget ? '编辑开发档案' : purchaseSource ? '完善开发档案' : '新增独立新品'}
              </div>
            </div>
            <div className="modal-body space-y-4">
              {purchaseSource && (
                <div className="rounded-lg border border-orange-100 bg-orange-50 p-4">
                  <div className="mb-3 text-sm font-medium text-orange-900">采购来源</div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-orange-600">原始款名</div>
                      <div className="font-medium text-orange-950">{purchaseSource.productNameSnapshot}</div>
                    </div>
                    <div>
                      <div className="text-orange-600">当前状态</div>
                      <div className="font-medium text-orange-950">{purchaseSource.linkStatusLabel}</div>
                    </div>
                    <div>
                      <div className="text-orange-600">Supplier</div>
                      <div className="font-medium text-orange-950">{purchaseSource.supplierName}</div>
                    </div>
                    <div>
                      <div className="text-orange-600">来源采购单</div>
                      <div className="font-medium text-orange-950">{purchaseSource.orderNo}</div>
                    </div>
                    <div>
                      <div className="text-orange-600">采购数量</div>
                      <div className="font-medium text-orange-950">{purchaseSource.orderedQty.toLocaleString('zh-CN')}</div>
                    </div>
                    <div>
                      <div className="text-orange-600">已到 / 未到</div>
                      <div className="font-medium text-orange-950">
                        {purchaseSource.receivedQty.toLocaleString('zh-CN')} / {purchaseSource.openQty.toLocaleString('zh-CN')}
                      </div>
                    </div>
                    <div>
                      <div className="text-orange-600">预计到货</div>
                      <div className="font-medium text-orange-950">{formatDate(purchaseSource.expectedArrivalDate)}</div>
                    </div>
                  </div>
                </div>
              )}
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
                  <label className="text-xs text-gray-600 mb-1.5 block">工艺 / 款式类型</label>
                  <input
                    value={form.styleType}
                    onChange={(e) => setForm({ ...form, styleType: e.target.value })}
                    className="input"
                    placeholder="例如：bob / 卷发"
                  />
                </div>
                {!purchaseSource && (
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
                )}
                <div>
                  <label className="text-xs text-gray-600 mb-1.5 block">状态</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="input"
                  >
                    {(purchaseSource ? purchaseSourceStatusOptions : legacyStatusOptions).map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                {!purchaseSource && (
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
                )}
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
              <button onClick={handleSubmit} className="btn-primary">
                {editTarget ? '保存修改' : purchaseSource ? '保存开发档案' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
