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
  updatedExistingCount?: number
  autoFilledSkuCount?: number
  autoCreatedCount?: number
  reviewCount?: number
  failureCount: number
  failures: ImportFailure[]
  hint?: string | null
}

interface OrderImportFailure {
  row: number
  sku: string
  paidTime: string
  quantity: number
  returnQty: number
  reason: string
}

interface OrderImportSummaryByDate {
  date: string
  grossOrders: number
  returnQty: number
  netOrders: number
  canceledQty: number
  refundAmount: number
}

interface OrderImportSummaryBySku {
  sku: string
  grossOrders: number
  returnQty: number
  netOrders: number
  canceledQty: number
  refundAmount: number
}

interface OrderImportResult {
  stage?: string
  fileName?: string
  fileSize?: number
  totalOrderRows: number
  parsedRows?: number
  validRows?: number
  uniqueSkuCount?: number
  matchedSkuCount?: number
  missingSkuCount?: number
  missingSkus?: string[]
  aggregatedRecordCount?: number
  successCount: number
  failedCount: number
  failedRows: OrderImportFailure[]
  summaryByDate: OrderImportSummaryByDate[]
  summaryBySku: OrderImportSummaryBySku[]
  totalGrossOrders: number
  totalReturnQty: number
  totalNetOrders: number
  totalCanceledQty: number
  totalRefundAmount: number
  writeErrors?: Array<{ sku: string; dateStr: string; reason: string }>
}

async function parseApiResponse(response: Response) {
  const text = await response.text()

  if (!text) {
    return { data: null, text: '' }
  }

  try {
    return { data: JSON.parse(text), text }
  } catch {
    return { data: null, text }
  }
}

function buildImportErrorMessage(
  fallbackTitle: string,
  response: Response,
  data: any,
  text: string,
) {
  const detail = typeof data?.detail === 'string' && data.detail.trim()
    ? data.detail.trim()
    : ''
  const error = typeof data?.error === 'string' && data.error.trim()
    ? data.error.trim()
    : ''
  const plainText = text.trim()

  if (error || detail) {
    return `${error || fallbackTitle}${detail ? `：${detail}` : ''}`
  }

  if (plainText) {
    return `${fallbackTitle}：HTTP ${response.status} ${plainText}`
  }

  return `${fallbackTitle}：HTTP ${response.status}`
}

interface TrendPoint {
  date: string
  label: string
  orders: number
  stock: number
}

interface SkuOption {
  sku: string
}

interface ProductSalesGroup {
  id: string
  name: string
  skus: string[]
}

type StockEditMode = 'set' | 'increase' | 'decrease'

export default function ProductSalesPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const inventoryInputRef = useRef<HTMLInputElement>(null)
  const ordersInputRef = useRef<HTMLInputElement>(null)
  const orderImportModeRef = useRef<'import' | 'dryRun' | 'checkOnly'>('import')

  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [products, setProducts] = useState<ProductData[]>([])
  const [skuOptions, setSkuOptions] = useState<SkuOption[]>([])
  const [groups, setGroups] = useState<ProductSalesGroup[]>([])
  const [selectedSku, setSelectedSku] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [trendRange, setTrendRange] = useState<7 | 30>(7)
  const [trendTitle, setTrendTitle] = useState('销售库存趋势 - 全部 SKU')
  const [trends, setTrends] = useState<TrendPoint[]>([])

  const [loading, setLoading] = useState(true)
  const [trendLoading, setTrendLoading] = useState(false)
  const [importingInventory, setImportingInventory] = useState(false)
  const [importingOrders, setImportingOrders] = useState(false)
  const [editingStockSku, setEditingStockSku] = useState<string | null>(null)
  const [deletingStockSku, setDeletingStockSku] = useState<string | null>(null)
  const [stockEditTarget, setStockEditTarget] = useState<ProductData | null>(null)
  const [stockEditMode, setStockEditMode] = useState<StockEditMode>('set')
  const [stockEditValue, setStockEditValue] = useState('')
  const [stockEditError, setStockEditError] = useState<string | null>(null)
  const [groupManagerOpen, setGroupManagerOpen] = useState(false)
  const [groupFormId, setGroupFormId] = useState<string | null>(null)
  const [groupFormName, setGroupFormName] = useState('')
  const [groupFormSkus, setGroupFormSkus] = useState<string[]>([])
  const [groupFormError, setGroupFormError] = useState<string | null>(null)
  const [savingGroup, setSavingGroup] = useState(false)
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [ordersImportResult, setOrdersImportResult] = useState<OrderImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inventoryError, setInventoryError] = useState<string | null>(null)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'sku',
    direction: 'asc',
  })

  const loadPageData = async () => {
    const response = await fetch('/api/product-sales')
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || '获取数据失败')
    }

    setSummary(data.summary)
    setProducts(Array.isArray(data.products) ? data.products : [])
    setSkuOptions(Array.isArray(data.skuOptions) ? data.skuOptions : [])
  }

  const loadGroups = async () => {
    const response = await fetch('/api/product-sales/groups')
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || '获取分组失败')
    }

    setGroups(Array.isArray(data.groups) ? data.groups : [])
  }

  const loadTrendData = async (
    sku = selectedSku,
    groupId = selectedGroupId,
    range = trendRange,
    showLoading = true,
  ) => {
    try {
      if (showLoading) {
        setTrendLoading(true)
      }

      const params = new URLSearchParams()
      if (sku) {
        params.set('sku', sku)
      }
      if (groupId) {
        params.set('groupId', groupId)
      }
      params.set('range', String(range))

      const response = await fetch(`/api/product-sales/trends?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || '获取趋势失败')
      }

      setSelectedSku(data.selectedSku || '')
      setSelectedGroupId(data.selectedGroupId || '')
      setTrendRange(data.trendRange === 30 ? 30 : 7)
      setTrendTitle(data.trendTitle || '销售库存趋势 - 全部 SKU')
      setTrends(Array.isArray(data.trends) ? data.trends : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取趋势失败')
    } finally {
      if (showLoading) {
        setTrendLoading(false)
      }
    }
  }

  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true)
        await Promise.all([loadPageData(), loadGroups()])
        await loadTrendData('', '', 7, false)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : '获取数据失败')
      } finally {
        setLoading(false)
      }
    }

    void initialize()
  }, [])

  const refreshAfterMutation = async () => {
    await Promise.all([
      loadPageData(),
      loadGroups(),
      loadTrendData(selectedSku, selectedGroupId, trendRange, false),
    ])
    router.refresh()
  }

  const handleImportInventory = () => {
    inventoryInputRef.current?.click()
  }

  const handleImportOrders = (mode: 'import' | 'dryRun' | 'checkOnly' = 'import') => {
    orderImportModeRef.current = mode
    ordersInputRef.current?.click()
  }

  const handleInventoryFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportingInventory(true)
    setImportResult(null)
    setError(null)
    setInventoryError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/product-sales/import-inventory', {
        method: 'POST',
        body: formData,
      })
      const { data, text } = await parseApiResponse(response)
      const payload = data || {}

      if (!response.ok) {
        throw new Error(buildImportErrorMessage('导入库存表失败', response, payload, text))
      }

      setImportResult({
        successCount: payload.successCount || 0,
        updatedExistingCount: payload.updatedExistingCount || 0,
        autoFilledSkuCount: payload.autoFilledSkuCount || 0,
        autoCreatedCount: payload.autoCreatedCount || 0,
        reviewCount: payload.reviewCount || 0,
        failureCount: payload.failureCount || 0,
        failures: Array.isArray(payload.failures) ? payload.failures : [],
        hint: payload.hint || null,
      })

      await refreshAfterMutation()
    } catch (err) {
      const message = err instanceof Error ? err.message : '导入库存表失败'
      setInventoryError(message)
      setError(message)
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
    setOrdersError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      const mode = orderImportModeRef.current
      const query =
        mode === 'dryRun'
          ? '?dryRun=1'
          : mode === 'checkOnly'
            ? '?checkOnly=1'
            : ''

      const response = await fetch(`/api/product-sales/import-orders${query}`, {
        method: 'POST',
        body: formData,
      })
      const { data, text } = await parseApiResponse(response)
      const payload = data || {}

      if (!response.ok) {
        throw new Error(buildImportErrorMessage('导入订单表失败', response, payload, text))
      }

      setOrdersImportResult({
        stage: payload.stage || '',
        fileName: payload.fileName || '',
        fileSize: payload.fileSize || 0,
        totalOrderRows: payload.totalOrderRows || 0,
        parsedRows: payload.parsedRows || 0,
        validRows: payload.validRows || 0,
        uniqueSkuCount: payload.uniqueSkuCount || 0,
        matchedSkuCount: payload.matchedSkuCount || 0,
        missingSkuCount: payload.missingSkuCount || 0,
        missingSkus: Array.isArray(payload.missingSkus) ? payload.missingSkus : [],
        aggregatedRecordCount: payload.aggregatedRecordCount || 0,
        successCount: payload.successCount || 0,
        failedCount: payload.failedCount || 0,
        failedRows: Array.isArray(payload.failedRows) ? payload.failedRows : [],
        summaryByDate: Array.isArray(payload.summaryByDate) ? payload.summaryByDate : [],
        summaryBySku: Array.isArray(payload.summaryBySku) ? payload.summaryBySku : [],
        totalGrossOrders: payload.totalGrossOrders || 0,
        totalReturnQty: payload.totalReturnQty || 0,
        totalNetOrders: payload.totalNetOrders || 0,
        totalCanceledQty: payload.totalCanceledQty || 0,
        totalRefundAmount: payload.totalRefundAmount || 0,
        writeErrors: Array.isArray(payload.writeErrors) ? payload.writeErrors : [],
      })

      await refreshAfterMutation()
    } catch (err) {
      const message = err instanceof Error ? err.message : '导入订单表失败'
      setOrdersError(message)
      setError(message)
    } finally {
      event.target.value = ''
      setImportingOrders(false)
    }
  }

  const handleEditStock = (product: ProductData) => {
    if (!product.sku || product.sku === '-') {
      setError('该产品缺少 SKU，无法修改库存')
      return
    }

    setStockEditTarget(product)
    setStockEditMode('set')
    setStockEditValue(String(product.stock))
    setStockEditError(null)
  }

  const handleSaveStock = async () => {
    if (!stockEditTarget) return

    const trimmed = stockEditValue.trim()
    if (!trimmed) {
      setStockEditError(stockEditMode === 'set' ? '库存不能为空' : '调整数量不能为空')
      return
    }

    const parsedValue = Number(trimmed)
    if (!Number.isInteger(parsedValue) || parsedValue < 0) {
      setStockEditError(stockEditMode === 'set' ? '库存必须是大于等于 0 的整数' : '调整数量必须是大于等于 0 的整数')
      return
    }

    if (stockEditMode === 'decrease' && parsedValue > stockEditTarget.stock) {
      setStockEditError('库存不能小于 0')
      return
    }

    try {
      setEditingStockSku(stockEditTarget.sku)
      setStockEditError(null)
      setError(null)

      const response = await fetch('/api/product-sales/update-stock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sku: stockEditTarget.sku,
          mode: stockEditMode,
          stock: stockEditMode === 'set' ? parsedValue : undefined,
          quantity: stockEditMode === 'set' ? undefined : parsedValue,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '修改库存失败')
      }

      await refreshAfterMutation()
      setStockEditTarget(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : '修改库存失败'
      setStockEditError(message)
      setError(message)
    } finally {
      setEditingStockSku(null)
    }
  }

  const handleDeleteInventory = async (product: ProductData) => {
    if (!product.sku || product.sku === '-') {
      setError('该产品缺少 SKU，无法删除库存')
      return
    }

    const confirmed = window.confirm(
      `确认将 SKU ${product.sku} 的当前库存清零吗？不会删除产品和销量数据。`,
    )
    if (!confirmed) return

    try {
      setDeletingStockSku(product.sku)
      setError(null)

      const response = await fetch('/api/product-sales/delete-inventory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sku: product.sku,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '删除库存失败')
      }

      await refreshAfterMutation()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除库存失败')
    } finally {
      setDeletingStockSku(null)
    }
  }

  const resetGroupForm = () => {
    setGroupFormId(null)
    setGroupFormName('')
    setGroupFormSkus([])
    setGroupFormError(null)
  }

  const handleEditGroup = (group: ProductSalesGroup) => {
    setGroupFormId(group.id)
    setGroupFormName(group.name)
    setGroupFormSkus(group.skus)
    setGroupFormError(null)
  }

  const toggleGroupSku = (sku: string) => {
    setGroupFormSkus((prev) =>
      prev.includes(sku) ? prev.filter((item) => item !== sku) : [...prev, sku],
    )
  }

  const handleSaveGroup = async () => {
    const name = groupFormName.trim()
    if (!name) {
      setGroupFormError('分组名称不能为空')
      return
    }

    try {
      setSavingGroup(true)
      setGroupFormError(null)

      const response = await fetch(
        groupFormId ? `/api/product-sales/groups/${groupFormId}` : '/api/product-sales/groups',
        {
          method: groupFormId ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            skus: groupFormSkus,
          }),
        },
      )
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '保存分组失败')
      }

      await loadGroups()
      await loadTrendData(selectedSku, selectedGroupId, trendRange, false)
      resetGroupForm()
    } catch (err) {
      setGroupFormError(err instanceof Error ? err.message : '保存分组失败')
    } finally {
      setSavingGroup(false)
    }
  }

  const handleDeleteGroup = async (group: ProductSalesGroup) => {
    const confirmed = window.confirm(`确认删除分组“${group.name}”吗？不会删除产品、库存和销量数据。`)
    if (!confirmed) return

    try {
      setDeletingGroupId(group.id)

      const response = await fetch(`/api/product-sales/groups/${group.id}`, {
        method: 'DELETE',
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '删除分组失败')
      }

      await loadGroups()
      await loadTrendData(selectedSku, selectedGroupId, trendRange, false)
      if (groupFormId === group.id) {
        resetGroupForm()
      }
    } catch (err) {
      setGroupFormError(err instanceof Error ? err.message : '删除分组失败')
    } finally {
      setDeletingGroupId(null)
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

  return (
    <PageGuard>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">产品销售库存</h1>
                <p className="text-slate-600 mt-2">查看产品销售趋势和库存现状</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleImportInventory}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60"
                  disabled={importingInventory || importingOrders || loading}
                >
                  {importingInventory ? '正在导入库存表...' : '导入库存表'}
                </button>
                <button
                  onClick={() => handleImportOrders('import')}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
                  disabled={importingOrders || importingInventory || loading}
                >
                  {importingOrders ? '正在导入订单表...' : '导入订单表'}
                </button>
                <button
                  onClick={() => handleImportOrders('dryRun')}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium hover:bg-amber-100 disabled:opacity-60"
                  disabled={importingOrders || importingInventory || loading}
                >
                  {importingOrders ? '测试中...' : '测试解析订单表'}
                </button>
                <button
                  onClick={() => handleImportOrders('checkOnly')}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-sm font-medium hover:bg-sky-100 disabled:opacity-60"
                  disabled={importingOrders || importingInventory || loading}
                >
                  {importingOrders ? '检测中...' : '检测订单 SKU 匹配'}
                </button>
              </div>
            </div>
          </div>

          <input
            ref={inventoryInputRef}
            type="file"
            accept=".xlsx,.xls"
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

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {importResult && (
            <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">库存导入完成</span>
                <span>成功 {importResult.successCount} 条</span>
                <span>更新已有产品 {importResult.updatedExistingCount || 0} 条</span>
                <span>自动补齐 SKU {importResult.autoFilledSkuCount || 0} 条</span>
                <span>自动创建产品 {importResult.autoCreatedCount || 0} 条</span>
                <span>人工确认 {importResult.reviewCount || 0} 条</span>
                <span>失败 {importResult.failureCount} 条</span>
              </div>
              {importResult.hint && (
                <div className="mt-2 text-sm text-amber-700">{importResult.hint}</div>
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

          {inventoryError && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {inventoryError}
            </div>
          )}

          {ordersImportResult && (
            <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">订单导入完成</span>
                <span>阶段 {ordersImportResult.stage || '-'}</span>
                <span>文件 {ordersImportResult.fileName || '-'}</span>
                <span>读取订单行数 {ordersImportResult.totalOrderRows} 行</span>
                <span>解析行数 {ordersImportResult.parsedRows || 0}</span>
                <span>有效行数 {ordersImportResult.validRows || 0}</span>
                <span>唯一 SKU {ordersImportResult.uniqueSkuCount || 0}</span>
                <span>汇总记录 {ordersImportResult.aggregatedRecordCount || 0}</span>
                {typeof ordersImportResult.matchedSkuCount === 'number' && (
                  <span>匹配 SKU {ordersImportResult.matchedSkuCount}</span>
                )}
                {typeof ordersImportResult.missingSkuCount === 'number' && (
                  <span>缺失 SKU {ordersImportResult.missingSkuCount}</span>
                )}
                <span>成功写入 SKU+日期 {ordersImportResult.successCount} 条</span>
                <span>毛销量 {ordersImportResult.totalGrossOrders}</span>
                <span>退货量 {ordersImportResult.totalReturnQty}</span>
                <span>净销量 {ordersImportResult.totalNetOrders}</span>
                <span>取消数量 {ordersImportResult.totalCanceledQty}</span>
                <span>退款金额 {ordersImportResult.totalRefundAmount.toFixed(2)}</span>
                <span>失败 {ordersImportResult.failedCount} 条</span>
              </div>
              {ordersImportResult.missingSkus && ordersImportResult.missingSkus.length > 0 && (
                <div className="mt-2 text-sm text-amber-700">
                  缺失 SKU（前 {ordersImportResult.missingSkus.length} 个）：
                  {ordersImportResult.missingSkus.join(', ')}
                </div>
              )}
              {ordersImportResult.summaryByDate.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <div className="mb-2 text-sm font-medium text-slate-900">按日期汇总</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-3 py-2">日期</th>
                        <th className="px-3 py-2">毛销量</th>
                        <th className="px-3 py-2">退货量</th>
                        <th className="px-3 py-2">净销量</th>
                        <th className="px-3 py-2">取消数量</th>
                        <th className="px-3 py-2">退款金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersImportResult.summaryByDate.map((item) => (
                        <tr key={item.date} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-700">{item.date}</td>
                          <td className="px-3 py-2 text-slate-700">{item.grossOrders}</td>
                          <td className="px-3 py-2 text-slate-700">{item.returnQty}</td>
                          <td className="px-3 py-2 text-slate-700">{item.netOrders}</td>
                          <td className="px-3 py-2 text-slate-700">{item.canceledQty}</td>
                          <td className="px-3 py-2 text-slate-700">{item.refundAmount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {ordersImportResult.summaryBySku.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <div className="mb-2 text-sm font-medium text-slate-900">按 SKU 汇总</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">毛销量</th>
                        <th className="px-3 py-2">退货量</th>
                        <th className="px-3 py-2">净销量</th>
                        <th className="px-3 py-2">取消数量</th>
                        <th className="px-3 py-2">退款金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersImportResult.summaryBySku.map((item) => (
                        <tr key={item.sku} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-700">{item.sku}</td>
                          <td className="px-3 py-2 text-slate-700">{item.grossOrders}</td>
                          <td className="px-3 py-2 text-slate-700">{item.returnQty}</td>
                          <td className="px-3 py-2 text-slate-700">{item.netOrders}</td>
                          <td className="px-3 py-2 text-slate-700">{item.canceledQty}</td>
                          <td className="px-3 py-2 text-slate-700">{item.refundAmount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {ordersImportResult.failedRows.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <div className="mb-2 text-sm font-medium text-slate-900">失败明细</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="px-3 py-2">行号</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Paid Time</th>
                        <th className="px-3 py-2">Quantity</th>
                        <th className="px-3 py-2">退货量</th>
                        <th className="px-3 py-2">失败原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersImportResult.failedRows.map((item, index) => (
                        <tr key={`${item.row}-${item.sku}-${index}`} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-700">{item.row || '-'}</td>
                          <td className="px-3 py-2 text-slate-700">{item.sku || '-'}</td>
                          <td className="px-3 py-2 text-slate-700">{item.paidTime || '-'}</td>
                          <td className="px-3 py-2 text-slate-700">{item.quantity}</td>
                          <td className="px-3 py-2 text-slate-700">{item.returnQty}</td>
                          <td className="px-3 py-2 text-red-600">{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {ordersError && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {ordersError}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
                <p className="mt-4 text-slate-600">加载中...</p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">销售库存趋势</h2>
                    <p className="mt-1 text-sm text-slate-600">{trendTitle}</p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <select
                      value={selectedGroupId}
                      onChange={(event) => {
                        const nextGroupId = event.target.value
                        setSelectedGroupId(nextGroupId)
                        void loadTrendData(selectedSku, nextGroupId, trendRange)
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                    >
                      <option value="">全部分组</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedSku}
                      onChange={(event) => {
                        const nextSku = event.target.value
                        setSelectedSku(nextSku)
                        void loadTrendData(nextSku, selectedGroupId, trendRange)
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                    >
                      <option value="">全部 SKU</option>
                      {skuOptions.map((option) => (
                        <option key={option.sku} value={option.sku}>
                          {option.sku}
                        </option>
                      ))}
                    </select>
                    <div className="inline-flex rounded-lg border border-slate-300 p-1">
                      <button
                        onClick={() => {
                          setTrendRange(7)
                          void loadTrendData(selectedSku, selectedGroupId, 7)
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
                          void loadTrendData(selectedSku, selectedGroupId, 30)
                        }}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                          trendRange === 30 ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        最近 30 天
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setGroupManagerOpen(true)
                        resetGroupForm()
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 hover:bg-slate-50"
                    >
                      分组管理
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                    <div className="mb-3">
                      <div className="text-sm font-medium text-slate-900">每日销量曲线</div>
                      <div className="text-xs text-slate-500">{trendTitle}</div>
                    </div>
                    <div className="h-64">
                      {trendLoading ? (
                        <div className="flex h-full items-center justify-center text-sm text-slate-500">
                          趋势加载中...
                        </div>
                      ) : (
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
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                    <div className="mb-3">
                      <div className="text-sm font-medium text-slate-900">每日剩余库存曲线</div>
                      <div className="text-xs text-slate-500">缺失快照时沿用最近一次库存；完全没有快照时使用当前库存</div>
                    </div>
                    <div className="h-64">
                      {trendLoading ? (
                        <div className="flex h-full items-center justify-center text-sm text-slate-500">
                          趋势加载中...
                        </div>
                      ) : (
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
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {stockEditTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                  <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">编辑库存</h3>
                        <p className="mt-1 text-sm text-slate-600">SKU：{stockEditTarget.sku}</p>
                        <p className="mt-1 text-sm text-slate-600">当前库存：{stockEditTarget.stock}</p>
                      </div>
                      <button
                        onClick={() => {
                          if (editingStockSku) return
                          setStockEditTarget(null)
                          setStockEditError(null)
                        }}
                        className="text-sm text-slate-500 hover:text-slate-700"
                        disabled={Boolean(editingStockSku)}
                      >
                        关闭
                      </button>
                    </div>

                    <div className="mt-5 space-y-4">
                      <div>
                        <div className="mb-2 text-sm font-medium text-slate-900">修改方式</div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          {[
                            { value: 'set', label: '设置为指定库存' },
                            { value: 'increase', label: '增加库存' },
                            { value: 'decrease', label: '减少库存' },
                          ].map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                const nextMode = option.value as StockEditMode
                                setStockEditMode(nextMode)
                                setStockEditValue(nextMode === 'set' ? String(stockEditTarget.stock) : '')
                                setStockEditError(null)
                              }}
                              className={`rounded-lg border px-3 py-2 text-sm ${
                                stockEditMode === option.value
                                  ? 'border-slate-900 bg-slate-900 text-white'
                                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                              }`}
                              disabled={Boolean(editingStockSku)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-900">
                          {stockEditMode === 'set' ? '新的库存数值' : '调整数量'}
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          value={stockEditValue}
                          onChange={(event) => {
                            setStockEditValue(event.target.value)
                            setStockEditError(null)
                          }}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                          placeholder={stockEditMode === 'set' ? '请输入新的库存数值' : '请输入调整数量'}
                          disabled={Boolean(editingStockSku)}
                        />
                      </div>

                      {stockEditError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                          {stockEditError}
                        </div>
                      )}

                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => {
                            if (editingStockSku) return
                            setStockEditTarget(null)
                            setStockEditError(null)
                          }}
                          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          disabled={Boolean(editingStockSku)}
                        >
                          取消
                        </button>
                        <button
                          onClick={handleSaveStock}
                          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                          disabled={Boolean(editingStockSku)}
                        >
                          {editingStockSku ? '保存中...' : '保存'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {groupManagerOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                  <div className="w-full max-w-5xl rounded-xl bg-white p-6 shadow-xl">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">分组管理</h3>
                        <p className="mt-1 text-sm text-slate-600">自定义分组名称，并手动选择多个 SKU 归入分组。</p>
                      </div>
                      <button
                        onClick={() => {
                          if (savingGroup) return
                          setGroupManagerOpen(false)
                          resetGroupForm()
                        }}
                        className="text-sm text-slate-500 hover:text-slate-700"
                        disabled={savingGroup}
                      >
                        关闭
                      </button>
                    </div>

                    <div className="mt-5 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                      <div className="rounded-lg border border-slate-200 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="text-sm font-semibold text-slate-900">已有分组</div>
                          <button
                            onClick={resetGroupForm}
                            className="text-xs text-slate-600 hover:text-slate-900"
                          >
                            新建分组
                          </button>
                        </div>
                        <div className="space-y-2">
                          {groups.length === 0 ? (
                            <div className="text-sm text-slate-500">暂无分组</div>
                          ) : (
                            groups.map((group) => (
                              <div key={group.id} className="rounded-lg border border-slate-200 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-medium text-slate-900">{group.name}</div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {group.skus.length} 个 SKU
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleEditGroup(group)}
                                      className="text-xs text-slate-600 hover:text-slate-900"
                                    >
                                      编辑
                                    </button>
                                    <button
                                      onClick={() => void handleDeleteGroup(group)}
                                      className="text-xs text-red-600 hover:text-red-700 disabled:opacity-60"
                                      disabled={deletingGroupId === group.id}
                                    >
                                      {deletingGroupId === group.id ? '删除中...' : '删除'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 p-4">
                        <div className="mb-3 text-sm font-semibold text-slate-900">
                          {groupFormId ? '编辑分组' : '新建分组'}
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-900">分组名称</label>
                            <input
                              value={groupFormName}
                              onChange={(event) => {
                                setGroupFormName(event.target.value)
                                setGroupFormError(null)
                              }}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                              placeholder="例如：日常主推"
                              disabled={savingGroup}
                            />
                          </div>

                          <div>
                            <div className="mb-2 text-sm font-medium text-slate-900">选择 SKU</div>
                            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 p-3">
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {skuOptions.map((option) => (
                                  <label key={option.sku} className="flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                      type="checkbox"
                                      checked={groupFormSkus.includes(option.sku)}
                                      onChange={() => toggleGroupSku(option.sku)}
                                      disabled={savingGroup}
                                    />
                                    <span>{option.sku}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>

                          {groupFormError && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                              {groupFormError}
                            </div>
                          )}

                          <div className="flex justify-end gap-3">
                            <button
                              onClick={resetGroupForm}
                              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                              disabled={savingGroup}
                            >
                              重置
                            </button>
                            <button
                              onClick={() => void handleSaveGroup()}
                              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                              disabled={savingGroup}
                            >
                              {savingGroup ? '保存中...' : '保存分组'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {summary && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-blue-500">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-slate-600 text-sm font-medium">今日销量</p>
                          <p className="text-3xl font-bold text-slate-900 mt-2">{summary.todaySales}</p>
                        </div>
                        <div className="text-4xl text-blue-500 opacity-20">📊</div>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-green-500">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-slate-600 text-sm font-medium">昨日销量</p>
                          <p className="text-3xl font-bold text-slate-900 mt-2">{summary.yesterdaySales}</p>
                        </div>
                        <div className="text-4xl text-green-500 opacity-20">📈</div>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-purple-500">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-slate-600 text-sm font-medium">近7天销量</p>
                          <p className="text-3xl font-bold text-slate-900 mt-2">{summary.weekSales}</p>
                        </div>
                        <div className="text-4xl text-purple-500 opacity-20">📅</div>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-orange-500">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-slate-600 text-sm font-medium">近30天销量</p>
                          <p className="text-3xl font-bold text-slate-900 mt-2">{summary.monthSales}</p>
                        </div>
                        <div className="text-4xl text-orange-500 opacity-20">📊</div>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-indigo-500">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-slate-600 text-sm font-medium">当前总库存</p>
                          <p className="text-3xl font-bold text-slate-900 mt-2">{summary.totalStock}</p>
                        </div>
                        <div className="text-4xl text-indigo-500 opacity-20">📦</div>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-yellow-500">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-slate-600 text-sm font-medium">低库存产品数</p>
                          <p className="text-3xl font-bold text-slate-900 mt-2">{summary.lowStockCount}</p>
                        </div>
                        <div className="text-4xl text-yellow-500 opacity-20">⚠️</div>
                      </div>
                    </div>

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

                  <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
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
                              <td colSpan={9} className="px-6 py-8 text-center text-slate-500">
                                暂无产品数据
                              </td>
                            </tr>
                          ) : (
                            sortedProducts.map((product) => (
                              <tr key={product.id} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 text-sm font-medium text-slate-900">{product.sku}</td>
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
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() => handleEditStock(product)}
                                      className="inline-flex items-center justify-center rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                      disabled={editingStockSku === product.sku || deletingStockSku === product.sku || product.sku === '-'}
                                    >
                                      {editingStockSku === product.sku ? '保存中...' : '编辑库存'}
                                    </button>
                                    <button
                                      onClick={() => void handleDeleteInventory(product)}
                                      className="inline-flex items-center justify-center rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                      disabled={deletingStockSku === product.sku || editingStockSku === product.sku || product.sku === '-'}
                                    >
                                      {deletingStockSku === product.sku ? '删除中...' : '删除库存'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </PageGuard>
  )
}
