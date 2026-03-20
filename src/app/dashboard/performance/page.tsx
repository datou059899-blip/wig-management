'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { PageHeader } from '@/components/layout/PageHeader'
import { parseTikTokOrderExcel } from '@/lib/parseTikTokOrderExcel'

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
  todayGmv: number
  todayOrders: number
  todayAdsCost: number
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
  const [importingOrders, setImportingOrders] = useState(false)
  const [importingAds, setImportingAds] = useState(false)
  const [lastImportedOrdersPreview, setLastImportedOrdersPreview] = useState<
    { [label: string]: any }[]
  >([])
  const [showOrdersPreview, setShowOrdersPreview] = useState(false)

  const ordersInputRef = useRef<HTMLInputElement | null>(null)
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
    row.todayAdsCost > 0 ? row.todayGmv / row.todayAdsCost : 0

  const getSuggestion = (row: ProductPerf) => {
    const roas = getRoas(row)
    if (row.todayAdsCost === 0 && row.todayGmv === 0) return '待投放'
    if (roas >= 3 && row.todayOrders >= 5) return '可继续投放'
    if (roas < 1 && row.todayAdsCost > 0) return '关注转化'
    if (row.todayAdsCost > 0 && row.todayGmv === 0) return '关注花费'
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

  const handleImportOrders = () => {
    if (ordersInputRef.current) {
      ordersInputRef.current.value = ''
      ordersInputRef.current.click()
    }
  }

  const handleImportAds = () => {
    if (adsInputRef.current) {
      adsInputRef.current.value = ''
      adsInputRef.current.click()
    }
  }

  const handleOrdersFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportingOrders(true)
    setMessage({ type: '', text: '' })

    try {
      const parsed = await parseTikTokOrderExcel(file)

      if (!parsed.normalizedRows.length) {
        setMessage({ type: 'error', text: '订单文件中没有解析到有效数据。' })
        return
      }

      const items = parsed.normalizedRows
        .map((row) => {
          const dateIso = row.paidAt || row.createdAt
          const dateStr = dateIso ? dateIso.slice(0, 10) : null
          const sku = row.sku?.trim() || ''
          if (!dateStr || !sku) return null

          const gmv = row.gmv ?? 0
          const quantity = row.quantity ?? 1

          return {
            date: dateStr,
            sku,
            name: row.productName || sku,
            productLine: '',
            owner: '',
            gmv,
            orders: quantity,
          }
        })
        .filter(Boolean) as {
        date: string
        sku: string
        name: string
        productLine: string
        owner: string
        gmv: number
        orders: number
      }[]

      const res = await fetch('/api/performance/import-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || '导入订单数据失败')
      }

      setLastImportedOrdersPreview(parsed.rawRows)
      setShowOrdersPreview(true)

      setMessage({
        type: 'success',
        text: `已导入 ${parsed.stats.validRows} 条订单数据，跳过 ${parsed.stats.skippedRows} 条无效记录。`,
      })
      await loadSummary(dateRange)
    } catch (error) {
      console.error(error)
      setMessage({ type: 'error', text: '导入订单数据失败，请检查文件格式。' })
    } finally {
      setImportingOrders(false)
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

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        加载中...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="经营数据中心"
        description="查看每日成交、花费、投产比和产品表现，让运营、投手和老板对生意情况一目了然。"
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleImportOrders}
              className="px-3 py-2 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50 disabled:opacity-60"
              disabled={importingOrders || loading}
            >
              {importingOrders ? '正在导入订单...' : '导入订单数据'}
            </button>
            <button
              onClick={handleImportAds}
              className="px-3 py-2 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50 disabled:opacity-60"
              disabled={importingAds || loading}
            >
              {importingAds ? '正在导入广告...' : '导入广告数据'}
            </button>
            <button
              onClick={handleRefresh}
              className="px-3 py-2 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? '刷新中...' : '刷新数据'}
            </button>
          </div>
        }
      />

      {/* 隐藏的文件选择器 */}
      <input
        ref={ordersInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleOrdersFileChange}
      />
      <input
        ref={adsInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleAdsFileChange}
      />

      {/* 本次导入订单预览（中文字段） */}
      {lastImportedOrdersPreview.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div
            className="px-4 py-3 border-b flex items-center justify-between cursor-pointer"
            onClick={() => setShowOrdersPreview((v) => !v)}
          >
            <div>
              <div className="text-sm font-semibold text-gray-900">本次导入订单预览</div>
              <div className="mt-0.5 text-xs text-gray-500">
                共 {lastImportedOrdersPreview.length} 条记录，以下展示前 20 条。
              </div>
            </div>
            <button className="text-xs text-primary-600 hover:text-primary-700">
              {showOrdersPreview ? '收起' : '展开'}
            </button>
          </div>
          {showOrdersPreview && (
            <div className="max-h-72 overflow-auto text-xs">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    {Object.keys(lastImportedOrdersPreview[0]).map((label) => (
                      <th
                        key={label}
                        className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {lastImportedOrdersPreview.slice(0, 20).map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      {Object.keys(lastImportedOrdersPreview[0]).map((label) => (
                        <td
                          key={label}
                          className="px-3 py-1.5 text-[11px] text-gray-700 whitespace-nowrap"
                          title={String(row[label] ?? '')}
                        >
                          {String(row[label] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <div className="text-xs text-gray-500">今日成交额（GMV）</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">${today.gmv.toFixed(0)}</div>
          <div className="mt-1 text-xs text-gray-500">
            昨日：${yesterday.gmv.toFixed(0)}{' '}
            <span className={delta.gmv >= 0 ? 'text-green-600' : 'text-red-600'}>
              {delta.gmv >= 0 ? '+' : ''}
              {delta.gmv.toFixed(0)}
            </span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <div className="text-xs text-gray-500">今日订单数</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{today.orders}</div>
          <div className="mt-1 text-xs text-gray-500">
            昨日：{yesterday.orders}{' '}
            <span className={delta.orders >= 0 ? 'text-green-600' : 'text-red-600'}>
              {delta.orders >= 0 ? '+' : ''}
              {delta.orders}
            </span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <div className="text-xs text-gray-500">今日广告花费</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">${today.adsCost.toFixed(0)}</div>
          <div className="mt-1 text-xs text-gray-500">
            昨日：${yesterday.adsCost.toFixed(0)}{' '}
            <span className={delta.adsCost <= 0 ? 'text-green-600' : 'text-red-600'}>
              {delta.adsCost >= 0 ? '+' : ''}
              {delta.adsCost.toFixed(0)}
            </span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <div className="text-xs text-gray-500">今日投产比（ROAS）</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">
            {todayRoas.toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            昨日：{yesterdayRoas.toFixed(2)}{' '}
            <span className={delta.roas >= 0 ? 'text-green-600' : 'text-red-600'}>
              {delta.roas >= 0 ? '+' : ''}
              {delta.roas.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <div className="text-xs text-gray-500">昨日对比</div>
          <div className="mt-1 text-sm text-gray-900">
            GMV{' '}
            <span className={delta.gmv >= 0 ? 'text-green-600' : 'text-red-600'}>
              {delta.gmv >= 0 ? '+' : ''}
              {delta.gmv.toFixed(0)}
            </span>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            订单{' '}
            <span className={delta.orders >= 0 ? 'text-green-600' : 'text-red-600'}>
              {delta.orders >= 0 ? '+' : ''}
              {delta.orders}
            </span>{' '}
            · ROAS{' '}
            <span className={delta.roas >= 0 ? 'text-green-600' : 'text-red-600'}>
              {delta.roas >= 0 ? '+' : ''}
              {delta.roas.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <div className="text-xs text-gray-500">近 7 天摘要</div>
          <div className="mt-1 text-sm text-gray-900">
            总 GMV ${trend.reduce((s, p) => s + p.gmv, 0).toFixed(0)}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            订单 {trend.reduce((s, p) => s + p.orders, 0)} · ROAS{' '}
            {(
              trend.reduce((s, p) => s + p.gmv, 0) /
              Math.max(trend.reduce((s, p) => s + p.adsCost, 0), 1)
            ).toFixed(2)}
          </div>
        </div>
      </div>

      {/* 趋势图（简易 sparkline） */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
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
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center text-xs">
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
      </div>

      {/* 产品表现表格 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">产品表现</div>
          <div className="text-xs text-gray-500">
            当前 {filteredRows.length} 个 SKU（按今日 GMV 由高到低排序）
          </div>
        </div>
        {filteredRows.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-gray-500">
            当前筛选条件下没有产品表现数据。
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">产品</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">SKU</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">今日成交额</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">今日订单数</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">今日广告花费</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">今日 ROAS</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">最近更新时间</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">状态</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">建议动作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredRows
                  .slice()
                  .sort((a, b) => b.todayGmv - a.todayGmv)
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
                          ${row.todayGmv.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs">{row.todayOrders}</td>
                        <td className="px-3 py-2 text-right text-xs">
                          ${row.todayAdsCost.toFixed(2)}
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
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-xs text-gray-600">
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
        <div className="mt-2 text-[11px] text-gray-500">
          当前数据基于 mock 导入逻辑，仅用于产品形态演示。接入真实订单与广告来源后，可复用相同 UI。
        </div>
      </div>
    </div>
  )
}
