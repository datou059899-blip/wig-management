'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  CompactEmptyState,
  FilterChip,
  FunctionalPremiumScope,
  InteractiveMetric,
  OverflowMenu,
  StickyToolbar,
  primaryActionClassName,
  useDelayedVisibility,
} from '@/components/dashboard/FunctionalPremium'

type DayPoint = {
  date: string // YYYY-MM-DD
  gmv: number
  orders: number
  adsCost: number
}

type ProductPerf = {
  id: string
  name: string
  sku: string
  productLine: string
  owner: string
  status: 'normal' | 'watch' | 'pause'
  rangeGmv: number
  rangeOrders: number
  rangeAdsCost: number
  lastUpdatedAt: string
}

type DataStatus = {
  shopLastSyncAt: string | null
  adsLastSyncAt: string | null
  lastImportedBy: string | null
  state: 'ok' | 'stale' | 'error'
}

export default function PerformancePage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [trend, setTrend] = useState<DayPoint[]>([])
  const [rows, setRows] = useState<ProductPerf[]>([])
  const [dataStatus, setDataStatus] = useState<DataStatus>({
    shopLastSyncAt: null,
    adsLastSyncAt: null,
    lastImportedBy: null,
    state: 'stale',
  })

  const [message, setMessage] = useState<{ type: 'success' | 'error' | '' ; text: string }>({
    type: '',
    text: '',
  })

  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d'>('today')
  const [search, setSearch] = useState('')
  const [productLine, setProductLine] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'normal' | 'watch' | 'pause'>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [loading, setLoading] = useState(false)
  const showLoading = useDelayedVisibility(loading)
  const [importingAds, setImportingAds] = useState(false)
  const adsInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (message.type) {
      const t = setTimeout(() => setMessage({ type: '', text: '' }), 3000)
      return () => clearTimeout(t)
    }
  }, [message])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
    }
  }, [status, router])
  useEffect(() => {
    if (status === 'authenticated') {
      void loadSummary(dateRange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, dateRange])

  const today = trend[trend.length - 1] || { date: '', gmv: 0, orders: 0, adsCost: 0 }
  const yesterday = trend[trend.length - 2] || { date: '', gmv: 0, orders: 0, adsCost: 0 }
  const hasTrend = trend.length > 0

  const todayRoas = today.adsCost > 0 ? today.gmv / today.adsCost : 0
  const yesterdayRoas = yesterday.adsCost > 0 ? yesterday.gmv / yesterday.adsCost : 0

  const delta = {
    gmv: today.gmv - yesterday.gmv,
    orders: today.orders - yesterday.orders,
    adsCost: today.adsCost - yesterday.adsCost,
    roas: todayRoas - yesterdayRoas,
  }

  const owners = Array.from(new Set(rows.map((r) => r.owner)))
  const productLines = Array.from(new Set(rows.map((r) => r.productLine)))

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (search && !`${r.name} ${r.sku}`.toLowerCase().includes(search.toLowerCase())) {
        return false
      }
      if (productLine !== 'all' && r.productLine !== productLine) return false
      if (ownerFilter !== 'all' && r.owner !== ownerFilter) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      return true
    })
  }, [rows, search, productLine, statusFilter, ownerFilter])

  const getRoas = (row: ProductPerf) =>
    row.rangeAdsCost > 0 ? row.rangeGmv / row.rangeAdsCost : 0

  const getSuggestion = (row: ProductPerf) => {
    const roas = getRoas(row)
    if (row.rangeAdsCost === 0 && row.rangeGmv === 0) return '待投放'
    if (roas >= 3 && row.rangeOrders >= 5) return '可继续投放'
    if (roas < 1 && row.rangeAdsCost > 0) return '关注转化'
    if (row.rangeAdsCost > 0 && row.rangeGmv === 0) return '关注花费'
    if (row.status === 'pause') return '检查库存'
    return '常规关注'
  }

  const parseDateString = (value: unknown): string | null => {
    if (!value) return null
    if (value instanceof Date) return value.toISOString().slice(0, 10)
    if (typeof value === 'number') {
      const code = XLSX.SSF?.parse_date_code ? XLSX.SSF.parse_date_code(value) : null
      if (code) {
        const d = new Date(code.y, code.m - 1, code.d)
        return d.toISOString().slice(0, 10)
      }
    }
    const s = String(value).trim()
    if (!s) return null
    const d = new Date(s)
    if (isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }

  const loadSummary = async (range: 'today' | '7d' | '30d') => {
    try {
      setLoading(true)
      const res = await fetch(`/api/performance/summary?range=${range}`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || '加载失败')
      }
      setTrend(data.trend || [])
      setRows(data.products || [])
      setDataStatus({
        shopLastSyncAt: data.meta?.shopLastSyncAt ?? null,
        adsLastSyncAt: data.meta?.adsLastSyncAt ?? null,
        lastImportedBy: data.meta?.lastImportedBy ?? null,
        state: data.meta?.state ?? 'stale',
      })
    } catch (error) {
      console.error(error)
      setMessage({ type: 'error', text: '加载经营数据失败，请稍后重试。' })
    } finally {
      setLoading(false)
    }
  }

  const handleImportOrders = () => router.push('/dashboard/product-sales')

  const handleImportAds = () => {
    if (adsInputRef.current) {
      adsInputRef.current.value = ''
      adsInputRef.current.click()
    }
  }

  const handleAdsFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportingAds(true)
    setMessage({ type: '', text: '' })

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' })

      const items = rows
        .map((row) => {
          const dateStr =
            parseDateString(row.date || row.日期 || row['stat_date']) ??
            null
          const sku = String(row.sku || row.SKU || row['商品SKU'] || '').trim()
          if (!dateStr || !sku) return null

          const adsCost =
            Number(row.adsCost || row['广告花费'] || row.spend || row['spend']) || 0

          return {
            date: dateStr,
            sku,
            adsCost,
          }
        })
        .filter(Boolean)

      if (!items.length) {
        setMessage({ type: 'error', text: '广告文件中没有解析到有效数据。' })
        return
      }

      const res = await fetch('/api/performance/import-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || '导入广告数据失败')
      }

      setMessage({
        type: 'success',
        text: `已导入 ${json.count ?? items.length} 条广告数据，并自动汇总。`,
      })
      await loadSummary(dateRange)
    } catch (error) {
      console.error(error)
      setMessage({ type: 'error', text: '导入广告数据失败，请检查文件格式。' })
    } finally {
      setImportingAds(false)
    }
  }

  const handleRefresh = () => {
    void loadSummary(dateRange)
  }

  const maxGmv = Math.max(...trend.map((p) => p.gmv), 1)
  const maxAds = Math.max(...trend.map((p) => p.adsCost), 1)
  const maxOrders = Math.max(...trend.map((p) => p.orders), 1)
  const refreshDisabledReason = loading ? '数据加载中' : undefined

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        加载中...
      </div>
    )
  }

  return (
    <FunctionalPremiumScope className="space-y-4">
      <PageHeader
        title="经营数据"
        description="查看每日成交、花费、投产比和产品表现，让运营、投手和老板对生意情况一目了然。"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className={primaryActionClassName}
              disabled={loading}
              title={refreshDisabledReason}
            >
              {loading ? '刷新中...' : '刷新数据'}
            </button>
            <OverflowMenu label="经营数据更多操作" items={[
              { label: '前往销售分析导入订单', onSelect: handleImportOrders, disabled: loading },
              { label: '广告导入待审计', onSelect: handleImportAds, disabled: true },
            ]} />
          </div>
        }
      />

      {/* 隐藏的文件选择器 */}
      <input
        ref={adsInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleAdsFileChange}
      />

      {message.text && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            message.type === 'error'
              ? 'bg-red-50 text-red-700'
              : 'bg-green-50 text-green-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {loading && !hasTrend ? (showLoading ? <div className="h-32 animate-pulse rounded-lg border border-gray-200 bg-gray-100/70" /> : <div className="h-32" />) : null}

      <div className={`${loading && !hasTrend ? 'hidden' : 'grid'} overflow-hidden rounded-lg border border-gray-200 bg-white md:grid-cols-4 md:divide-x md:divide-gray-100`}>
        <InteractiveMetric label="今日成交额（GMV）" value={`$${today.gmv.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} description={<span>昨日 ${yesterday.gmv.toLocaleString('en-US', { maximumFractionDigits: 0 })} · <span className={delta.gmv >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{delta.gmv >= 0 ? '+' : ''}{delta.gmv.toFixed(0)}</span></span>} />
        <InteractiveMetric label="今日订单数" value={today.orders.toLocaleString('zh-CN')} description={<span>昨日 {yesterday.orders.toLocaleString('zh-CN')} · <span className={delta.orders >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{delta.orders >= 0 ? '+' : ''}{delta.orders}</span></span>} />
        <InteractiveMetric label="今日广告花费" value={`$${today.adsCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} description={<span>昨日 ${yesterday.adsCost.toLocaleString('en-US', { maximumFractionDigits: 0 })} · <span className={delta.adsCost <= 0 ? 'text-emerald-600' : 'text-rose-600'}>{delta.adsCost >= 0 ? '+' : ''}{delta.adsCost.toFixed(0)}</span></span>} />
        <InteractiveMetric label="今日投产比（ROAS）" value={todayRoas.toFixed(2)} description={<span>昨日 {yesterdayRoas.toFixed(2)} · <span className={delta.roas >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{delta.roas >= 0 ? '+' : ''}{delta.roas.toFixed(2)}</span></span>} />
      </div>

      <div className={`${loading && !hasTrend ? 'hidden' : 'flex'} flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs text-gray-500`}>
        <span>近 7 天 GMV <strong className="font-medium tabular-nums text-gray-800">${trend.reduce((s, p) => s + p.gmv, 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong></span>
        <span>订单 <strong className="font-medium tabular-nums text-gray-800">{trend.reduce((s, p) => s + p.orders, 0).toLocaleString('zh-CN')}</strong></span>
        <span>ROAS <strong className="font-medium tabular-nums text-gray-800">{(trend.reduce((s, p) => s + p.gmv, 0) / Math.max(trend.reduce((s, p) => s + p.adsCost, 0), 1)).toFixed(2)}</strong></span>
      </div>

      {/* 趋势图（简易 sparkline） */}
      <div className={`${loading && !hasTrend ? 'hidden' : ''} rounded-lg border border-gray-200 bg-white p-4`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {[
            { label: '成交额趋势', key: 'gmv' as const, max: maxGmv, color: 'bg-green-500' },
            { label: '广告花费趋势', key: 'adsCost' as const, max: maxAds, color: 'bg-red-500' },
            { label: '订单趋势', key: 'orders' as const, max: maxOrders, color: 'bg-blue-500' },
            {
              label: 'ROAS 趋势',
              key: 'roas' as const,
              max: Math.max(...trend.map((p) => (p.adsCost > 0 ? p.gmv / p.adsCost : 0)), 1),
              color: 'bg-indigo-500',
            },
          ].map((cfg) => (
            <div key={cfg.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-900">{cfg.label}</div>
                <div className="text-[11px] text-gray-500">
                  {hasTrend ? trend[trend.length - 1].date : '—'}
                </div>
              </div>
              <div className="flex items-end gap-1 h-16">
                {trend.map((p) => {
                  const value =
                    cfg.key === 'gmv'
                      ? p.gmv
                      : cfg.key === 'adsCost'
                      ? p.adsCost
                      : cfg.key === 'orders'
                      ? p.orders
                      : p.adsCost > 0
                      ? p.gmv / p.adsCost
                      : 0
                  const h = Math.max((value / cfg.max) * 100, 6)
                  return (
                    <div
                      key={`${cfg.key}-${p.date}`}
                      className={`${cfg.color} rounded-t-md flex-1`}
                      style={{ height: `${h}%` }}
                      title={`${p.date} · ${value.toFixed(2)}`}
                    />
                  )
                })}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-gray-400">
                <span>{hasTrend ? trend[0].date.slice(5) : ''}</span>
                <span>{hasTrend ? trend[trend.length - 1].date.slice(5) : ''}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 筛选区 */}
      <StickyToolbar className={loading && !hasTrend ? 'hidden' : ''}>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="space-y-1">
            <div className="text-gray-600">日期范围</div>
            <div className="flex gap-1">
              {[
                { id: 'today', label: '今天' },
                { id: '7d', label: '最近 7 天' },
                { id: '30d', label: '最近 30 天' },
              ].map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDateRange(d.id as any)}
                  className={`px-2.5 py-1 rounded-md border ${
                    dateRange === d.id
                      ? 'bg-primary-50 border-primary-400 text-primary-700'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-[180px]">
            <div className="text-gray-600 mb-1">产品 / SKU 搜索</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="输入产品名称或 SKU"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <div className="text-gray-600 mb-1">产品线</div>
            <select
              value={productLine}
              onChange={(e) => setProductLine(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs"
            >
              <option value="all">全部</option>
              {productLines.map((pl) => (
                <option key={pl} value={pl}>
                  {pl}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-gray-600 mb-1">状态</div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs"
            >
              <option value="all">全部</option>
              <option value="normal">正常</option>
              <option value="watch">关注中</option>
              <option value="pause">暂停</option>
            </select>
          </div>

          <div>
            <div className="text-gray-600 mb-1">负责人</div>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs"
            >
              <option value="all">全部</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        </div>
        {search ? <FilterChip label={`搜索：${search}`} onRemove={() => setSearch('')} /> : null}
        {productLine !== 'all' ? <FilterChip label={`产品线：${productLine}`} onRemove={() => setProductLine('all')} /> : null}
        {statusFilter !== 'all' ? <FilterChip label={`状态：${statusFilter}`} onRemove={() => setStatusFilter('all')} /> : null}
        {ownerFilter !== 'all' ? <FilterChip label={`负责人：${ownerFilter}`} onRemove={() => setOwnerFilter('all')} /> : null}
      </StickyToolbar>

      {/* 产品表现表格 */}
      <div className={`${loading && !hasTrend ? 'hidden' : ''} overflow-hidden rounded-lg border border-gray-200 bg-white`}>
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">产品表现</div>
          <div className="text-xs text-gray-500">
            当前 {filteredRows.length} 个 SKU（按所选时段 GMV 由高到低排序）
          </div>
        </div>
        {filteredRows.length === 0 ? (
          <CompactEmptyState>当前筛选条件下没有产品表现数据。</CompactEmptyState>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">产品</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">SKU</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">所选时段成交额</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">所选时段订单数</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">所选时段广告花费</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">所选时段 ROAS</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">最近更新时间</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">状态</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">建议动作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredRows
                  .slice()
                  .sort((a, b) => b.rangeGmv - a.rangeGmv)
                  .map((row) => {
                    const roas = getRoas(row)
                    const suggestion = getSuggestion(row)
                    return (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs text-gray-900 truncate max-w-[220px]">
                          {row.name}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-gray-600">{row.sku}</td>
                        <td className="px-3 py-2 text-right text-xs">
                          ${row.rangeGmv.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs">{row.rangeOrders}</td>
                        <td className="px-3 py-2 text-right text-xs">
                          ${row.rangeAdsCost.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs">
                          {roas.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-gray-500 whitespace-nowrap">
                          {new Date(row.lastUpdatedAt).toLocaleString('zh-CN')}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {row.status === 'normal' && (
                            <span className="inline-flex px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                              正常
                            </span>
                          )}
                          {row.status === 'watch' && (
                            <span className="inline-flex px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700">
                              关注中
                            </span>
                          )}
                          {row.status === 'pause' && (
                            <span className="inline-flex px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                              暂停
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full ${
                              suggestion === '可继续投放'
                                ? 'bg-green-50 text-green-700'
                                : suggestion === '关注转化' || suggestion === '关注花费'
                                ? 'bg-yellow-50 text-yellow-700'
                                : suggestion === '检查库存'
                                ? 'bg-red-50 text-red-700'
                                : 'bg-gray-50 text-gray-700'
                            }`}
                          >
                            {suggestion}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 数据来源信息 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-600">
        <div className="flex flex-wrap gap-4">
          <div>
            <div className="text-gray-500">Shop 数据最近更新时间</div>
            <div className="mt-0.5 text-gray-900">
              {dataStatus.shopLastSyncAt
                ? new Date(dataStatus.shopLastSyncAt).toLocaleString('zh-CN')
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Ads 数据最近更新时间</div>
            <div className="mt-0.5 text-gray-900">
              {dataStatus.adsLastSyncAt
                ? new Date(dataStatus.adsLastSyncAt).toLocaleString('zh-CN')
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-gray-500">最近导入人</div>
            <div className="mt-0.5 text-gray-900">{dataStatus.lastImportedBy || '—'}</div>
          </div>
          <div>
            <div className="text-gray-500">数据状态</div>
            <div className="mt-0.5 text-gray-900">
              {dataStatus.state === 'ok' && (
                <span className="inline-flex px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                  正常
                </span>
              )}
              {dataStatus.state === 'stale' && (
                <span className="inline-flex px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700">
                  待更新
                </span>
              )}
              {dataStatus.state === 'error' && (
                <span className="inline-flex px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                  导入失败
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 border-t border-gray-100 pt-2 text-[11px] text-gray-400">
          当前数据基于 mock 导入逻辑，仅用于产品形态演示。接入真实订单与广告来源后，可复用相同 UI。
        </div>
      </div>
    </FunctionalPremiumScope>
  )
}
