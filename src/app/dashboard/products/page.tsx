'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

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
  const { data: session } = useSession()
  const userRole = (session?.user as any)?.role
  const canEdit = userRole === 'admin' || userRole === 'operator'
  
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<'all' | 'missing' | 'price' | 'profit' | 'stock' | 'scale'>('all')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState('desc')
  const [view, setView] = useState<'operator' | 'advertiser'>('operator')

  const handleFieldChange = (id: string, field: keyof Product, value: any) => {
    setProducts(prev =>
      prev.map(p => (p.id === id ? { ...p, [field]: value } : p)),
    )
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
    if (isMissing(p)) return { label: '优先补全信息', hint: '补图片/卖点/成本/售价' }
    if (isPriceAbnormal(p)) return { label: '核对价格异常', hint: '检查同步价与标价' }
    if (isLowProfit(p)) return { label: '提升毛利', hint: '调折扣/物流/佣金/广告' }
    if (isLowStock(p)) return { label: '处理断货风险', hint: `库存低于阈值` }
    if (isScalable(p)) return { label: '可继续投放', hint: '关注放量与素材' }
    return { label: '常规维护', hint: '持续监控' }
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

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">假发商品仓 · 运营驾驶舱</h1>
          <p className="text-gray-600 mt-1">
            面向运营、投手和老板，把所有假发 SKU 摆在同一张桌子上：一眼看出今日异常商品、待处理事项和适合继续投放的重点款。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView('operator')}
            className={`px-4 py-2 rounded-lg ${view === 'operator' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            运营视图
          </button>
          <button
            onClick={() => setView('advertiser')}
            className={`px-4 py-2 rounded-lg ${view === 'advertiser' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            投手视图
          </button>
        </div>
      </div>

      {/* 顶部统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <div className="text-sm text-gray-600">产品总数</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{totalCount}</div>
          <div className="mt-1 text-xs text-gray-500">用于全局管理与盘点</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <div className="text-sm text-gray-600">缺信息</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{missingCount}</div>
          <div className="mt-1 text-xs text-gray-500">先补齐关键字段再投放</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <div className="text-sm text-gray-600">价格异常</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{priceAbnormalCount}</div>
          <div className="mt-1 text-xs text-gray-500">TikTok 同步价偏差 ≥ 20%</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <div className="text-sm text-gray-600">低毛利</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{lowProfitCount}</div>
          <div className="mt-1 text-xs text-gray-500">优先调整费用与折扣价</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <div className="text-sm text-gray-600">库存预警</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{lowStockCount}</div>
          <div className="mt-1 text-xs text-gray-500">避免断货影响投放</div>
        </div>
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

          <div className="flex flex-wrap gap-3">
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
          </div>
        </div>
      </div>

      {/* 产品列表 */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">暂无产品数据</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">产品</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">分类</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">成本(CNY)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">头程物流(USD)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">尾程物流(USD)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">折扣价(USD)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">达人佣金(USD)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">广告费用(USD)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">TikTok 价格</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">毛利率</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">库存</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">状态/异常</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">最近同步</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">接下来做什么</th>
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

                  return (
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
                    <td className="px-3 py-1.5 text-[11px] text-gray-700">{category}</td>
                    {/* 成本价，可编辑 */}
                    <td className="px-3 py-1.5">
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
                    {/* 头程物流成本，可编辑 */}
                    <td className="px-3 py-1.5">
                      {canEdit ? (
                        <input
                          type="number"
                          className="w-20 px-2 py-1 border rounded text-xs"
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
                        />
                      ) : (
                        <>${product.firstLegLogisticsCostUsd.toFixed(2)}</>
                      )}
                    </td>

                    {/* 尾程物流成本，可编辑 */}
                    <td className="px-3 py-1.5">
                      {canEdit ? (
                        <input
                          type="number"
                          className="w-20 px-2 py-1 border rounded text-xs"
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
                        />
                      ) : (
                        <>${product.lastLegLogisticsCostUsd.toFixed(2)}</>
                      )}
                    </td>

                    {/* 折扣价，可编辑（为空则用标价参与毛利计算） */}
                    <td className="px-3 py-1.5">
                      {canEdit ? (
                        <input
                          type="number"
                          className="w-20 px-2 py-1 border rounded text-xs"
                          value={product.discountPriceUsd ?? ''}
                          onChange={(e) =>
                            handleFieldChange(
                              product.id,
                              'discountPriceUsd',
                              e.target.value === '' ? null : parseFloat(e.target.value) || 0,
                            )
                          }
                          onBlur={(e) =>
                            handleFieldBlur(product.id, {
                              discountPriceUsd:
                                e.target.value === '' ? null : parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      ) : product.discountPriceUsd != null ? (
                        <>${product.discountPriceUsd.toFixed(2)}</>
                      ) : (
                        '-'
                      )}
                    </td>

                    {/* 达人佣金，可编辑 */}
                    <td className="px-3 py-1.5">
                      {canEdit ? (
                        <input
                          type="number"
                          className="w-20 px-2 py-1 border rounded text-xs"
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
                              influencerCommissionUsd: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      ) : (
                        <>${product.influencerCommissionUsd.toFixed(2)}</>
                      )}
                    </td>

                    {/* 广告费用，可编辑 */}
                    <td className="px-3 py-1.5">
                      {canEdit ? (
                        <input
                          type="number"
                          className="w-24 px-2 py-1 border rounded text-sm"
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
                        />
                      ) : (
                        <>${product.adCostUsd.toFixed(2)}</>
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
                  </tr>
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
