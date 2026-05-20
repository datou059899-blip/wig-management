'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageGuard } from '@/components/PageGuard'

interface SummaryData {
  todaySales: number
  yesterdaySales: number
  weekSales: number
  monthSales: number
  totalStock: number
  lowStockCount: number
  outOfStockCount: number
}

interface ProductData {
  id: string
  sku: string
  name: string
  color: string
  length: string
  todaySales: number
  yesterdaySales: number
  weekSales: number
  monthSales: number
  stock: number
  stockStatus: string
  updatedAt: string
}

interface ImportFailure {
  row: number
  sku: string
  reason: string
}

interface ImportResult {
  successCount: number
  failureCount: number
  failures: ImportFailure[]
  hint?: string | null
}

interface TrendPoint {
  date: string
  label: string
  orders: number
  stock: number
}

interface SkuOption {
  sku: string
  name: string
}

export default function ProductSalesPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const inventoryInputRef = useRef<HTMLInputElement>(null)
  const ordersInputRef = useRef<HTMLInputElement>(null)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [products, setProducts] = useState<ProductData[]>([])
  const [skuOptions, setSkuOptions] = useState<SkuOption[]>([])
  const [selectedSku, setSelectedSku] = useState('')
  const [trendRange, setTrendRange] = useState<7 | 30>(7)
  const [trends, setTrends] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [importingInventory, setImportingInventory] = useState(false)
  const [importingOrders, setImportingOrders] = useState(false)
  const [editingStockSku, setEditingStockSku] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [ordersImportResult, setOrdersImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'sku',
    direction: 'asc',
  })

  const loadData = async (sku = selectedSku, range = trendRange) => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (sku) {
        params.set('sku', sku)
      }
      params.set('range', String(range))

      const response = await fetch(`/api/product-sales?${params.toString()}`)
      if (!response.ok) {
        throw new Error('获取数据失败')
      }
      const data = await response.json()
      setSummary(data.summary)
      setProducts(data.products)
      setSkuOptions(Array.isArray(data.skuOptions) ? data.skuOptions : [])
      setSelectedSku(data.selectedSku || '')
      setTrendRange(data.trendRange === 30 ? 30 : 7)
      setTrends(Array.isArray(data.trends) ? data.trends : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取数据失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData('', 7)
  }, [])

  const handleImportInventory = () => {
    inventoryInputRef.current?.click()
  }

  const handleImportOrders = () => {
    ordersInputRef.current?.click()
  }

  const handleInventoryFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportingInventory(true)
    setImportResult(null)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/product-sales/import-inventory', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '导入库存失败')
      }

      setImportResult({
        successCount: data.successCount || 0,
        failureCount: data.failureCount || 0,
        failures: Array.isArray(data.failures) ? data.failures : [],
        hint: data.hint || null,
      })

      await loadData(selectedSku, trendRange)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入库存失败')
    } finally {
      event.target.value = ''
      setImportingInventory(false)
    }
  }

  const handleOrdersFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportingOrders(true)
    setOrdersImportResult(null)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/product-sales/import-orders', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '导入订单失败')
      }

      setOrdersImportResult({
        successCount: data.successCount || 0,
        failureCount: data.failureCount || 0,
        failures: Array.isArray(data.failures) ? data.failures : [],
      })

      await loadData(selectedSku, trendRange)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入订单失败')
    } finally {
      event.target.value = ''
      setImportingOrders(false)
    }
  }

  const handleEditStock = async (product: ProductData) => {
    if (!product.sku || product.sku === '-') {
      setError('该产品缺少 SKU，无法修改库存')
      return
    }

    const nextValue = window.prompt(`请输入 ${product.sku} 的最新库存`, String(product.stock))
    if (nextValue === null) return

    const trimmed = nextValue.trim()
    if (!trimmed) {
      setError('库存不能为空')
      return
    }

    const stock = Number(trimmed)
    if (!Number.isInteger(stock) || stock < 0) {
      setError('库存必须是大于等于 0 的整数')
      return
    }

    try {
      setEditingStockSku(product.sku)
      setError(null)

      const response = await fetch('/api/product-sales/update-stock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sku: product.sku,
          stock,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '修改库存失败')
      }

      await loadData(selectedSku, trendRange)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改库存失败')
    } finally {
      setEditingStockSku(null)
    }
  }

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const sortedProducts = [...products].sort((a, b) => {
    const aValue = a[sortConfig.key as keyof ProductData]
    const bValue = b[sortConfig.key as keyof ProductData]

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortConfig.direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue
    }

    return 0
  })

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig.key !== columnKey) {
      return <span className="text-slate-400 text-xs">⇅</span>
    }
    return <span className="text-pink-500 text-xs">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
  }

  const selectedProduct = products.find((product) => product.sku === selectedSku)

  return (
    <PageGuard>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {/* 页面标题 */}
          <div className="mb-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">产品销售库存</h1>
                <p className="text-slate-600 mt-2">查看产品销售趋势和库存现状</p>
              </div>
              <button
                onClick={handleImportInventory}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60"
                disabled={importingInventory || importingOrders || loading}
              >
                {importingInventory ? '正在导入库存表...' : '导入库存表'}
              </button>
              <button
                onClick={handleImportOrders}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
                disabled={importingOrders || importingInventory || loading}
              >
                {importingOrders ? '正在导入订单表...' : '导入订单表'}
              </button>
            </div>
          </div>

          <input
            ref={inventoryInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleInventoryFileChange}
          />
          <input
            ref={ordersInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleOrdersFileChange}
          />

          {/* 错误提示 */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {importResult && (
            <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">
                  库存导入完成
                </span>
                <span>成功 {importResult.successCount} 条</span>
                <span>失败 {importResult.failureCount} 条</span>
              </div>
              {importResult.hint && (
                <div className="mt-2 text-sm text-amber-700">
                  {importResult.hint}
                </div>
              )}
              {importResult.failures.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-3 py-2">行号</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">失败原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.failures.map((item, index) => (
                        <tr key={`${item.row}-${item.sku}-${index}`} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-700">{item.row}</td>
                          <td className="px-3 py-2 text-slate-700">{item.sku || '-'}</td>
                          <td className="px-3 py-2 text-red-600">{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {ordersImportResult && (
            <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">
                  订单导入完成
                </span>
                <span>成功 {ordersImportResult.successCount} 条</span>
                <span>失败 {ordersImportResult.failureCount} 条</span>
              </div>
              {ordersImportResult.failures.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-3 py-2">行号</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">失败原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersImportResult.failures.map((item, index) => (
                        <tr key={`${item.row}-${item.sku}-${index}`} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-700">{item.row || '-'}</td>
                          <td className="px-3 py-2 text-slate-700">{item.sku || '-'}</td>
                          <td className="px-3 py-2 text-red-600">{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {skuOptions.length > 0 && (
            <div className="mb-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">销售库存趋势</h2>
                  <p className="mt-1 text-sm text-slate-600">查看所选 SKU 最近销量和库存变化</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <select
                    value={selectedSku}
                    onChange={(event) => {
                      const nextSku = event.target.value
                      setSelectedSku(nextSku)
                      void loadData(nextSku, trendRange)
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                  >
                    {skuOptions.map((option) => (
                      <option key={option.sku} value={option.sku}>
                        {option.sku} - {option.name}
                      </option>
                    ))}
                  </select>
                  <div className="inline-flex rounded-lg border border-slate-300 p-1">
                    <button
                      onClick={() => {
                        setTrendRange(7)
                        void loadData(selectedSku, 7)
                      }}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                        trendRange === 7 ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      最近 7 天
                    </button>
                    <button
                      onClick={() => {
                        setTrendRange(30)
                        void loadData(selectedSku, 30)
                      }}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                        trendRange === 30 ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      最近 30 天
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                  <div className="mb-3">
                    <div className="text-sm font-medium text-slate-900">每日销量曲线</div>
                    <div className="text-xs text-slate-500">
                      {selectedProduct ? `${selectedProduct.name} / ${selectedProduct.sku}` : '当前 SKU'}
                    </div>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trends} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="orders"
                          name="每日销量"
                          stroke="#2563eb"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                  <div className="mb-3">
                    <div className="text-sm font-medium text-slate-900">每日剩余库存曲线</div>
                    <div className="text-xs text-slate-500">缺失快照时沿用最近一次库存</div>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trends} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="stock"
                          name="每日剩余库存"
                          stroke="#db2777"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 加载状态 */}
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
                <p className="mt-4 text-slate-600">加载中...</p>
              </div>
            </div>
          ) : summary ? (
            <>
              {/* 汇总卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {/* 今日销量 */}
                <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-blue-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-600 text-sm font-medium">今日销量</p>
                      <p className="text-3xl font-bold text-slate-900 mt-2">{summary.todaySales}</p>
                    </div>
                    <div className="text-4xl text-blue-500 opacity-20">📊</div>
                  </div>
                </div>

                {/* 昨日销量 */}
                <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-green-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-600 text-sm font-medium">昨日销量</p>
                      <p className="text-3xl font-bold text-slate-900 mt-2">{summary.yesterdaySales}</p>
                    </div>
                    <div className="text-4xl text-green-500 opacity-20">📈</div>
                  </div>
                </div>

                {/* 近7天销量 */}
                <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-purple-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-600 text-sm font-medium">近7天销量</p>
                      <p className="text-3xl font-bold text-slate-900 mt-2">{summary.weekSales}</p>
                    </div>
                    <div className="text-4xl text-purple-500 opacity-20">📅</div>
                  </div>
                </div>

                {/* 近30天销量 */}
                <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-orange-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-600 text-sm font-medium">近30天销量</p>
                      <p className="text-3xl font-bold text-slate-900 mt-2">{summary.monthSales}</p>
                    </div>
                    <div className="text-4xl text-orange-500 opacity-20">📊</div>
                  </div>
                </div>

                {/* 当前总库存 */}
                <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-indigo-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-600 text-sm font-medium">当前总库存</p>
                      <p className="text-3xl font-bold text-slate-900 mt-2">{summary.totalStock}</p>
                    </div>
                    <div className="text-4xl text-indigo-500 opacity-20">📦</div>
                  </div>
                </div>

                {/* 低库存产品数 */}
                <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-yellow-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-600 text-sm font-medium">低库存产品数</p>
                      <p className="text-3xl font-bold text-slate-900 mt-2">{summary.lowStockCount}</p>
                    </div>
                    <div className="text-4xl text-yellow-500 opacity-20">⚠️</div>
                  </div>
                </div>

                {/* 断货产品数 */}
                <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-red-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-600 text-sm font-medium">断货产品数</p>
                      <p className="text-3xl font-bold text-slate-900 mt-2">{summary.outOfStockCount}</p>
                    </div>
                    <div className="text-4xl text-red-500 opacity-20">❌</div>
                  </div>
                </div>
              </div>

              {/* 产品表格 */}
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-3 text-left">
                          <button
                            onClick={() => handleSort('sku')}
                            className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600"
                          >
                            SKU <SortIcon columnKey="sku" />
                          </button>
                        </th>
                        <th className="px-6 py-3 text-left">
                          <button
                            onClick={() => handleSort('name')}
                            className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600"
                          >
                             产品名称 <SortIcon columnKey="name" />
                          </button>
                        </th>
                        <th className="px-6 py-3 text-left">
                          <button
                            onClick={() => handleSort('color')}
                            className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600"
                          >
                            颜色 <SortIcon columnKey="color" />
                          </button>
                        </th>
                        <th className="px-6 py-3 text-left">
                          <button
                            onClick={() => handleSort('length')}
                            className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600"
                          >
                            长度 <SortIcon columnKey="length" />
                          </button>
                        </th>
                        <th className="px-6 py-3 text-center">
                          <button
                            onClick={() => handleSort('todaySales')}
                            className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600 justify-center w-full"
                          >
                            今日销量 <SortIcon columnKey="todaySales" />
                          </button>
                        </th>
                        <th className="px-6 py-3 text-center">
                          <button
                            onClick={() => handleSort('yesterdaySales')}
                            className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600 justify-center w-full"
                          >
                            昨日销量 <SortIcon columnKey="yesterdaySales" />
                          </button>
                        </th>
                        <th className="px-6 py-3 text-center">
                          <button
                            onClick={() => handleSort('weekSales')}
                            className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600 justify-center w-full"
                          >
                            近7天销量 <SortIcon columnKey="weekSales" />
                          </button>
                        </th>
                        <th className="px-6 py-3 text-center">
                          <button
                            onClick={() => handleSort('monthSales')}
                            className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600 justify-center w-full"
                          >
                            近30天销量 <SortIcon columnKey="monthSales" />
                          </button>
                        </th>
                        <th className="px-6 py-3 text-center">
                          <button
                            onClick={() => handleSort('stock')}
                            className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600 justify-center w-full"
                          >
                            当前库存 <SortIcon columnKey="stock" />
                          </button>
                        </th>
                        <th className="px-6 py-3 text-center">
                          <button
                            onClick={() => handleSort('stockStatus')}
                            className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600 justify-center w-full"
                          >
                            库存状态 <SortIcon columnKey="stockStatus" />
                          </button>
                        </th>
                        <th className="px-6 py-3 text-left">
                          <button
                            onClick={() => handleSort('updatedAt')}
                            className="flex items-center gap-2 font-semibold text-slate-900 hover:text-pink-600"
                          >
                            更新时间 <SortIcon columnKey="updatedAt" />
                          </button>
                        </th>
                        <th className="px-6 py-3 text-center font-semibold text-slate-900">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedProducts.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="px-6 py-8 text-center text-slate-500">
                            暂无产品数据
                          </td>
                        </tr>
                      ) : (
                        sortedProducts.map((product) => (
                          <tr key={product.id} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 text-sm font-medium text-slate-900">{product.sku}</td>
                            <td className="px-6 py-4 text-sm text-slate-700">{product.name}</td>
                            <td className="px-6 py-4 text-sm text-slate-700">{product.color}</td>
                            <td className="px-6 py-4 text-sm text-slate-700">{product.length}</td>
                            <td className="px-6 py-4 text-sm text-center text-slate-700">{product.todaySales}</td>
                            <td className="px-6 py-4 text-sm text-center text-slate-700">{product.yesterdaySales}</td>
                            <td className="px-6 py-4 text-sm text-center text-slate-700">{product.weekSales}</td>
                            <td className="px-6 py-4 text-sm text-center text-slate-700">{product.monthSales}</td>
                            <td className="px-6 py-4 text-sm text-center font-medium text-slate-900">{product.stock}</td>
                            <td className="px-6 py-4 text-sm text-center">
                              <span
                                className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                                  product.stockStatus === '断货'
                                    ? 'bg-red-100 text-red-700'
                                    : product.stockStatus === '低库存'
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-green-100 text-green-700'
                                }`}
                              >
                                {product.stockStatus}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">
                              {new Date(product.updatedAt).toLocaleString('zh-CN')}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button
                                onClick={() => handleEditStock(product)}
                                className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={editingStockSku === product.sku || product.sku === '-'}
                              >
                                {editingStockSku === product.sku ? '保存中...' : '编辑库存'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </PageGuard>
  )
}
