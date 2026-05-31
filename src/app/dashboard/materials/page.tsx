'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'

interface MaterialItem {
  id: string
  name: string
  unit: string
  initialQty: number
  currentQty: number
  warningQty: number
  note: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface MaterialSummary {
  totalCount: number
  lowStockCount: number
  outOfStockCount: number
  totalCurrentQty: number
  monthlyConsumeCount: number
  monthlyReplenishCount: number
}

interface MaterialTransaction {
  id: string
  materialId: string
  materialName: string
  type: string
  quantity: number
  beforeQty: number
  afterQty: number
  transactionDate: string
  reason: string
  note: string
  createdAt: string
  updatedAt: string
}

interface MaterialImportFailure {
  row: number
  name: string
  reason: string
}

interface MaterialImportResult {
  totalRows: number
  createdCount: number
  updatedCount: number
  skippedCount: number
  failureCount: number
  failures: MaterialImportFailure[]
}

type MaterialFormMode = 'create' | 'edit'
type TransactionMode = 'consume' | 'replenish' | 'adjust'

function getTodayInputValue() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatQty(value: number) {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function getStatus(item: MaterialItem) {
  if (item.currentQty <= 0) return '缺货'
  if (item.currentQty <= item.warningQty) return '低库存'
  return '正常'
}

function getStatusBadgeClass(status: string) {
  if (status === '缺货') return 'bg-rose-100 text-rose-700 border border-rose-200'
  if (status === '低库存') return 'bg-amber-100 text-amber-700 border border-amber-200'
  return 'bg-emerald-100 text-emerald-700 border border-emerald-200'
}

function getTransactionLabel(type: string) {
  switch (type) {
    case 'init':
      return '初始库存'
    case 'consume':
      return '使用消耗'
    case 'replenish':
      return '补充入库'
    case 'adjust':
      return '调整库存'
    case 'damage':
      return '损耗报废'
    default:
      return type
  }
}

function getTransactionTextClass(type: string, quantity: number) {
  if (type === 'consume' || type === 'damage' || quantity < 0) return 'text-rose-700'
  if (type === 'replenish' || type === 'init' || quantity > 0) return 'text-emerald-700'
  return 'text-slate-700'
}

export default function MaterialsPage() {
  const importInputRef = useRef<HTMLInputElement>(null)

  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [summary, setSummary] = useState<MaterialSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<MaterialFormMode>('create')
  const [formError, setFormError] = useState<string | null>(null)
  const [savingForm, setSavingForm] = useState(false)
  const [materialForm, setMaterialForm] = useState({
    id: '',
    name: '',
    unit: '',
    initialQty: '',
    warningQty: '',
    note: '',
  })

  const [transactionOpen, setTransactionOpen] = useState(false)
  const [transactionMode, setTransactionMode] = useState<TransactionMode>('consume')
  const [transactionTarget, setTransactionTarget] = useState<MaterialItem | null>(null)
  const [transactionError, setTransactionError] = useState<string | null>(null)
  const [savingTransaction, setSavingTransaction] = useState(false)
  const [transactionForm, setTransactionForm] = useState({
    quantity: '',
    transactionDate: getTodayInputValue(),
    reason: '',
    note: '',
  })

  const [expandedMaterialIds, setExpandedMaterialIds] = useState<string[]>([])
  const [transactionsByMaterialId, setTransactionsByMaterialId] = useState<Record<string, MaterialTransaction[]>>({})
  const [loadingTransactionIds, setLoadingTransactionIds] = useState<string[]>([])
  const [deletingMaterialId, setDeletingMaterialId] = useState<string | null>(null)

  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<MaterialImportResult | null>(null)

  const closeFormModal = useCallback(() => {
    if (savingForm) return
    setFormOpen(false)
    setFormError(null)
  }, [savingForm])

  const closeTransactionModal = useCallback(() => {
    if (savingTransaction) return
    setTransactionOpen(false)
    setTransactionTarget(null)
    setTransactionError(null)
  }, [savingTransaction])

  const loadMaterials = async () => {
    const response = await fetch('/api/materials')
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || '获取耗材数据失败')
    }

    setMaterials(Array.isArray(data.materials) ? data.materials : [])
    setSummary(data.summary || null)
  }

  const loadTransactions = async (materialId: string) => {
    setLoadingTransactionIds((prev) => (prev.includes(materialId) ? prev : [...prev, materialId]))
    try {
      const response = await fetch(`/api/materials/transactions?materialId=${encodeURIComponent(materialId)}`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || '获取耗材记录失败')
      }

      setTransactionsByMaterialId((prev) => ({
        ...prev,
        [materialId]: Array.isArray(data.transactions) ? data.transactions : [],
      }))
    } finally {
      setLoadingTransactionIds((prev) => prev.filter((id) => id !== materialId))
    }
  }

  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true)
        await loadMaterials()
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : '获取耗材数据失败')
      } finally {
        setLoading(false)
      }
    }

    void initialize()
  }, [])

  useEffect(() => {
    if (!formOpen && !transactionOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      if (transactionOpen) {
        closeTransactionModal()
        return
      }

      if (formOpen) {
        closeFormModal()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeFormModal, closeTransactionModal, formOpen, transactionOpen])

  const openCreateModal = () => {
    setFormMode('create')
    setMaterialForm({
      id: '',
      name: '',
      unit: '',
      initialQty: '',
      warningQty: '',
      note: '',
    })
    setFormError(null)
    setFormOpen(true)
  }

  const openEditModal = (item: MaterialItem) => {
    setFormMode('edit')
    setMaterialForm({
      id: item.id,
      name: item.name,
      unit: item.unit || '',
      initialQty: formatQty(item.initialQty),
      warningQty: formatQty(item.warningQty),
      note: item.note || '',
    })
    setFormError(null)
    setFormOpen(true)
  }

  const handleSaveMaterial = async () => {
    const name = materialForm.name.trim()
    const unit = materialForm.unit.trim()
    const initialQty = Number(materialForm.initialQty || 0)
    const warningQty = Number(materialForm.warningQty || 0)
    const note = materialForm.note.trim()

    if (!name) {
      setFormError('品名不能为空')
      return
    }

    if (formMode === 'create' && (!Number.isFinite(initialQty) || initialQty < 0)) {
      setFormError('初始数量必须是大于等于 0 的数字')
      return
    }

    if (!Number.isFinite(warningQty) || warningQty < 0) {
      setFormError('预警数量必须是大于等于 0 的数字')
      return
    }

    try {
      setSavingForm(true)
      setFormError(null)
      setError(null)

      const response = await fetch('/api/materials', {
        method: formMode === 'create' ? 'POST' : 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formMode === 'create'
          ? {
              name,
              unit,
              initialQty,
              warningQty,
              note,
            }
          : {
              id: materialForm.id,
              name,
              unit,
              warningQty,
              note,
            }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || '保存耗材失败')
      }

      await loadMaterials()
      setFormOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存耗材失败'
      setFormError(message)
      setError(message)
    } finally {
      setSavingForm(false)
    }
  }

  const openTransactionModal = (mode: TransactionMode, item: MaterialItem) => {
    setTransactionMode(mode)
    setTransactionTarget(item)
    setTransactionForm({
      quantity: mode === 'adjust' ? formatQty(item.currentQty) : '',
      transactionDate: getTodayInputValue(),
      reason: '',
      note: '',
    })
    setTransactionError(null)
    setTransactionOpen(true)
  }

  const handleSaveTransaction = async () => {
    if (!transactionTarget) return

    const quantity = Number(transactionForm.quantity)
    const transactionDate = transactionForm.transactionDate
    const reason = transactionForm.reason.trim()
    const note = transactionForm.note.trim()

    if (!Number.isFinite(quantity)) {
      setTransactionError(transactionMode === 'adjust' ? '调整后数量必须是有效数字' : '数量必须是有效数字')
      return
    }

    if ((transactionMode === 'consume' || transactionMode === 'replenish') && quantity <= 0) {
      setTransactionError('数量必须大于 0')
      return
    }

    if (transactionMode === 'adjust' && quantity < 0) {
      setTransactionError('调整后数量不能小于 0')
      return
    }

    if (!transactionDate) {
      setTransactionError('请选择变更日期')
      return
    }

    try {
      setSavingTransaction(true)
      setTransactionError(null)
      setError(null)

      const response = await fetch('/api/materials/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          materialId: transactionTarget.id,
          type: transactionMode,
          quantity,
          transactionDate,
          reason,
          note,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || '保存库存变更失败')
      }

      await loadMaterials()
      await loadTransactions(transactionTarget.id)
      setTransactionOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存库存变更失败'
      setTransactionError(message)
      setError(message)
    } finally {
      setSavingTransaction(false)
    }
  }

  const handleDeleteMaterial = async (item: MaterialItem) => {
    const confirmed = window.confirm(`确认停用这个耗材吗？历史消耗记录不会删除。\n\n${item.name}`)
    if (!confirmed) return

    try {
      setDeletingMaterialId(item.id)
      setError(null)

      const response = await fetch('/api/materials', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: item.id }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || '停用耗材失败')
      }

      await loadMaterials()
      setExpandedMaterialIds((prev) => prev.filter((id) => id !== item.id))
    } catch (err) {
      const message = err instanceof Error ? err.message : '停用耗材失败'
      setError(message)
    } finally {
      setDeletingMaterialId(null)
    }
  }

  const toggleMaterialTransactions = async (materialId: string) => {
    const expanded = expandedMaterialIds.includes(materialId)
    if (expanded) {
      setExpandedMaterialIds((prev) => prev.filter((id) => id !== materialId))
      return
    }

    setExpandedMaterialIds((prev) => [...prev, materialId])
    if (!transactionsByMaterialId[materialId]) {
      try {
        await loadTransactions(materialId)
      } catch (err) {
        setError(err instanceof Error ? err.message : '获取耗材记录失败')
      }
    }
  }

  const handleImportClick = () => {
    importInputRef.current?.click()
  }

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setImporting(true)
      setError(null)
      setImportResult(null)

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/materials/import', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || '导入物料表失败')
      }

      setImportResult({
        totalRows: data.totalRows || 0,
        createdCount: data.createdCount || 0,
        updatedCount: data.updatedCount || 0,
        skippedCount: data.skippedCount || 0,
        failureCount: data.failureCount || 0,
        failures: Array.isArray(data.failures) ? data.failures : [],
      })
      await loadMaterials()
    } catch (err) {
      const message = err instanceof Error ? err.message : '导入物料表失败'
      setError(message)
    } finally {
      event.target.value = ''
      setImporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">耗材管理</h1>
              <p className="mt-2 text-slate-600">管理耗材库存、消耗、补充和调整记录。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleImportClick}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-60"
                disabled={importing}
              >
                {importing ? '导入中...' : '导入物料表'}
              </button>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                新增耗材
              </button>
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500">导入物料表支持 CSV / XLSX / XLS。</div>
        </div>

        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleImportFileChange}
        />

        {error && (
          <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {importResult && (
          <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-4 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">物料表导入完成</span>
              <span>读取行数 {importResult.totalRows}</span>
              <span>新增耗材 {importResult.createdCount}</span>
              <span>更新耗材 {importResult.updatedCount}</span>
              <span>跳过行数 {importResult.skippedCount}</span>
              <span>失败 {importResult.failureCount}</span>
            </div>
            {importResult.failures.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="px-3 py-2">行号</th>
                      <th className="px-3 py-2">品名</th>
                      <th className="px-3 py-2">失败原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.failures.map((item, index) => (
                      <tr key={`${item.row}-${item.name}-${index}`} className="border-b border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{item.row}</td>
                        <td className="px-3 py-2 text-slate-700">{item.name || '-'}</td>
                        <td className="px-3 py-2 text-rose-700">{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {summary && (
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg bg-white p-6 shadow-sm border-l-4 border-slate-900">
              <p className="text-sm font-medium text-slate-600">耗材总数</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{summary.totalCount}</p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow-sm border-l-4 border-amber-500">
              <p className="text-sm font-medium text-slate-600">低库存数量</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{summary.lowStockCount}</p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow-sm border-l-4 border-indigo-500">
              <p className="text-sm font-medium text-slate-600">当前总库存项</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{formatQty(summary.totalCurrentQty)}</p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow-sm border-l-4 border-rose-500">
              <p className="text-sm font-medium text-slate-600">本月消耗次数</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{summary.monthlyConsumeCount}</p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow-sm border-l-4 border-emerald-500">
              <p className="text-sm font-medium text-slate-600">本月补充次数</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{summary.monthlyReplenishCount}</p>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-3 text-sm text-slate-700">
            耗材库存只会通过“使用消耗 / 补充入库 / 调整库存”改变，编辑基础信息不会直接修改剩余数量。
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-6 py-3 text-left font-semibold text-slate-900">品名</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-900">单位</th>
                  <th className="px-6 py-3 text-center font-semibold text-slate-900">当前剩余数量</th>
                  <th className="px-6 py-3 text-center font-semibold text-slate-900">预警数量</th>
                  <th className="px-6 py-3 text-center font-semibold text-slate-900">状态</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-900">备注</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-900">更新时间</th>
                  <th className="px-6 py-3 text-center font-semibold text-slate-900">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-slate-500">
                      加载中...
                    </td>
                  </tr>
                ) : materials.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-slate-500">
                      暂无耗材数据
                    </td>
                  </tr>
                ) : (
                  materials.map((item) => {
                    const status = getStatus(item)
                    const isExpanded = expandedMaterialIds.includes(item.id)
                    const transactions = transactionsByMaterialId[item.id] || []
                    const isLoadingTransactions = loadingTransactionIds.includes(item.id)

                    return (
                      <Fragment key={item.id}>
                        <tr className="border-b border-slate-200 hover:bg-slate-50">
                          <td className="px-6 py-4 font-medium text-slate-900">{item.name}</td>
                          <td className="px-6 py-4 text-slate-700">{item.unit || '-'}</td>
                          <td className="px-6 py-4 text-center font-semibold text-slate-900">{formatQty(item.currentQty)}</td>
                          <td className="px-6 py-4 text-center text-slate-700">{formatQty(item.warningQty)}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(status)}`}>
                              {status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-600">{item.note || '-'}</td>
                          <td className="px-6 py-4 text-slate-600">{new Date(item.updatedAt).toLocaleString('zh-CN')}</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap justify-center gap-2">
                              <button
                                onClick={() => openTransactionModal('consume', item)}
                                className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                              >
                                使用消耗
                              </button>
                              <button
                                onClick={() => openTransactionModal('replenish', item)}
                                className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                              >
                                补充入库
                              </button>
                              <button
                                onClick={() => openTransactionModal('adjust', item)}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                调整库存
                              </button>
                              <button
                                onClick={() => openEditModal(item)}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                编辑
                              </button>
                              <button
                                onClick={() => void handleDeleteMaterial(item)}
                                className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                                disabled={deletingMaterialId === item.id}
                              >
                                {deletingMaterialId === item.id ? '停用中...' : '删除'}
                              </button>
                              <button
                                onClick={() => void toggleMaterialTransactions(item.id)}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                {isExpanded ? '收起记录' : '查看记录'}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-slate-200 bg-slate-50/70">
                            <td colSpan={8} className="px-6 py-5">
                              <div className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="mb-4 flex flex-wrap items-center gap-4">
                                  <div className="text-sm font-semibold text-slate-900">{item.name} 的变更记录</div>
                                  <div className="text-xs text-slate-500">
                                    初始库存 {formatQty(item.initialQty)}，当前库存 {formatQty(item.currentQty)}
                                  </div>
                                </div>

                                {isLoadingTransactions ? (
                                  <div className="py-8 text-center text-sm text-slate-500">记录加载中...</div>
                                ) : transactions.length === 0 ? (
                                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                                    暂无变更记录
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="border-b border-slate-200 text-left text-slate-500">
                                          <th className="px-3 py-2">日期</th>
                                          <th className="px-3 py-2">类型</th>
                                          <th className="px-3 py-2">变更数量</th>
                                          <th className="px-3 py-2">变更前</th>
                                          <th className="px-3 py-2">变更后</th>
                                          <th className="px-3 py-2">原因</th>
                                          <th className="px-3 py-2">备注</th>
                                          <th className="px-3 py-2">创建时间</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {transactions.map((transaction) => (
                                          <tr key={transaction.id} className="border-b border-slate-100">
                                            <td className="px-3 py-2 text-slate-700">
                                              {new Date(transaction.transactionDate).toLocaleDateString('zh-CN')}
                                            </td>
                                            <td className="px-3 py-2 text-slate-700">{getTransactionLabel(transaction.type)}</td>
                                            <td className={`px-3 py-2 font-medium ${getTransactionTextClass(transaction.type, transaction.quantity)}`}>
                                              {transaction.quantity > 0 ? `+${formatQty(transaction.quantity)}` : formatQty(transaction.quantity)}
                                            </td>
                                            <td className="px-3 py-2 text-slate-700">{formatQty(transaction.beforeQty)}</td>
                                            <td className="px-3 py-2 text-slate-700">{formatQty(transaction.afterQty)}</td>
                                            <td className="px-3 py-2 text-slate-700">{transaction.reason || '-'}</td>
                                            <td className="px-3 py-2 text-slate-500">{transaction.note || '-'}</td>
                                            <td className="px-3 py-2 text-slate-500">
                                              {new Date(transaction.createdAt).toLocaleString('zh-CN')}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {formOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={closeFormModal}
          >
            <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{formMode === 'create' ? '新增耗材' : '编辑耗材'}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {formMode === 'create'
                      ? '新增耗材时会同步生成一条初始库存记录。'
                      : '编辑只更新基础信息，不会直接修改当前剩余数量。'}
                  </p>
                </div>
                <button
                  onClick={closeFormModal}
                  className="text-sm text-slate-500 hover:text-slate-700"
                  disabled={savingForm}
                >
                  关闭
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-900">品名</label>
                  <input
                    value={materialForm.name}
                    onChange={(event) => {
                      setMaterialForm((prev) => ({ ...prev, name: event.target.value }))
                      setFormError(null)
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                    placeholder="例如：防水袋"
                    disabled={savingForm}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-900">单位</label>
                  <input
                    value={materialForm.unit}
                    onChange={(event) => {
                      setMaterialForm((prev) => ({ ...prev, unit: event.target.value }))
                      setFormError(null)
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                    placeholder="例如：个 / 包 / 张"
                    disabled={savingForm}
                  />
                </div>

                {formMode === 'create' && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-900">初始数量</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={materialForm.initialQty}
                      onChange={(event) => {
                        setMaterialForm((prev) => ({ ...prev, initialQty: event.target.value }))
                        setFormError(null)
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                      placeholder="请输入初始数量"
                      disabled={savingForm}
                    />
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-900">预警数量</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={materialForm.warningQty}
                    onChange={(event) => {
                      setMaterialForm((prev) => ({ ...prev, warningQty: event.target.value }))
                      setFormError(null)
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                    placeholder="请输入预警数量"
                    disabled={savingForm}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-900">备注</label>
                  <textarea
                    value={materialForm.note}
                    onChange={(event) => {
                      setMaterialForm((prev) => ({ ...prev, note: event.target.value }))
                      setFormError(null)
                    }}
                    rows={4}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                    placeholder="可选备注"
                    disabled={savingForm}
                  />
                </div>
              </div>

              {formError && (
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {formError}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={closeFormModal}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  disabled={savingForm}
                >
                  取消
                </button>
                <button
                  onClick={() => void handleSaveMaterial()}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                  disabled={savingForm}
                >
                  {savingForm ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}

        {transactionOpen && transactionTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={closeTransactionModal}
          >
            <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{getTransactionLabel(transactionMode)}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    当前耗材：{transactionTarget.name}，当前剩余数量 {formatQty(transactionTarget.currentQty)} {transactionTarget.unit || ''}
                  </p>
                </div>
                <button
                  onClick={closeTransactionModal}
                  className="text-sm text-slate-500 hover:text-slate-700"
                  disabled={savingTransaction}
                >
                  关闭
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-900">
                    {transactionMode === 'adjust' ? '调整后数量' : '数量'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={transactionForm.quantity}
                    onChange={(event) => {
                      setTransactionForm((prev) => ({ ...prev, quantity: event.target.value }))
                      setTransactionError(null)
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                    placeholder={transactionMode === 'adjust' ? '请输入调整后数量' : '请输入数量'}
                    disabled={savingTransaction}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-900">日期</label>
                  <input
                    type="date"
                    value={transactionForm.transactionDate}
                    onChange={(event) => {
                      setTransactionForm((prev) => ({ ...prev, transactionDate: event.target.value }))
                      setTransactionError(null)
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                    disabled={savingTransaction}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-900">原因</label>
                  <input
                    value={transactionForm.reason}
                    onChange={(event) => {
                      setTransactionForm((prev) => ({ ...prev, reason: event.target.value }))
                      setTransactionError(null)
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                    placeholder={transactionMode === 'consume' ? '例如：日常打包消耗' : transactionMode === 'replenish' ? '例如：采购补货' : '例如：盘点校准'}
                    disabled={savingTransaction}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-900">备注</label>
                  <textarea
                    value={transactionForm.note}
                    onChange={(event) => {
                      setTransactionForm((prev) => ({ ...prev, note: event.target.value }))
                      setTransactionError(null)
                    }}
                    rows={4}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                    placeholder="可选备注"
                    disabled={savingTransaction}
                  />
                </div>
              </div>

              {transactionError && (
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {transactionError}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={closeTransactionModal}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  disabled={savingTransaction}
                >
                  取消
                </button>
                <button
                  onClick={() => void handleSaveTransaction()}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                  disabled={savingTransaction}
                >
                  {savingTransaction ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
