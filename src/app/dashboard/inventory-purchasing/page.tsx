'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { mapOldRole } from '@/lib/pagePermissions'

type SummaryItem = {
  productId: string
  sku: string
  productName: string
  currentTotalStock: number | null
  previousTotalStock: number | null
  changeQty: number | null
  latestSnapshotAt: string | null
  source: 'snapshot' | 'product_stock_fallback' | 'none'
}

type ImportBatch = {
  id: string
  fileName: string
  fileHash: string
  stockCapturedAt: string
  importedAt: string | null
  rowCount: number
  matchedCount: number
  unmatchedCount: number
  status: string
  note: string | null
  createdAt: string
  updatedAt: string
}

type MatchedRow = {
  rowNumber: number
  inputSku: string
  canonicalSku: string
  productId: string
  productName: string
  totalQty: number
  previousTotalQty: number | null
  diffQty: number | null
}

type UnmatchedRow = {
  rowNumber: number
  inputSku: string
  totalQty: number | null
  reason: string
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatQty(value: number | null) {
  return value === null || value === undefined ? '—' : value.toLocaleString('zh-CN')
}

function formatChange(value: number | null) {
  if (value === null || value === undefined) return '—'
  if (value > 0) return `+${value}`
  return String(value)
}

function getDefaultCapturedAt() {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60 * 1000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16)
}

export default function InventoryPurchasingPage() {
  const { data: session } = useSession()
  const role = mapOldRole((session?.user as { role?: string } | undefined)?.role)
  const canManageInventory = role === 'admin' || role === 'boss'
  const [activeTab, setActiveTab] = useState<'overview' | 'import' | 'ordering'>('overview')
  const [summaryItems, setSummaryItems] = useState<SummaryItem[]>([])
  const [summary, setSummary] = useState({ skuCount: 0, currentTotalStock: 0, changedSkuCount: 0, snapshotBackedSkuCount: 0 })
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [previewBatch, setPreviewBatch] = useState<ImportBatch | null>(null)
  const [matchedRows, setMatchedRows] = useState<MatchedRow[]>([])
  const [unmatchedRows, setUnmatchedRows] = useState<UnmatchedRow[]>([])
  const [ignoreUnmatched, setIgnoreUnmatched] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [stockCapturedAt, setStockCapturedAt] = useState(getDefaultCapturedAt)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const sortedSummaryItems = useMemo(() => {
    return [...summaryItems].sort((a, b) => (a.sku || '').localeCompare(b.sku || ''))
  }, [summaryItems])

  async function loadSummary() {
    const response = await fetch('/api/inventory-purchasing/summary')
    if (!response.ok) throw new Error('库存汇总加载失败')
    const data = await response.json()
    setSummary(data.summary)
    setSummaryItems(data.items || [])
  }

  async function loadBatches() {
    const response = await fetch('/api/inventory-purchasing/import-batches')
    if (!response.ok) throw new Error('导入批次加载失败')
    const data = await response.json()
    setBatches(data.batches || [])
  }

  async function refresh() {
    setError('')
    try {
      await Promise.all([loadSummary(), loadBatches()])
    } catch (err) {
      setError(err instanceof Error ? err.message : '页面数据加载失败')
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!canManageInventory) {
      setError('仅管理员/老板可管理库存导入。')
      return
    }
    if (!file) {
      setError('请先选择库存文件')
      return
    }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.set('file', file)
      formData.set('stockCapturedAt', stockCapturedAt)
      formData.set('note', note)
      const response = await fetch('/api/inventory-purchasing/import-batches', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '生成预览失败')
      setPreviewBatch(data.batch)
      setMatchedRows(data.matchedRows || [])
      setUnmatchedRows(data.unmatchedRows || [])
      setIgnoreUnmatched(false)
      setMessage(data.duplicateConfirmedBatch ? '预览已生成，但相同文件已确认导入过，不能再次确认。' : '预览已生成，请核对后确认导入。')
      await loadBatches()
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成预览失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (!previewBatch) return
    if (!canManageInventory) {
      setError('仅管理员/老板可确认库存导入。')
      return
    }
    if (unmatchedRows.length > 0 && !ignoreUnmatched) {
      setError('存在未匹配 SKU。请勾选“确认忽略未匹配 SKU”后再导入。')
      return
    }
    if (!window.confirm('确认导入该批库存快照？导入后不会修改 Product.stock，只会写入平台库存快照。')) {
      return
    }

    setLoading(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/inventory-purchasing/import-batches/${previewBatch.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ignoreUnmatched }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '确认导入失败')
      setMessage(`导入成功，写入 ${data.importedSnapshotCount || 0} 条库存快照。`)
      setPreviewBatch(null)
      setMatchedRows([])
      setUnmatchedRows([])
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '确认导入失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleRollback(batchId: string) {
    if (!canManageInventory) {
      setError('仅管理员/老板可回滚库存批次。')
      return
    }
    if (!window.confirm('确认回滚该批次？快照记录会保留，但销售库存和趋势计算会忽略该批次。')) {
      return
    }
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/inventory-purchasing/import-batches/${batchId}/rollback`, {
        method: 'POST',
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '回滚失败')
      setMessage('批次已回滚。')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '回滚失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleViewBatch(batchId: string) {
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/inventory-purchasing/import-batches/${batchId}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '读取批次详情失败')
      setPreviewBatch(data.batch)
      setMatchedRows(data.matchedRows || [])
      setUnmatchedRows(data.unmatchedRows || [])
      setActiveTab('import')
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取批次详情失败')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-semibold text-pink-600">Inventory & Purchasing Center V1</p>
          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">库存与订货中心</h1>
              <p className="mt-2 text-sm text-slate-600">
                第一阶段只管理库存快照导入与校准；采购订货不会修改 TikTok 可售库存，也不会写入销售库存主口径。
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              {(['overview', 'import', 'ordering'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-full px-4 py-2 font-medium transition ${
                    activeTab === tab
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tab === 'overview' ? '库存概览' : tab === 'import' ? '库存导入' : '订货/在途'}
                </button>
              ))}
            </div>
          </div>
        </header>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
        {!canManageInventory && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            仅管理员/老板可管理库存导入；当前账号可以查看库存总览、批次历史和批次详情。
          </div>
        )}

        {activeTab === 'overview' && (
          <section className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-medium text-slate-500">SKU 数</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{summary.skuCount}</p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-medium text-slate-500">当前总库存</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{summary.currentTotalStock}</p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-medium text-slate-500">有快照支撑 SKU</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{summary.snapshotBackedSkuCount}</p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-medium text-slate-500">较上次快照变化 SKU</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{summary.changedSkuCount}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-slate-900">SKU 实时库存校准</h2>
                <p className="mt-1 text-sm text-slate-500">只展示快照口径库存；没有有效快照时暂时显示历史 Product.stock fallback。</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">产品</th>
                      <th className="px-4 py-3">当前总库存</th>
                      <th className="px-4 py-3">上次快照库存</th>
                      <th className="px-4 py-3">变化</th>
                      <th className="px-4 py-3">最新快照时间</th>
                      <th className="px-4 py-3">来源</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedSummaryItems.map((item) => (
                      <tr key={item.productId} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">{item.sku}</td>
                        <td className="px-4 py-3 text-slate-700">{item.productName}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{formatQty(item.currentTotalStock)}</td>
                        <td className="px-4 py-3 text-slate-600">{formatQty(item.previousTotalStock)}</td>
                        <td className={`px-4 py-3 font-medium ${item.changeQty && item.changeQty < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatChange(item.changeQty)}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDateTime(item.latestSnapshotAt)}</td>
                        <td className="px-4 py-3 text-slate-500">{item.source === 'snapshot' ? '有效快照' : item.source === 'product_stock_fallback' ? '历史 Product.stock' : '无数据'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'import' && (
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-6">
              <form onSubmit={handlePreview} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">上传库存文件生成预览</h2>
                <p className="mt-1 text-sm text-slate-500">支持含“商家 SKU”和“总库存”的 Excel/CSV；只做严格 SKU 匹配。</p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">库存文件</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      disabled={!canManageInventory}
                      onChange={(event) => setFile(event.target.files?.[0] || null)}
                      className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">库存截点时间</span>
                    <input
                      type="datetime-local"
                      value={stockCapturedAt}
                      disabled={!canManageInventory}
                      onChange={(event) => setStockCapturedAt(event.target.value)}
                      className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-slate-700">备注</span>
                    <input
                      value={note}
                      disabled={!canManageInventory}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="例如：8月平台库存校准"
                      className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={loading || !canManageInventory}
                  className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {!canManageInventory ? '仅管理员/老板可上传' : loading ? '处理中...' : '生成导入预览'}
                </button>
              </form>

              {previewBatch && (
                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">导入预览</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {previewBatch.fileName}｜匹配 {matchedRows.length} 行｜未匹配 {unmatchedRows.length} 行
                      </p>
                    </div>
                    {previewBatch.status === 'PREVIEW' && (
                      <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={!canManageInventory || loading || (unmatchedRows.length > 0 && !ignoreUnmatched)}
                        className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {canManageInventory ? '确认导入快照' : '仅管理员/老板可确认'}
                      </button>
                    )}
                  </div>

                  {unmatchedRows.length > 0 && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-sm font-semibold text-amber-800">存在未匹配 SKU，默认阻止确认导入。</p>
                      <label className="mt-3 flex items-center gap-2 text-sm text-amber-900">
                        <input type="checkbox" checked={ignoreUnmatched} onChange={(event) => setIgnoreUnmatched(event.target.checked)} />
                        我确认忽略未匹配 SKU，本批次只导入已匹配行
                      </label>
                    </div>
                  )}

                  <div className="mt-5 overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">行号</th>
                          <th className="px-3 py-2">原 SKU</th>
                          <th className="px-3 py-2">Canonical SKU</th>
                          <th className="px-3 py-2">产品</th>
                          <th className="px-3 py-2">新库存</th>
                          <th className="px-3 py-2">旧库存</th>
                          <th className="px-3 py-2">变化</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {matchedRows.map((row) => (
                          <tr key={`${row.rowNumber}-${row.canonicalSku}`}>
                            <td className="px-3 py-2 text-slate-500">{row.rowNumber}</td>
                            <td className="px-3 py-2">{row.inputSku}</td>
                            <td className="px-3 py-2 font-semibold text-slate-900">{row.canonicalSku}</td>
                            <td className="px-3 py-2 text-slate-700">{row.productName}</td>
                            <td className="px-3 py-2 font-medium">{row.totalQty}</td>
                            <td className="px-3 py-2">{formatQty(row.previousTotalQty)}</td>
                            <td className="px-3 py-2">{formatChange(row.diffQty)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {unmatchedRows.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-sm font-semibold text-slate-900">未匹配行</h3>
                      <div className="mt-2 overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                          <tbody className="divide-y divide-slate-100">
                            {unmatchedRows.map((row) => (
                              <tr key={`${row.rowNumber}-${row.inputSku}`}>
                                <td className="px-3 py-2 text-slate-500">第 {row.rowNumber} 行</td>
                                <td className="px-3 py-2 font-medium">{row.inputSku}</td>
                                <td className="px-3 py-2">{formatQty(row.totalQty)}</td>
                                <td className="px-3 py-2 text-amber-700">{row.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <aside className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">导入批次历史</h2>
              <div className="mt-4 space-y-3">
                {batches.map((batch) => (
                  <div key={batch.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{batch.fileName}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDateTime(batch.stockCapturedAt)}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        batch.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' :
                        batch.status === 'ROLLED_BACK' ? 'bg-slate-100 text-slate-500' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {batch.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      匹配 {batch.matchedCount}｜未匹配 {batch.unmatchedCount}｜总行 {batch.rowCount}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => handleViewBatch(batch.id)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200">
                        查看详情
                      </button>
                      {batch.status === 'CONFIRMED' && (
                        <button
                          type="button"
                          onClick={() => handleRollback(batch.id)}
                          disabled={!canManageInventory}
                          className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {canManageInventory ? '回滚' : '仅管理员/老板可回滚'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {batches.length === 0 && <p className="text-sm text-slate-500">暂无导入批次。</p>}
              </div>
            </aside>
          </section>
        )}

        {activeTab === 'ordering' && (
          <section className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
            <p className="text-lg font-semibold text-slate-900">订货/在途管理将在第二阶段开发</p>
            <p className="mt-2 text-sm text-slate-500">本阶段不创建采购单、不登记到货、不影响现货库存。</p>
          </section>
        )}
      </div>
    </div>
  )
}
