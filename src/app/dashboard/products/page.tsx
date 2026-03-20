'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { canAccessProducts, canEditProducts } from '@/lib/permissions'
import { PageHeader } from '@/components/layout/PageHeader'

interface Product {
  id: string
  name: string
  sku: string
  image: string
  description: string
  material?: string | null
  style?: string | null
  costCny: number
  priceUsd: number
  discountPriceUsd?: number | null
  firstLegLogisticsCostUsd: number
  lastLegLogisticsCostUsd: number
  laceSize?: string | null
  influencerCommissionUsd: number
  adCostUsd: number
  stock: number
  costUsd: number
  effectivePrice: number
  profit: number
  profitMargin: number
  warningStock: boolean
  warningProfit: boolean
  warningMissing: boolean
  tiktokSync: any
}

export default function ProductsPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const userRole = (session?.user as any)?.role
  const canAccess = canAccessProducts(userRole)
  const canEdit = canEditProducts(userRole)

  useEffect(() => {
    if (session !== undefined && !canAccess) {
      router.replace('/dashboard/scripts')
    }
  }, [session, canAccess, router])
  
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<'all' | 'missing' | 'price' | 'profit' | 'stock' | 'scale'>('all')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState('desc')
  const [view, setView] = useState<'operator' | 'advertiser'>('operator')
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('compact')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleFieldChange = (id: string, field: keyof Product, value: any) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
  }

  const handleFieldBlur = async (id: string, payload: Record<string, any>) => {
    if (!canEdit) return
    try {
      await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...payload }),
      })
      // 更新后重新拉一遍，确保和后端计算保持一致
      fetchProducts()
    } catch (error) {
      console.error('更新产品失败:', error)
    }
  }

  useEffect(() => {
    fetchProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sortBy, sortOrder])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      params.set('sortBy', sortBy)
      params.set('sortOrder', sortOrder)
      // 用于驾驶舱筛选/统计，尽量一次拉全（避免顶部卡片只统计 20 条）
      params.set('pageSize', '1000')
      
      const res = await fetch(`/api/products?${params}`)
      const data = await res.json()
      if (res.ok) {
        setProducts(data.products || [])
      }
    } catch (error) {
      console.error('获取产品失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const stockThreshold = 10
  const priceAbnormalThreshold = 0.2

  const isMissing = (p: Product) => !!p.warningMissing
  const isLowProfit = (p: Product) => !!p.warningProfit
  const isLowStock = (p: Product) => !!p.warningStock

  const isPriceAbnormal = (p: Product) => {
    const synced = p.tiktokSync?.priceUsd
    const base = p.priceUsd || 0
    if (!synced || base <= 0) return false
    const diffRatio = Math.abs(synced - base) / base
    return diffRatio >= priceAbnormalThreshold
  }

  const isScalable = (p: Product) => {
    return !isMissing(p) && !isLowProfit(p) && !isLowStock(p) && !!p.tiktokSync
  }

  const filteredProducts = products.filter(p => {
    if (quickFilter === 'missing') return isMissing(p)
    if (quickFilter === 'price') return isPriceAbnormal(p)
    if (quickFilter === 'profit') return isLowProfit(p)
    if (quickFilter === 'stock') return isLowStock(p)
    if (quickFilter === 'scale') return isScalable(p)
    return true
  })

  const totalCount = products.length
  const missingCount = products.filter(isMissing).length
  const priceAbnormalCount = products.filter(isPriceAbnormal).length
  const lowProfitCount = products.filter(isLowProfit).length
  const lowStockCount = products.filter(isLowStock).length
  const scalableCount = products.filter(isScalable).length

  const formatTime = (value: any) => {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleString()
  }

  const Tag = ({ color, children }: { color: 'red' | 'orange' | 'yellow' | 'green' | 'gray'; children: any }) => {
    const map: any = {
      red: 'bg-red-100 text-red-700',
      orange: 'bg-orange-100 text-orange-700',
      yellow: 'bg-yellow-100 text-yellow-700',
      green: 'bg-green-100 text-green-700',
      gray: 'bg-gray-100 text-gray-700',
    }
    return <span className={`px-2 py-1 text-xs rounded ${map[color]}`}>{children}</span>
  }

  const getNextAction = (p: Product) => {
    if (isMissing(p)) return { label: '补全信息' as const }
    if (isPriceAbnormal(p)) return { label: '检查价格' as const }
    if (isLowStock(p)) return { label: '补库存' as const }
    if (isLowProfit(p)) return { label: '关注毛利' as const }
    if (isScalable(p)) return { label: '可继续投放' as const }
    return { label: '常规关注' as const }
  }

  const Chip = ({
    id,
    label,
    count,
  }: {
    id: 'all' | 'missing' | 'price' | 'profit' | 'stock' | 'scale'
    label: string
    count: number
  }) => {
    const active = quickFilter === id
    return (
      <button
        onClick={() => setQuickFilter(id)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition ${
          active ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
        }`}
      >
        <span>{label}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
          {count}
        </span>
      </button>
    )
  }

  if (session === undefined || !canAccess) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        {session === undefined ? '加载中...' : '无权限访问产品列表，正在跳转...'}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="假发商品仓 · 运营驾驶舱"
        description="把所有假发 SKU 摆在同一张桌子上，一眼看出今日异常、待处理事项和适合继续投放的重点款。"
        actions={
        <div className="flex gap-2">
          <button
            onClick={() => setView('operator')}
              className={`px-4 py-2 rounded-lg text-sm ${
                view === 'operator'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            运营视图
          </button>
          <button
            onClick={() => setView('advertiser')}
              className={`px-4 py-2 rounded-lg text-sm ${
                view === 'advertiser'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            投手视图
          </button>
        </div>
        }
      />

      {/* 顶部统计卡片（可点击筛选） */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => setQuickFilter('all')}
          className={`text-left bg-white rounded-xl shadow-sm border p-3 transition ${
            quickFilter === 'all' ? 'border-primary-500 ring-1 ring-primary-100' : 'border-gray-100'
          }`}
        >
          <div className="text-xs text-gray-500">产品总数</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{totalCount}</div>
          <div className="mt-1 text-xs text-gray-500">点击查看全部商品</div>
        </button>
        <button
          type="button"
          onClick={() => setQuickFilter('missing')}
          className={`text-left bg-white rounded-xl shadow-sm border p-3 transition ${
            quickFilter === 'missing' ? 'border-yellow-500 ring-1 ring-yellow-100' : 'border-gray-100'
          }`}
        >
          <div className="text-xs text-gray-500">缺信息</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{missingCount}</div>
          <div className="mt-1 text-xs text-yellow-700">先补齐图片、卖点、成本、售价</div>
        </button>
        <button
          type="button"
          onClick={() => setQuickFilter('price')}
          className={`text-left bg-white rounded-xl shadow-sm border p-3 transition ${
            quickFilter === 'price' ? 'border-red-500 ring-1 ring-red-100' : 'border-gray-100'
          }`}
        >
          <div className="text-xs text-gray-500">价格异常</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{priceAbnormalCount}</div>
          <div className="mt-1 text-xs text-red-700">优先核对同步价与标价</div>
        </button>
        <button
          type="button"
          onClick={() => setQuickFilter('profit')}
          className={`text-left bg-white rounded-xl shadow-sm border p-3 transition ${
            quickFilter === 'profit' ? 'border-orange-500 ring-1 ring-orange-100' : 'border-gray-100'
          }`}
        >
          <div className="text-xs text-gray-500">低毛利</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{lowProfitCount}</div>
          <div className="mt-1 text-xs text-orange-700">检查折扣、物流、佣金与广告</div>
        </button>
        <button
          type="button"
          onClick={() => setQuickFilter('stock')}
          className={`text-left bg-white rounded-xl shadow-sm border p-3 transition ${
            quickFilter === 'stock' ? 'border-red-500 ring-1 ring-red-100' : 'border-gray-100'
          }`}
        >
          <div className="text-xs text-gray-500">库存预警</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{lowStockCount}</div>
          <div className="mt-1 text-xs text-red-700">优先处理即将断货的 SKU</div>
        </button>
      </div>

      {/* 筛选 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip id="all" label="全部商品" count={totalCount} />
            <Chip id="missing" label="缺信息" count={missingCount} />
            <Chip id="price" label="价格异常" count={priceAbnormalCount} />
            <Chip id="profit" label="低毛利" count={lowProfitCount} />
            <Chip id="stock" label="库存预警" count={lowStockCount} />
            <Chip id="scale" label="可继续投放" count={scalableCount} />
          </div>

          <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="搜索产品名称或 SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [by, order] = e.target.value.split('-')
              setSortBy(by)
              setSortOrder(order)
            }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            <option value="createdAt-desc">最新创建</option>
            <option value="createdAt-asc">最旧创建</option>
            <option value="profit-desc">毛利从高到低</option>
            <option value="profit-asc">毛利从低到高</option>
            <option value="stock-asc">库存从少到多</option>
            <option value="stock-desc">库存从多到少</option>
          </select>
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <span>视图</span>
              <button
                type="button"
                onClick={() => setViewMode('compact')}
                className={`px-2 py-1 rounded-md border ${
                  viewMode === 'compact'
                    ? 'bg-primary-50 border-primary-400 text-primary-700'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                精简
              </button>
              <button
                type="button"
                onClick={() => setViewMode('detailed')}
                className={`px-2 py-1 rounded-md border ${
                  viewMode === 'detailed'
                    ? 'bg-primary-50 border-primary-400 text-primary-700'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                详细
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 产品列表 */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          当前条件下没有商品，试试清空搜索或切换上方筛选标签。
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="max-h-[640px] overflow-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">产品</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">成本(CNY)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">TikTok 价格</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">毛利率</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">库存</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">状态/异常</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">最近同步</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">下一步动作</th>
                  {viewMode === 'detailed' && (
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">经营详情</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredProducts.map((product) => {
                  const abnormal = isPriceAbnormal(product)
                  const scalable = isScalable(product)
                  const action = getNextAction(product)
                  const category = product.style || product.material || '-'
                  const tiktokPrice = product.tiktokSync?.priceUsd
                  const tiktokDiscount = product.tiktokSync?.originalPriceUsd
                  const syncTime = product.tiktokSync?.syncedAt
                  const costDetail = `分类：${category}\n头程物流: $${product.firstLegLogisticsCostUsd.toFixed(
                    2,
                  )}\n尾程物流: $${product.lastLegLogisticsCostUsd.toFixed(
                    2,
                  )}\n达人佣金: $${product.influencerCommissionUsd.toFixed(
                    2,
                  )}\n广告费用: $${product.adCostUsd.toFixed(
                    2,
                  )}\n折扣价(USD): ${
                    product.discountPriceUsd != null ? `$${product.discountPriceUsd.toFixed(2)}` : '未设置'
                  }`

                  return (
                  <>
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                            {product.image && (
                          <img src={product.image} alt="" className="w-7 h-7 rounded object-cover" />
                            )}
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate max-w-[220px]">
                              {product.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-[11px] text-gray-500">{product.sku || '-'}</td>
                    {/* 成本价，可编辑，详细结构放在 tooltip */}
                    <td className="px-3 py-1.5" title={costDetail}>
                      {canEdit ? (
                        <input
                          type="number"
                          className="w-20 px-2 py-0.5 border rounded text-[11px]"
                          value={product.costCny ?? 0}
                          onChange={(e) =>
                            handleFieldChange(product.id, 'costCny', parseFloat(e.target.value) || 0)
                          }
                          onBlur={(e) =>
                            handleFieldBlur(product.id, {
                              costCny: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      ) : (
                        <>¥{product.costCny.toFixed(2)}</>
                      )}
                        </td>
                    {/* TikTok 价格&原价，用于看平台侧售价情况 */}
                    <td className="px-3 py-1.5">
                      <div className="space-y-0.5">
                        <div className={abnormal ? 'text-red-700 font-medium' : 'text-gray-900'}>
                          {tiktokPrice ? `$${tiktokPrice.toFixed(2)}` : '-'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {tiktokDiscount ? `原价 $${tiktokDiscount.toFixed(2)}` : '—'}
                        </div>
                      </div>
                        </td>
                    {/* 毛利率（后端按折扣价+各项成本计算） */}
                    <td className="px-3 py-1.5">
                          <span className={product.profitMargin >= 20 ? 'text-green-600' : 'text-red-600'}>
                            {product.profitMargin.toFixed(1)}%
                          </span>
                        </td>
                    {/* 库存 */}
                    <td className="px-3 py-2 text-sm">
                          <span className={product.warningStock ? 'text-red-600 font-medium' : ''}>
                            {product.stock}
                          </span>
                        </td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        {product.warningMissing && <Tag color="yellow">缺信息</Tag>}
                        {abnormal && <Tag color="red">价格异常</Tag>}
                        {product.warningProfit && <Tag color="orange">低毛利</Tag>}
                        {product.warningStock && <Tag color="red">库存不足</Tag>}
                        {scalable && <Tag color="green">可投放</Tag>}
                        {!product.warningMissing && !abnormal && !product.warningProfit && !product.warningStock && !scalable && (
                          <Tag color="gray">正常</Tag>
                            )}
                          </div>
                        </td>
                    <td className="px-3 py-1.5 text-[11px] text-gray-600 whitespace-nowrap">
                      {formatTime(syncTime)}
                        </td>
                    <td className="px-3 py-1.5 align-middle w-32">
                      <span className="text-xs text-gray-800 truncate block">
                        {action.label}
                      </span>
                        </td>
                    {viewMode === 'detailed' && (
                      <td className="px-3 py-1.5 text-xs">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId((prev) => (prev === product.id ? null : product.id))
                          }
                          className="px-2 py-1 rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        >
                          {expandedId === product.id ? '收起' : '详情'}
                        </button>
                        </td>
                    )}
                  </tr>
                  {viewMode === 'detailed' && expandedId === product.id && (
                    <tr>
                      <td
                        className="px-4 py-3 bg-gray-50"
                        colSpan={viewMode === 'detailed' ? 10 : 9}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                          <div className="rounded-lg border border-gray-200 bg-white p-3">
                            <div className="font-semibold text-gray-900 mb-2">成本与物流</div>
                            <div className="space-y-2">
                              <div>
                                <div className="text-[11px] text-gray-600 mb-0.5">成本价 (CNY)</div>
                                <input
                                  type="number"
                                  value={product.costCny ?? 0}
                                  onChange={(e) =>
                                    handleFieldChange(
                                      product.id,
                                      'costCny',
                                      parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  onBlur={(e) =>
                                    handleFieldBlur(product.id, {
                                      costCny: parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  disabled={!canEdit}
                                  className="w-full px-2 py-1 border border-gray-300 rounded"
                                />
                              </div>
                              <div>
                                <div className="text-[11px] text-gray-600 mb-0.5">
                                  头程物流 (USD)
                                </div>
                                <input
                                  type="number"
                                  value={product.firstLegLogisticsCostUsd ?? 0}
                                  onChange={(e) =>
                                    handleFieldChange(
                                      product.id,
                                      'firstLegLogisticsCostUsd',
                                      parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  onBlur={(e) =>
                                    handleFieldBlur(product.id, {
                                      firstLegLogisticsCostUsd: parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  disabled={!canEdit}
                                  className="w-full px-2 py-1 border border-gray-300 rounded"
                                />
                              </div>
                              <div>
                                <div className="text-[11px] text-gray-600 mb-0.5">
                                  尾程物流 (USD)
                                </div>
                                <input
                                  type="number"
                                  value={product.lastLegLogisticsCostUsd ?? 0}
                                  onChange={(e) =>
                                    handleFieldChange(
                                      product.id,
                                      'lastLegLogisticsCostUsd',
                                      parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  onBlur={(e) =>
                                    handleFieldBlur(product.id, {
                                      lastLegLogisticsCostUsd: parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  disabled={!canEdit}
                                  className="w-full px-2 py-1 border border-gray-300 rounded"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border border-gray-200 bg-white p-3">
                            <div className="font-semibold text-gray-900 mb-2">售价与折扣</div>
                            <div className="space-y-2">
                              <div>
                                <div className="text-[11px] text-gray-600 mb-0.5">
                                  折扣价 (USD)
                                </div>
                                <input
                                  type="number"
                                  value={product.discountPriceUsd ?? ''}
                                  onChange={(e) =>
                                    handleFieldChange(
                                      product.id,
                                      'discountPriceUsd',
                                      e.target.value === ''
                                        ? null
                                        : parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  onBlur={(e) =>
                                    handleFieldBlur(product.id, {
                                      discountPriceUsd:
                                        e.target.value === ''
                                          ? null
                                          : parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  disabled={!canEdit}
                                  className="w-full px-2 py-1 border border-gray-300 rounded"
                                  placeholder="为空则使用标价参与毛利计算"
                                />
                              </div>
                              <div className="text-[11px] text-gray-500">
                                当前标价：${product.priceUsd.toFixed(2)} ·
                                TikTok 价格：{tiktokPrice ? `$${tiktokPrice.toFixed(2)}` : '-'}
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border border-gray-200 bg-white p-3">
                            <div className="font-semibold text-gray-900 mb-2">达人与广告成本</div>
                            <div className="space-y-2">
                              <div>
                                <div className="text-[11px] text-gray-600 mb-0.5">
                                  达人佣金 (USD)
                                </div>
                                <input
                                  type="number"
                                  value={product.influencerCommissionUsd ?? 0}
                                  onChange={(e) =>
                                    handleFieldChange(
                                      product.id,
                                      'influencerCommissionUsd',
                                      parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  onBlur={(e) =>
                                    handleFieldBlur(product.id, {
                                      influencerCommissionUsd:
                                        parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  disabled={!canEdit}
                                  className="w-full px-2 py-1 border border-gray-300 rounded"
                                />
                              </div>
                              <div>
                                <div className="text-[11px] text-gray-600 mb-0.5">
                                  广告费用 (USD)
                                </div>
                                <input
                                  type="number"
                                  value={product.adCostUsd ?? 0}
                                  onChange={(e) =>
                                    handleFieldChange(
                                      product.id,
                                      'adCostUsd',
                                      parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  onBlur={(e) =>
                                    handleFieldBlur(product.id, {
                                      adCostUsd: parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  disabled={!canEdit}
                                  className="w-full px-2 py-1 border border-gray-300 rounded"
                                />
                              </div>
                              <div className="text-[11px] text-gray-500">
                                这些成本会直接影响产品页和价格体检中的毛利率计算。
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
