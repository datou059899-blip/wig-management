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

type Supplier = {
  id: string
  name: string
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

type PriceSource = 'MANUAL' | 'TIKTOK_DISCOUNT' | 'TIKTOK' | 'BASE' | 'NONE'

type ProductBusinessItem = {
  productId: string
  sku: string
  name: string
  currentInventory: number
  sales7d: number
  sales30d: number
  priceUsd: number | null
  discountPriceUsd: number | null
  tiktokPriceUsd: number | null
  tiktokDiscountPriceUsd: number | null
  currentSellingPriceUsd: number | null
  priceSource: PriceSource
  costCny: number
  defaultSupplier: { id: string; name: string; isActive: boolean } | null
  inventoryCostRmb: number | null
  retailInventoryValueUsd: number | null
}

type ProductBusinessSummary = {
  productCount: number
  currentInventory: number
  sales7d: number
  sales30d: number
  inventoryCostRmb: number
  retailInventoryValueUsd: number
  costMaintainedCount: number
  priceMaintainedCount: number
}

type BusinessFilter = 'all' | 'missingCost' | 'missingPrice' | 'missingSupplier' | 'inStock' | 'hasSales30d'
type BusinessSortKey = 'sku' | 'currentInventory' | 'sales7d' | 'sales30d'
type SortDirection = 'asc' | 'desc'
type PurchaseOrderStatus = 'DRAFT' | 'ORDERED' | 'PRODUCING' | 'IN_TRANSIT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED'

type PurchaseOrderItem = {
  id?: string
  productId: string | null
  skuSnapshot: string | null
  productNameSnapshot: string
  orderedQty: number
  receivedQty: number
  unitCostRmb: number | null
  note: string | null
  product?: { id: string; sku: string | null; name: string; isActive: boolean } | null
}

type PurchaseOrder = {
  id: string
  orderNo: string
  supplierId: string | null
  supplierNameSnapshot: string | null
  supplier?: { id: string; name: string; isActive: boolean } | null
  status: PurchaseOrderStatus
  statusLabel: string
  orderedAt: string | null
  expectedArrivalDate: string | null
  note: string | null
  orderedQty: number
  receivedQty: number
  openQty: number
  orderAmountRmb: number
  calculablePurchaseAmountRmb: number
  missingUnitCostItemCount: number
  amountComplete: boolean
  openPurchaseQty: number
  inTransitQty: number
  items: PurchaseOrderItem[]
  createdAt: string
  updatedAt: string
}

type PurchaseOrderSummary = {
  orderCount: number
  openPurchaseQty: number
  inTransitQty: number
  orderAmountRmb: number
  calculablePurchaseAmountRmb: number
  missingUnitCostItemCount: number
  amountComplete: boolean
  supplierCount: number
}

type PurchaseOrderFormItem = {
  id?: string
  productId: string
  productNameSnapshot: string
  orderedQty: string
  receivedQty: string
  unitCostRmb: string
  note: string
}

type SourceRow = {
  rowNumber: number
  inputSku: string
  productName: string
  inputProductName?: string
  totalQty: number
}

type MatchedRow = {
  rowNumber: number
  inputSku: string
  canonicalSku: string
  productId: string
  productName: string
  inputProductName?: string
  totalQty: number
  previousTotalQty: number | null
  diffQty: number | null
  sourceRows?: SourceRow[]
  resolution?: 'duplicate_merge_approved'
}

type UnmatchedRow = {
  rowNumber: number
  inputSku: string
  totalQty: number | null
  reason: string
  kind?: 'unmatched' | 'duplicate_conflict'
  canonicalSku?: string
  productId?: string
  productName?: string
  inputProductName?: string
  previousTotalQty?: number | null
  diffQty?: number | null
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

function formatUsd(value: number | null) {
  if (value === null || value === undefined) return '—'
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatRmb(value: number | null) {
  if (value === null || value === undefined) return '—'
  return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function toDateInputValue(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function getDefaultCapturedAt() {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60 * 1000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16)
}

function getSupplierErrorMessage(status: number, fallback: string) {
  if (status === 400) return fallback || '输入错误，请检查供应商名称和备注。'
  if (status === 403) return '无管理权限，仅管理员/老板可管理供应商。'
  if (status === 409) return '供应商名称已存在，请勿重复创建。'
  if (status >= 500) return '供应商操作失败，请稍后重试。'
  return fallback || '供应商操作失败'
}

function getProductBusinessErrorMessage(status: number, fallback: string) {
  if (status === 400) return '输入数据不正确'
  if (status === 403) return '没有管理权限'
  if (status === 404) return '商品或供应商不存在'
  if (status >= 500) return '保存失败'
  return fallback || '商品经营数据保存失败'
}

export default function InventoryPurchasingPage() {
  const { data: session } = useSession()
  const role = mapOldRole((session?.user as { role?: string } | undefined)?.role)
  const canManageInventory = role === 'admin' || role === 'boss'
  const [activeTab, setActiveTab] = useState<'overview' | 'business' | 'import' | 'suppliers' | 'ordering'>('overview')
  const [summaryItems, setSummaryItems] = useState<SummaryItem[]>([])
  const [summary, setSummary] = useState({ skuCount: 0, currentTotalStock: 0, changedSkuCount: 0, snapshotBackedSkuCount: 0 })
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [businessItems, setBusinessItems] = useState<ProductBusinessItem[]>([])
  const [businessSummary, setBusinessSummary] = useState<ProductBusinessSummary>({
    productCount: 0,
    currentInventory: 0,
    sales7d: 0,
    sales30d: 0,
    inventoryCostRmb: 0,
    retailInventoryValueUsd: 0,
    costMaintainedCount: 0,
    priceMaintainedCount: 0,
  })
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [purchaseSummary, setPurchaseSummary] = useState<PurchaseOrderSummary>({
    orderCount: 0,
    openPurchaseQty: 0,
    inTransitQty: 0,
    orderAmountRmb: 0,
    calculablePurchaseAmountRmb: 0,
    missingUnitCostItemCount: 0,
    amountComplete: true,
    supplierCount: 0,
  })
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState<PurchaseOrder | null>(null)
  const [purchaseSupplierId, setPurchaseSupplierId] = useState('')
  const [purchaseStatus, setPurchaseStatus] = useState<PurchaseOrderStatus>('DRAFT')
  const [purchaseOrderedAt, setPurchaseOrderedAt] = useState('')
  const [purchaseExpectedArrivalDate, setPurchaseExpectedArrivalDate] = useState('')
  const [purchaseNote, setPurchaseNote] = useState('')
  const [purchaseItems, setPurchaseItems] = useState<PurchaseOrderFormItem[]>([
    { productId: '', productNameSnapshot: '', orderedQty: '0', receivedQty: '0', unitCostRmb: '', note: '' },
  ])
  const [businessSearch, setBusinessSearch] = useState('')
  const [businessFilter, setBusinessFilter] = useState<BusinessFilter>('all')
  const [businessSortKey, setBusinessSortKey] = useState<BusinessSortKey>('sku')
  const [businessSortDirection, setBusinessSortDirection] = useState<SortDirection>('asc')
  const [editingBusinessItem, setEditingBusinessItem] = useState<ProductBusinessItem | null>(null)
  const [businessPriceInput, setBusinessPriceInput] = useState('')
  const [businessCostInput, setBusinessCostInput] = useState('')
  const [businessSupplierId, setBusinessSupplierId] = useState('')
  const [showInactiveSuppliers, setShowInactiveSuppliers] = useState(false)
  const [supplierName, setSupplierName] = useState('')
  const [supplierNotes, setSupplierNotes] = useState('')
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null)
  const [editingSupplierName, setEditingSupplierName] = useState('')
  const [editingSupplierNotes, setEditingSupplierNotes] = useState('')
  const [editingSupplierActive, setEditingSupplierActive] = useState(true)
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

  const activeSuppliers = useMemo(() => suppliers.filter((supplier) => supplier.isActive), [suppliers])

  const filteredBusinessItems = useMemo(() => {
    const keyword = businessSearch.trim().toLowerCase()
    const filtered = businessItems.filter((item) => {
      const matchesKeyword = !keyword || item.sku.toLowerCase().includes(keyword) || item.name.toLowerCase().includes(keyword)
      if (!matchesKeyword) return false
      if (businessFilter === 'missingCost') return !(item.costCny > 0)
      if (businessFilter === 'missingPrice') return item.currentSellingPriceUsd === null
      if (businessFilter === 'missingSupplier') return !item.defaultSupplier
      if (businessFilter === 'inStock') return item.currentInventory > 0
      if (businessFilter === 'hasSales30d') return item.sales30d > 0
      return true
    })

    return filtered.sort((a, b) => {
      const direction = businessSortDirection === 'asc' ? 1 : -1
      if (businessSortKey === 'sku') return a.sku.localeCompare(b.sku) * direction
      return (a[businessSortKey] - b[businessSortKey]) * direction
    })
  }, [businessFilter, businessItems, businessSearch, businessSortDirection, businessSortKey])

  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, UnmatchedRow[]>()
    unmatchedRows.forEach((row) => {
      if (row.kind !== 'duplicate_conflict' && !row.reason.includes('重复 SKU 冲突')) return
      const key = row.canonicalSku || row.reason.match(/canonical SKU (.+)$/)?.[1] || row.inputSku
      const bucket = groups.get(key) || []
      bucket.push(row)
      groups.set(key, bucket)
    })
    return Array.from(groups.entries()).map(([canonicalSku, rows]) => ({
      canonicalSku,
      rows: rows.sort((a, b) => a.rowNumber - b.rowNumber),
      totalQty: rows.reduce((sum, row) => sum + (row.totalQty || 0), 0),
      productName: rows.find((row) => row.productName)?.productName || '—',
    }))
  }, [unmatchedRows])

  const regularUnmatchedRows = useMemo(() => {
    return unmatchedRows.filter((row) => row.kind !== 'duplicate_conflict' && !row.reason.includes('重复 SKU 冲突'))
  }, [unmatchedRows])

  const unresolvedDuplicateCount = duplicateGroups.length

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

  async function loadSuppliers(includeInactive = showInactiveSuppliers) {
    const response = await fetch(`/api/inventory-purchasing/suppliers${includeInactive ? '?includeInactive=true' : ''}`)
    const data = await response.json()
    if (!response.ok) throw new Error(getSupplierErrorMessage(response.status, data.error || '供应商列表加载失败'))
    setSuppliers(data.suppliers || [])
  }

  async function loadProductBusiness() {
    const response = await fetch('/api/inventory-purchasing/products/business')
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '商品经营数据加载失败')
    setBusinessSummary(data.summary)
    setBusinessItems(data.items || [])
  }

  async function loadPurchaseOrders() {
    const response = await fetch('/api/inventory-purchasing/purchase-orders')
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '采购单加载失败')
    setPurchaseSummary(data.summary || {
      orderCount: 0,
      openPurchaseQty: 0,
      inTransitQty: 0,
      orderAmountRmb: 0,
      calculablePurchaseAmountRmb: 0,
      missingUnitCostItemCount: 0,
      amountComplete: true,
      supplierCount: 0,
    })
    setPurchaseOrders(data.orders || [])
  }

  async function refresh() {
    setError('')
    try {
      await Promise.all([loadSummary(), loadBatches(), loadSuppliers(showInactiveSuppliers), loadProductBusiness(), loadPurchaseOrders()])
    } catch (err) {
      setError(err instanceof Error ? err.message : '页面数据加载失败')
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadSuppliers(showInactiveSuppliers).catch((err) => {
      setError(err instanceof Error ? err.message : '供应商列表加载失败')
    })
  }, [showInactiveSuppliers])

  async function handleCreateSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!canManageInventory) {
      setError('仅管理员/老板可管理供应商。')
      return
    }
    const name = supplierName.trim()
    if (!name) {
      setError('供应商名称不能为空。')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/inventory-purchasing/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, notes: supplierNotes }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(getSupplierErrorMessage(response.status, data.error || '创建供应商失败'))
      setSupplierName('')
      setSupplierNotes('')
      setMessage(`供应商“${data.supplier?.name || name}”已创建。`)
      await loadSuppliers(showInactiveSuppliers)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建供应商失败')
    } finally {
      setLoading(false)
    }
  }

  function startEditSupplier(supplier: Supplier) {
    setEditingSupplierId(supplier.id)
    setEditingSupplierName(supplier.name)
    setEditingSupplierNotes(supplier.notes || '')
    setEditingSupplierActive(supplier.isActive)
  }

  function cancelEditSupplier() {
    setEditingSupplierId(null)
    setEditingSupplierName('')
    setEditingSupplierNotes('')
    setEditingSupplierActive(true)
  }

  async function handleUpdateSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingSupplierId) return
    setError('')
    setMessage('')
    if (!canManageInventory) {
      setError('仅管理员/老板可管理供应商。')
      return
    }
    const name = editingSupplierName.trim()
    if (!name) {
      setError('供应商名称不能为空。')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/inventory-purchasing/suppliers/${editingSupplierId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, notes: editingSupplierNotes, isActive: editingSupplierActive }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(getSupplierErrorMessage(response.status, data.error || '更新供应商失败'))
      setMessage(`供应商“${data.supplier?.name || name}”已更新。`)
      cancelEditSupplier()
      await loadSuppliers(showInactiveSuppliers)
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新供应商失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeactivateSupplier(supplier: Supplier) {
    if (!canManageInventory) {
      setError('仅管理员/老板可停用供应商。')
      return
    }
    if (!window.confirm('确认停用该供应商？已经绑定该供应商的历史数据不会被删除。')) {
      return
    }

    setLoading(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/inventory-purchasing/suppliers/${supplier.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: supplier.name, notes: supplier.notes || '', isActive: false }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(getSupplierErrorMessage(response.status, data.error || '停用供应商失败'))
      setMessage(`供应商“${data.supplier?.name || supplier.name}”已停用。`)
      await loadSuppliers(showInactiveSuppliers)
    } catch (err) {
      setError(err instanceof Error ? err.message : '停用供应商失败')
    } finally {
      setLoading(false)
    }
  }

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
    if (unresolvedDuplicateCount > 0) {
      setError('存在未人工确认合并的重复 SKU，请先处理 duplicate group。')
      return
    }
    if (regularUnmatchedRows.length > 0 && !ignoreUnmatched) {
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

  async function handleApproveDuplicateMerge(canonicalSku: string) {
    if (!previewBatch) return
    if (!canManageInventory) {
      setError('仅管理员/老板可确认合并重复 SKU。')
      return
    }
    if (!window.confirm(`确认将重复 SKU ${canonicalSku} 的原始行合并为同一个 canonical SKU？`)) {
      return
    }

    setLoading(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/inventory-purchasing/import-batches/${previewBatch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approveDuplicateMerge', canonicalSku }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '确认合并失败')
      setPreviewBatch(data.batch)
      setMatchedRows(data.matchedRows || [])
      setUnmatchedRows(data.unmatchedRows || [])
      setMessage(`已确认合并重复 SKU ${canonicalSku}。`)
      await loadBatches()
    } catch (err) {
      setError(err instanceof Error ? err.message : '确认合并失败')
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

  function toggleBusinessSort(key: BusinessSortKey) {
    if (businessSortKey === key) {
      setBusinessSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setBusinessSortKey(key)
    setBusinessSortDirection(key === 'sku' ? 'asc' : 'desc')
  }

  function getBusinessSortLabel(key: BusinessSortKey) {
    if (businessSortKey !== key) return ''
    return businessSortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  function startEditBusiness(item: ProductBusinessItem) {
    setEditingBusinessItem(item)
    setBusinessPriceInput(item.discountPriceUsd ? String(item.discountPriceUsd) : '')
    setBusinessCostInput(item.costCny > 0 ? String(item.costCny) : '')
    setBusinessSupplierId(item.defaultSupplier?.id || '')
  }

  function cancelEditBusiness() {
    setEditingBusinessItem(null)
    setBusinessPriceInput('')
    setBusinessCostInput('')
    setBusinessSupplierId('')
  }

  async function handleUpdateProductBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingBusinessItem) return
    if (!canManageInventory) {
      setError('仅管理员/老板可编辑商品经营数据。')
      return
    }

    const body: {
      discountPriceUsd?: number
      costCny?: number
      defaultSupplierId?: string | null
    } = {}

    const priceText = businessPriceInput.trim()
    const costText = businessCostInput.trim()
    const originalPriceText = editingBusinessItem.discountPriceUsd ? String(editingBusinessItem.discountPriceUsd) : ''
    const originalCostText = editingBusinessItem.costCny > 0 ? String(editingBusinessItem.costCny) : ''
    const originalSupplierId = editingBusinessItem.defaultSupplier?.id || ''
    if (priceText && priceText !== originalPriceText) body.discountPriceUsd = Number(priceText)
    if (costText && costText !== originalCostText) body.costCny = Number(costText)
    if (businessSupplierId !== originalSupplierId) body.defaultSupplierId = businessSupplierId || null

    if (!Object.keys(body).length) {
      setMessage('没有需要保存的经营字段变更')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/inventory-purchasing/products/${editingBusinessItem.productId}/business`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(getProductBusinessErrorMessage(response.status, data.error || '商品经营数据保存失败'))
      setMessage('商品经营数据已更新')
      cancelEditBusiness()
      await loadProductBusiness()
    } catch (err) {
      setError(err instanceof Error ? err.message : '商品经营数据保存失败')
    } finally {
      setLoading(false)
    }
  }

  function resetPurchaseForm() {
    setSelectedPurchaseOrder(null)
    setPurchaseSupplierId('')
    setPurchaseStatus('DRAFT')
    setPurchaseOrderedAt('')
    setPurchaseExpectedArrivalDate('')
    setPurchaseNote('')
    setPurchaseItems([{ productId: '', productNameSnapshot: '', orderedQty: '0', receivedQty: '0', unitCostRmb: '', note: '' }])
  }

  function purchasePayload() {
    return {
      supplierId: purchaseSupplierId || null,
      status: purchaseStatus,
      orderedAt: purchaseOrderedAt || null,
      expectedArrivalDate: purchaseExpectedArrivalDate || null,
      note: purchaseNote,
      items: purchaseItems.map((item) => ({
        id: item.id || undefined,
        productId: item.productId || null,
        productNameSnapshot: item.productId ? undefined : item.productNameSnapshot,
        orderedQty: Number(item.orderedQty || 0),
        receivedQty: Number(item.receivedQty || 0),
        unitCostRmb: item.unitCostRmb === '' ? null : Number(item.unitCostRmb),
        note: item.note,
      })),
    }
  }

  function updatePurchaseItem(index: number, patch: Partial<PurchaseOrderFormItem>) {
    setPurchaseItems((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)))
  }

  function addPurchaseItem() {
    setPurchaseItems((items) => [...items, { productId: '', productNameSnapshot: '', orderedQty: '0', receivedQty: '0', unitCostRmb: '', note: '' }])
  }

  function removePurchaseItem(index: number) {
    setPurchaseItems((items) => items.length <= 1 ? items : items.filter((_, itemIndex) => itemIndex !== index))
  }

  function startEditPurchaseOrder(order: PurchaseOrder) {
    setSelectedPurchaseOrder(order)
    setPurchaseSupplierId(order.supplierId || '')
    setPurchaseStatus(order.status)
    setPurchaseOrderedAt(toDateInputValue(order.orderedAt))
    setPurchaseExpectedArrivalDate(toDateInputValue(order.expectedArrivalDate))
    setPurchaseNote(order.note || '')
    setPurchaseItems(order.items.length ? order.items.map((item) => ({
      id: item.id || '',
      productId: item.productId || '',
      productNameSnapshot: item.productId ? '' : item.productNameSnapshot,
      orderedQty: String(item.orderedQty),
      receivedQty: String(item.receivedQty),
      unitCostRmb: item.unitCostRmb === null || item.unitCostRmb === undefined ? '' : String(item.unitCostRmb),
      note: item.note || '',
    })) : [{ productId: '', productNameSnapshot: '', orderedQty: '0', receivedQty: '0', unitCostRmb: '', note: '' }])
  }

  async function handleCreatePurchaseOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManageInventory) {
      setError('仅管理员/老板可创建采购单。')
      return
    }
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/inventory-purchasing/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(purchasePayload()),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '创建采购单失败')
      setMessage(`采购单 ${data.order?.orderNo || ''} 已创建。登记到货不会增加可售库存。`)
      resetPurchaseForm()
      await loadPurchaseOrders()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建采购单失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdatePurchaseOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPurchaseOrder) return
    if (!canManageInventory) {
      setError('仅管理员/老板可更新采购单。')
      return
    }
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/inventory-purchasing/purchase-orders/${selectedPurchaseOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(purchasePayload()),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '更新采购单失败')
      setMessage(`采购单 ${data.order?.orderNo || selectedPurchaseOrder.orderNo} 已更新。到货登记仅更新采购进度，不会增加可售库存。`)
      resetPurchaseForm()
      await loadPurchaseOrders()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新采购单失败')
    } finally {
      setLoading(false)
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
              {(['overview', 'business', 'import', 'suppliers', 'ordering'] as const).map((tab) => (
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
                  {tab === 'overview' ? '库存概览' : tab === 'business' ? '商品经营' : tab === 'import' ? '库存导入' : tab === 'suppliers' ? '供应商管理' : '订货/在途'}
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

        {activeTab === 'business' && (
          <section className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-medium text-slate-500">SKU 数</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{businessSummary.productCount}</p>
                <p className="mt-1 text-xs text-slate-500">active Product</p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-medium text-slate-500">当前总库存</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{businessSummary.currentInventory.toLocaleString('zh-CN')}</p>
                <p className="mt-1 text-xs text-slate-500">来自实时库存口径</p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-medium text-slate-500">库存成本 RMB</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{formatRmb(businessSummary.inventoryCostRmb)}</p>
                <p className="mt-1 text-xs text-slate-500">成本已维护：{businessSummary.costMaintainedCount} / {businessSummary.productCount} SKU</p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-medium text-slate-500">库存零售货值 USD</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{formatUsd(businessSummary.retailInventoryValueUsd)}</p>
                <p className="mt-1 text-xs text-slate-500">售价已维护：{businessSummary.priceMaintainedCount} / {businessSummary.productCount} SKU</p>
              </div>
            </div>

            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="space-y-4 border-b border-slate-200 px-5 py-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">商品经营</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      库存、销量、价格和货值均来自正式经营 API；不会读取 Excel 暂存数据。
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">销售字段为净销量；库存消耗趋势继续使用 stockConsumedQty。</p>
                </div>
                <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_220px_180px]">
                  <label className="block">
                    <span className="sr-only">搜索 SKU 或产品名</span>
                    <input
                      value={businessSearch}
                      onChange={(event) => setBusinessSearch(event.target.value)}
                      placeholder="搜索 SKU / 产品名"
                      className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="sr-only">筛选商品经营状态</span>
                    <select
                      value={businessFilter}
                      onChange={(event) => setBusinessFilter(event.target.value as BusinessFilter)}
                      className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="all">全部</option>
                      <option value="missingCost">未维护成本</option>
                      <option value="missingPrice">未维护售价</option>
                      <option value="missingSupplier">未绑定供应商</option>
                      <option value="inStock">有库存</option>
                      <option value="hasSales30d">有30天销量</option>
                    </select>
                  </label>
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    当前显示 {filteredBusinessItems.length} / {businessSummary.productCount} SKU
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1180px] divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3">
                        <button type="button" onClick={() => toggleBusinessSort('sku')} className="font-semibold hover:text-slate-900">
                          SKU{getBusinessSortLabel('sku')}
                        </button>
                      </th>
                      <th className="px-3 py-3">商品</th>
                      <th className="px-3 py-3">
                        <button type="button" onClick={() => toggleBusinessSort('currentInventory')} className="font-semibold hover:text-slate-900">
                          当前库存{getBusinessSortLabel('currentInventory')}
                        </button>
                      </th>
                      <th className="px-3 py-3">
                        <button type="button" onClick={() => toggleBusinessSort('sales7d')} className="font-semibold hover:text-slate-900">
                          7天销量{getBusinessSortLabel('sales7d')}
                        </button>
                      </th>
                      <th className="px-3 py-3">
                        <button type="button" onClick={() => toggleBusinessSort('sales30d')} className="font-semibold hover:text-slate-900">
                          30天销量{getBusinessSortLabel('sales30d')}
                        </button>
                      </th>
                      <th className="px-3 py-3">实际售价</th>
                      <th className="px-3 py-3">拿货价</th>
                      <th className="px-3 py-3">默认供应商</th>
                      <th className="px-3 py-3">库存成本</th>
                      <th className="px-3 py-3">零售货值</th>
                      <th className="px-3 py-3">状态</th>
                      {canManageInventory && <th className="px-3 py-3">操作</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBusinessItems.map((item) => {
                      const isSmh11 = item.sku.toUpperCase() === 'SMH-11'
                      const isSmh1 = item.sku === 'SMH-1（SM412）'
                      return (
                        <tr key={item.productId} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-900">{item.sku}</td>
                          <td className="min-w-[180px] px-3 py-2.5 text-slate-700">
                            <div>{item.name}</div>
                            {isSmh11 && <div className="mt-1 text-xs font-medium text-amber-700">经营数据待人工确认</div>}
                            {isSmh1 && <div className="mt-1 text-xs font-medium text-amber-700">历史 Alias 待确认</div>}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-900">{item.currentInventory.toLocaleString('zh-CN')}</td>
                          <td className="px-3 py-2.5 text-slate-700">{item.sales7d.toLocaleString('zh-CN')}</td>
                          <td className="px-3 py-2.5 text-slate-700">{item.sales30d.toLocaleString('zh-CN')}</td>
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-slate-900">{formatUsd(item.currentSellingPriceUsd)}</div>
                            <div className="mt-0.5 text-xs text-slate-500">{item.priceSource}</div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-700">{item.costCny > 0 ? formatRmb(item.costCny) : '未维护'}</td>
                          <td className="px-3 py-2.5 text-slate-700">{item.defaultSupplier?.name || '未绑定'}</td>
                          <td className="px-3 py-2.5 text-slate-700">{formatRmb(item.inventoryCostRmb)}</td>
                          <td className="px-3 py-2.5 text-slate-700">{formatUsd(item.retailInventoryValueUsd)}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1.5">
                              {item.costCny > 0 ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">成本已维护</span> : <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">缺成本</span>}
                              {item.currentSellingPriceUsd !== null ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">有售价</span> : <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">缺售价</span>}
                              {item.defaultSupplier ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">已绑定</span> : <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">缺供应商</span>}
                            </div>
                          </td>
                          {canManageInventory && (
                            <td className="whitespace-nowrap px-3 py-2.5">
                              <button
                                type="button"
                                onClick={() => startEditBusiness(item)}
                                disabled={loading}
                                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                编辑
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                    {filteredBusinessItems.length === 0 && (
                      <tr>
                        <td colSpan={canManageInventory ? 12 : 11} className="px-4 py-8 text-center text-slate-500">
                          没有符合条件的商品。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {editingBusinessItem && (
              <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 px-4 py-6 sm:items-center">
                <form onSubmit={handleUpdateProductBusiness} className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">编辑商品经营数据</h2>
                      <p className="mt-1 text-sm text-slate-500">{editingBusinessItem.sku}｜{editingBusinessItem.name}</p>
                    </div>
                    <button type="button" onClick={cancelEditBusiness} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200">
                      关闭
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">当前实际售价 USD</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={businessPriceInput}
                        onChange={(event) => setBusinessPriceInput(event.target.value)}
                        placeholder={editingBusinessItem.discountPriceUsd ? String(editingBusinessItem.discountPriceUsd) : '留空表示保持原值'}
                        className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <p className="mt-1 text-xs text-slate-500">写入 Product.discountPriceUsd；有人工售价时经营页面优先使用该价格。</p>
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">拿货价 RMB/顶</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={businessCostInput}
                        onChange={(event) => setBusinessCostInput(event.target.value)}
                        placeholder="留空保持原值；0 表示未维护"
                        className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <p className="mt-1 text-xs text-slate-500">写入 Product.costCny，单位：人民币 / 顶。</p>
                    </label>
                    <label className="block md:col-span-2">
                      <span className="text-sm font-medium text-slate-700">默认供应商</span>
                      <select
                        value={businessSupplierId}
                        onChange={(event) => setBusinessSupplierId(event.target.value)}
                        className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">不绑定供应商</option>
                        {activeSuppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">只显示启用中的 Supplier，并写入 Product.defaultSupplierId。</p>
                    </label>
                  </div>

                  <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                    <p>当前库存：{editingBusinessItem.currentInventory.toLocaleString('zh-CN')}</p>
                    <p className="mt-1">
                      预估库存成本：
                      {businessCostInput.trim() ? formatRmb(editingBusinessItem.currentInventory * Number(businessCostInput || 0)) : '输入拿货价后显示'}
                    </p>
                    <p className="mt-1">
                      预估零售货值：
                      {businessPriceInput.trim() ? formatUsd(editingBusinessItem.currentInventory * Number(businessPriceInput || 0)) : '输入实际售价后显示'}
                    </p>
                  </div>

                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEditBusiness}
                      disabled={loading}
                      className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading ? '保存中...' : '保存经营数据'}
                    </button>
                  </div>
                </form>
              </div>
            )}
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
                        {previewBatch.fileName}｜可确认 SKU {matchedRows.length} 个｜未匹配 {regularUnmatchedRows.length} 行｜未解决重复 {unresolvedDuplicateCount} 组
                      </p>
                    </div>
                    {previewBatch.status === 'PREVIEW' && (
                      <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={!canManageInventory || loading || unresolvedDuplicateCount > 0 || (regularUnmatchedRows.length > 0 && !ignoreUnmatched)}
                        className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {canManageInventory ? '确认导入快照' : '仅管理员/老板可确认'}
                      </button>
                    )}
                  </div>

                  {unresolvedDuplicateCount > 0 && (
                    <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
                      <p className="text-sm font-semibold text-orange-800">存在重复 canonical SKU，必须由管理员/老板逐组人工确认合并后才能导入。</p>
                    </div>
                  )}

                  {regularUnmatchedRows.length > 0 && (
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
                            <td className="px-3 py-2 text-slate-500">{row.sourceRows?.length ? row.sourceRows.map((source) => source.rowNumber).join(', ') : row.rowNumber}</td>
                            <td className="px-3 py-2">{row.sourceRows?.length ? `${row.sourceRows.length} 行来源` : row.inputSku}</td>
                            <td className="px-3 py-2 font-semibold text-slate-900">{row.canonicalSku}</td>
                            <td className="px-3 py-2 text-slate-700">
                              {row.productName}
                              {row.resolution === 'duplicate_merge_approved' && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">已人工合并</span>}
                              {row.sourceRows?.length ? (
                                <div className="mt-1 text-xs text-slate-500">
                                  {row.sourceRows.map((source) => `${source.productName || source.inputSku} / ${source.totalQty}`).join('；')}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 font-medium">{row.totalQty}</td>
                            <td className="px-3 py-2">{formatQty(row.previousTotalQty)}</td>
                            <td className="px-3 py-2">{formatChange(row.diffQty)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {duplicateGroups.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-sm font-semibold text-slate-900">重复 SKU 待人工确认</h3>
                      <div className="mt-3 space-y-3">
                        {duplicateGroups.map((group) => (
                          <div key={group.canonicalSku} className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="font-semibold text-orange-900">{group.canonicalSku}｜合并后库存 {group.totalQty}</p>
                                <p className="mt-1 text-orange-800">{group.productName}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleApproveDuplicateMerge(group.canonicalSku)}
                                disabled={!canManageInventory || loading || previewBatch.status !== 'PREVIEW'}
                                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {canManageInventory ? '确认合并为同一 SKU' : '仅管理员/老板可合并'}
                              </button>
                            </div>
                            <div className="mt-3 grid gap-2 md:grid-cols-2">
                              {group.rows.map((row) => (
                                <div key={`${group.canonicalSku}-${row.rowNumber}`} className="rounded-lg bg-white px-3 py-2 ring-1 ring-orange-100">
                                  <p className="text-xs text-slate-500">第 {row.rowNumber} 行｜{row.inputSku}</p>
                                  <p className="font-medium text-slate-900">{row.inputProductName || row.productName || row.inputSku} — {formatQty(row.totalQty)}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {regularUnmatchedRows.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-sm font-semibold text-slate-900">未匹配行</h3>
                      <div className="mt-2 overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                          <tbody className="divide-y divide-slate-100">
                            {regularUnmatchedRows.map((row) => (
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

        {activeTab === 'suppliers' && (
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">供应商管理</h2>
                  <p className="mt-1 text-sm text-slate-500">只维护供应商主数据；不会修改 Product 经营字段，也不会创建采购单。</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={showInactiveSuppliers}
                    onChange={(event) => setShowInactiveSuppliers(event.target.checked)}
                    className="rounded border-slate-300"
                  />
                  显示已停用
                </label>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">供应商名称</th>
                      <th className="px-4 py-3">状态</th>
                      <th className="px-4 py-3">备注</th>
                      <th className="px-4 py-3">创建时间</th>
                      <th className="px-4 py-3">更新时间</th>
                      {canManageInventory && <th className="px-4 py-3">操作</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {suppliers.map((supplier) => (
                      <tr key={supplier.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">{supplier.name}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${supplier.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {supplier.isActive ? '启用' : '已停用'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{supplier.notes || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDateTime(supplier.createdAt)}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDateTime(supplier.updatedAt)}</td>
                        {canManageInventory && (
                          <td className="whitespace-nowrap px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => startEditSupplier(supplier)}
                                disabled={loading}
                                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                编辑
                              </button>
                              {supplier.isActive && (
                                <button
                                  type="button"
                                  onClick={() => handleDeactivateSupplier(supplier)}
                                  disabled={loading}
                                  className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  停用
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    {suppliers.length === 0 && (
                      <tr>
                        <td colSpan={canManageInventory ? 6 : 5} className="px-4 py-8 text-center text-slate-500">
                          暂无供应商。管理员/老板可以在右侧新增供应商。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="space-y-6">
              {canManageInventory ? (
                <form onSubmit={handleCreateSupplier} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900">新增供应商</h2>
                  <p className="mt-1 text-sm text-slate-500">仅填写名称和备注；isActive 默认启用。</p>
                  <label className="mt-5 block">
                    <span className="text-sm font-medium text-slate-700">供应商名称</span>
                    <input
                      value={supplierName}
                      onChange={(event) => setSupplierName(event.target.value)}
                      placeholder="例如：供应商名称"
                      className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="mt-4 block">
                    <span className="text-sm font-medium text-slate-700">备注</span>
                    <textarea
                      value={supplierNotes}
                      onChange={(event) => setSupplierNotes(event.target.value)}
                      rows={3}
                      placeholder="可留空"
                      className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? '处理中...' : '创建供应商'}
                  </button>
                </form>
              ) : (
                <div className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
                  仅管理员/老板可管理供应商；当前账号只能查看供应商列表。
                </div>
              )}

              {canManageInventory && editingSupplierId && (
                <form onSubmit={handleUpdateSupplier} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900">编辑供应商</h2>
                  <label className="mt-5 block">
                    <span className="text-sm font-medium text-slate-700">供应商名称</span>
                    <input
                      value={editingSupplierName}
                      onChange={(event) => setEditingSupplierName(event.target.value)}
                      className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="mt-4 block">
                    <span className="text-sm font-medium text-slate-700">备注</span>
                    <textarea
                      value={editingSupplierNotes}
                      onChange={(event) => setEditingSupplierNotes(event.target.value)}
                      rows={3}
                      className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={editingSupplierActive}
                      onChange={(event) => setEditingSupplierActive(event.target.checked)}
                      className="rounded border-slate-300"
                    />
                    启用该供应商
                  </label>
                  <div className="mt-5 flex gap-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      保存修改
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditSupplier}
                      disabled={loading}
                      className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      取消
                    </button>
                  </div>
                </form>
              )}
            </aside>
          </section>
        )}

        {activeTab === 'ordering' && (
          <section className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-medium text-slate-500">待到货总数</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{purchaseSummary.openPurchaseQty.toLocaleString('zh-CN')}</p>
                <p className="mt-1 text-xs text-slate-500">已下单/生产/在途/部分到货</p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-medium text-slate-500">在途数量</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{purchaseSummary.inTransitQty.toLocaleString('zh-CN')}</p>
                <p className="mt-1 text-xs text-slate-500">仅运输中/部分到货</p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-medium text-slate-500">采购金额</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{formatRmb(purchaseSummary.calculablePurchaseAmountRmb)}</p>
                <p className={`mt-1 text-xs ${purchaseSummary.amountComplete ? 'text-slate-500' : 'text-amber-700'}`}>
                  {purchaseSummary.amountComplete ? '按明细数量 × 单价计算' : `${purchaseSummary.missingUnitCostItemCount}条明细未维护单价，当前仅统计已维护单价商品`}
                </p>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-medium text-slate-500">供应商数</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{purchaseSummary.supplierCount.toLocaleString('zh-CN')}</p>
                <p className="mt-1 text-xs text-slate-500">当前采购单关联供应商</p>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              到货登记只更新采购进度，不会增加可售库存；真正库存增加仍必须走库存 Excel → PREVIEW → CONFIRM → InventorySnapshot。
              当前 schema 暂无定金/待付款字段，因此本页不展示付款卡片。
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
              <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">采购单 / 在途列表</h2>
                    <p className="mt-1 text-sm text-slate-500">采购记录独立于现货库存，不会写入 Product.stock 或库存快照。</p>
                  </div>
                  <button
                    type="button"
                    onClick={loadPurchaseOrders}
                    className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    刷新
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[1060px] divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-3">订单号</th>
                        <th className="px-3 py-3">供应商</th>
                        <th className="px-3 py-3">状态</th>
                        <th className="px-3 py-3">订货数量</th>
                        <th className="px-3 py-3">已到货</th>
                        <th className="px-3 py-3">待到货</th>
                        <th className="px-3 py-3">订单金额</th>
                        <th className="px-3 py-3">下单时间</th>
                        <th className="px-3 py-3">预计到货</th>
                        <th className="px-3 py-3">更新时间</th>
                        <th className="px-3 py-3">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {purchaseOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-900">{order.orderNo}</td>
                          <td className="px-3 py-2.5 text-slate-700">{order.supplierNameSnapshot || order.supplier?.name || '未填写'}</td>
                          <td className="px-3 py-2.5">
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              order.status === 'CANCELLED' ? 'bg-slate-100 text-slate-500' :
                              order.status === 'RECEIVED' ? 'bg-emerald-100 text-emerald-700' :
                              order.status === 'IN_TRANSIT' || order.status === 'PARTIALLY_RECEIVED' ? 'bg-blue-100 text-blue-700' :
                              order.status === 'DRAFT' ? 'bg-amber-100 text-amber-700' :
                              'bg-pink-100 text-pink-700'
                            }`}>
                              {order.statusLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-700">{order.orderedQty.toLocaleString('zh-CN')}</td>
                          <td className="px-3 py-2.5 text-slate-700">{order.receivedQty.toLocaleString('zh-CN')}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-900">{order.openQty.toLocaleString('zh-CN')}</td>
                          <td className="px-3 py-2.5 text-slate-700">
                            {formatRmb(order.calculablePurchaseAmountRmb)}
                            {!order.amountComplete && <div className="mt-0.5 text-xs text-amber-700">部分商品未维护单价</div>}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">{formatDateTime(order.orderedAt)}</td>
                          <td className="px-3 py-2.5 text-slate-600">{formatDateTime(order.expectedArrivalDate)}</td>
                          <td className="px-3 py-2.5 text-slate-600">{formatDateTime(order.updatedAt)}</td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => startEditPurchaseOrder(order)}
                              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                            >
                              {canManageInventory ? '查看/编辑' : '查看详情'}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {purchaseOrders.length === 0 && (
                        <tr>
                          <td colSpan={11} className="px-4 py-10 text-center text-slate-500">
                            暂无采购单。不会自动导入期货 Excel；管理员/老板可从右侧手工创建。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <aside className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">新增采购单</h2>
                <p className="mt-1 text-sm text-slate-500">
                  支持未关联商品：没有明确 SKU 时保留产品/款式原文，后续再人工关联。
                </p>
                {canManageInventory ? (
                  <form onSubmit={handleCreatePurchaseOrder} className="mt-5 space-y-4">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">供应商</span>
                      <select value={purchaseSupplierId} onChange={(event) => setPurchaseSupplierId(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        <option value="">暂不关联供应商</option>
                        {activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                      </select>
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">状态</span>
                        <select value={purchaseStatus} onChange={(event) => setPurchaseStatus(event.target.value as PurchaseOrderStatus)} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                          <option value="DRAFT">草稿</option>
                          <option value="ORDERED">已下单</option>
                          <option value="PRODUCING">生产中</option>
                          <option value="IN_TRANSIT">运输中</option>
                          <option value="PARTIALLY_RECEIVED">部分到货</option>
                          <option value="RECEIVED">已到货</option>
                          <option value="CANCELLED">已取消</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">预计到货</span>
                        <input type="datetime-local" value={purchaseExpectedArrivalDate} onChange={(event) => setPurchaseExpectedArrivalDate(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">下单时间</span>
                      <input type="datetime-local" value={purchaseOrderedAt} onChange={(event) => setPurchaseOrderedAt(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">备注</span>
                      <textarea value={purchaseNote} onChange={(event) => setPurchaseNote(event.target.value)} rows={2} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    </label>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900">采购明细</h3>
                        <button type="button" onClick={addPurchaseItem} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">添加明细</button>
                      </div>
                      {purchaseItems.map((item, index) => (
                        <div key={index} className="space-y-3 rounded-xl border border-slate-200 p-3">
                          <label className="block">
                            <span className="text-xs font-medium text-slate-600">关联 Product（可选）</span>
                            <select
                              value={item.productId}
                              onChange={(event) => {
                                const product = businessItems.find((candidate) => candidate.productId === event.target.value)
                                updatePurchaseItem(index, { productId: event.target.value, productNameSnapshot: product ? product.name : item.productNameSnapshot })
                              }}
                              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            >
                              <option value="">未关联商品</option>
                              {businessItems.map((product) => <option key={product.productId} value={product.productId}>{product.sku}｜{product.name}</option>)}
                            </select>
                          </label>
                          {!item.productId && (
                            <label className="block">
                              <span className="text-xs font-medium text-slate-600">产品/款式原文</span>
                              <input value={item.productNameSnapshot} onChange={(event) => updatePurchaseItem(index, { productNameSnapshot: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="例如：DWY爆款1（升级大头皮）" />
                            </label>
                          )}
                          <div className="grid gap-3 md:grid-cols-3">
                            <label className="block">
                              <span className="text-xs font-medium text-slate-600">订货数量</span>
                              <input type="number" min="0" step="1" value={item.orderedQty} onChange={(event) => updatePurchaseItem(index, { orderedQty: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            </label>
                            <label className="block">
                              <span className="text-xs font-medium text-slate-600">已到数量</span>
                              <input type="number" min="0" step="1" value={item.receivedQty} onChange={(event) => updatePurchaseItem(index, { receivedQty: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            </label>
                            <label className="block">
                              <span className="text-xs font-medium text-slate-600">单价 RMB</span>
                              <input type="number" min="0" step="0.01" value={item.unitCostRmb} onChange={(event) => updatePurchaseItem(index, { unitCostRmb: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            </label>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-slate-500">金额：{formatRmb(Number(item.orderedQty || 0) * Number(item.unitCostRmb || 0))}</p>
                            <button type="button" onClick={() => removePurchaseItem(index)} disabled={purchaseItems.length <= 1} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40">删除</button>
                          </div>
                          <input value={item.note} onChange={(event) => updatePurchaseItem(index, { note: event.target.value })} className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="明细备注，可留空" />
                        </div>
                      ))}
                    </div>
                    <button type="submit" disabled={loading} className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
                      {loading ? '保存中...' : '创建采购单'}
                    </button>
                  </form>
                ) : (
                  <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                    仅管理员/老板可创建或修改采购单；当前账号可以查看订货/在途数据。
                  </div>
                )}
              </aside>
            </div>

            {selectedPurchaseOrder && (
              <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 px-4 py-6 sm:items-center">
                <form onSubmit={handleUpdatePurchaseOrder} className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">采购单详情</h2>
                      <p className="mt-1 text-sm text-slate-500">{selectedPurchaseOrder.orderNo}｜到货登记不会增加可售库存</p>
                    </div>
                    <button type="button" onClick={resetPurchaseForm} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200">关闭</button>
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">供应商</p>
                      <p className="mt-1 font-semibold text-slate-900">{selectedPurchaseOrder.supplierNameSnapshot || selectedPurchaseOrder.supplier?.name || '未填写'}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">订货 / 已到 / 待到</p>
                      <p className="mt-1 font-semibold text-slate-900">{selectedPurchaseOrder.orderedQty} / {selectedPurchaseOrder.receivedQty} / {selectedPurchaseOrder.openQty}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">订单金额</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatRmb(selectedPurchaseOrder.calculablePurchaseAmountRmb)}</p>
                      {!selectedPurchaseOrder.amountComplete && <p className="mt-1 text-xs text-amber-700">部分商品未维护单价</p>}
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">状态</p>
                      <p className="mt-1 font-semibold text-slate-900">{selectedPurchaseOrder.statusLabel}</p>
                    </div>
                  </div>

                  {canManageInventory ? (
                    <div className="mt-5 space-y-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <label className="block">
                          <span className="text-sm font-medium text-slate-700">供应商</span>
                          <select value={purchaseSupplierId} onChange={(event) => setPurchaseSupplierId(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                            <option value="">暂不关联供应商</option>
                            {activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium text-slate-700">状态</span>
                          <select value={purchaseStatus} onChange={(event) => setPurchaseStatus(event.target.value as PurchaseOrderStatus)} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                            <option value="DRAFT">草稿</option>
                            <option value="ORDERED">已下单</option>
                            <option value="PRODUCING">生产中</option>
                            <option value="IN_TRANSIT">运输中</option>
                            <option value="PARTIALLY_RECEIVED">部分到货</option>
                            <option value="RECEIVED">已到货</option>
                            <option value="CANCELLED">已取消</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium text-slate-700">预计到货</span>
                          <input type="datetime-local" value={purchaseExpectedArrivalDate} onChange={(event) => setPurchaseExpectedArrivalDate(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium text-slate-700">下单时间</span>
                          <input type="datetime-local" value={purchaseOrderedAt} onChange={(event) => setPurchaseOrderedAt(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                        </label>
                      </div>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">备注</span>
                        <textarea value={purchaseNote} onChange={(event) => setPurchaseNote(event.target.value)} rows={2} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      </label>

                      <div className="overflow-x-auto">
                        <table className="min-w-[900px] divide-y divide-slate-200 text-sm">
                          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-3 py-2">SKU</th>
                              <th className="px-3 py-2">产品/款式</th>
                              <th className="px-3 py-2">订货数量</th>
                              <th className="px-3 py-2">已到数量</th>
                              <th className="px-3 py-2">待到</th>
                              <th className="px-3 py-2">单价</th>
                              <th className="px-3 py-2">金额</th>
                              <th className="px-3 py-2">备注</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {purchaseItems.map((item, index) => {
                              const product = businessItems.find((candidate) => candidate.productId === item.productId)
                              const orderedQty = Number(item.orderedQty || 0)
                              const receivedQty = Number(item.receivedQty || 0)
                              return (
                                <tr key={index}>
                                  <td className="px-3 py-2">
                                    <select value={item.productId} onChange={(event) => {
                                      const nextProduct = businessItems.find((candidate) => candidate.productId === event.target.value)
                                      updatePurchaseItem(index, { productId: event.target.value, productNameSnapshot: nextProduct ? nextProduct.name : item.productNameSnapshot })
                                    }} className="w-44 rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                                      <option value="">未关联</option>
                                      {businessItems.map((candidate) => <option key={candidate.productId} value={candidate.productId}>{candidate.sku}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2">
                                    {item.productId ? (
                                      <span className="text-slate-700">{product?.name || '已关联商品'}</span>
                                    ) : (
                                      <input value={item.productNameSnapshot} onChange={(event) => updatePurchaseItem(index, { productNameSnapshot: event.target.value })} className="w-56 rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                                    )}
                                  </td>
                                  <td className="px-3 py-2"><input type="number" min="0" step="1" value={item.orderedQty} onChange={(event) => updatePurchaseItem(index, { orderedQty: event.target.value })} className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-xs" /></td>
                                  <td className="px-3 py-2"><input type="number" min="0" step="1" value={item.receivedQty} onChange={(event) => updatePurchaseItem(index, { receivedQty: event.target.value })} className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-xs" /></td>
                                  <td className="px-3 py-2 text-slate-700">{Math.max(orderedQty - receivedQty, 0)}</td>
                                  <td className="px-3 py-2"><input type="number" min="0" step="0.01" value={item.unitCostRmb} onChange={(event) => updatePurchaseItem(index, { unitCostRmb: event.target.value })} className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-xs" /></td>
                                  <td className="px-3 py-2 text-slate-700">{item.unitCostRmb === '' ? '未维护单价' : formatRmb(orderedQty * Number(item.unitCostRmb || 0))}</td>
                                  <td className="px-3 py-2"><input value={item.note} onChange={(event) => updatePurchaseItem(index, { note: event.target.value })} className="w-40 rounded-lg border border-slate-300 px-2 py-1.5 text-xs" /></td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex justify-between gap-3">
                        <button type="button" onClick={addPurchaseItem} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">添加明细</button>
                        <button type="submit" disabled={loading} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
                          保存采购单
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2">SKU</th>
                            <th className="px-3 py-2">产品/款式</th>
                            <th className="px-3 py-2">订货数量</th>
                            <th className="px-3 py-2">已到数量</th>
                            <th className="px-3 py-2">待到</th>
                            <th className="px-3 py-2">单价</th>
                            <th className="px-3 py-2">金额</th>
                            <th className="px-3 py-2">备注</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedPurchaseOrder.items.map((item) => (
                            <tr key={item.id}>
                              <td className="px-3 py-2 font-medium text-slate-900">{item.skuSnapshot || '未关联'}</td>
                              <td className="px-3 py-2 text-slate-700">{item.productNameSnapshot}</td>
                              <td className="px-3 py-2">{item.orderedQty}</td>
                              <td className="px-3 py-2">{item.receivedQty}</td>
                              <td className="px-3 py-2">{Math.max(item.orderedQty - item.receivedQty, 0)}</td>
                              <td className="px-3 py-2">{formatRmb(item.unitCostRmb)}</td>
                              <td className="px-3 py-2">{item.unitCostRmb === null ? '未维护单价' : formatRmb(item.orderedQty * item.unitCostRmb)}</td>
                              <td className="px-3 py-2 text-slate-600">{item.note || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </form>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
