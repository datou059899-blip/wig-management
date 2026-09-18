'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { FunctionalPremiumScope, OverflowMenu, StatusBadge, primaryActionClassName, useDelayedVisibility } from '@/components/dashboard/FunctionalPremium'
import { useToast } from '@/components/ToastProvider'

type ProductDetailResponse = {
  product: {
    id: string
    name: string
    sku: string | null
    image: string | null
    images: string | null
    color: string | null
    length: string | null
    style: string | null
    material: string | null
    laceSize: string | null
    description: string | null
    productUrl: string | null
    materialUrl: string | null
    notes: string | null
    tags: string | null
    businessStatus: string
    isActive: boolean
    defaultSupplier: { id: string; name: string; isActive: boolean } | null
    costCny: number
    priceUsd: number
    discountPriceUsd: number | null
    tiktokPriceUsd: number | null
    tiktokDiscountPriceUsd: number | null
    aliases: Array<{ id: string; aliasSku: string; source: string | null }>
  }
  business: {
    currentInventory: number
    orderedOpenQty: number
    inTransitQty: number
    futureInventory: number
    currentSellingPriceUsd: number | null
    costCny: number
    inventoryCostRmb: number | null
    retailInventoryValueUsd: number | null
  } | null
  sales: {
    sevenDaySales: number
    monthSales: number
    avgDailySales: number
    currentSellableDays: number | null
    inventoryRisk: string
    salesRank: string
    stockStatus: string
  } | null
  purchases: Array<{
    purchaseOrderId: string
    purchaseOrderItemId: string
    orderNo: string
    supplier: { id: string; name: string; isActive: boolean } | null
    supplierNameSnapshot: string | null
    status: string
    statusLabel: string
    orderedAt: string | null
    expectedArrivalDate: string | null
    orderedQty: number
    receivedQty: number
    outstandingQty: number
    unitCostRmb: number | null
  }>
}

type ListingPair = {
  tiktokProductId: string
  tiktokSkuId: string
  value: string
}

type ListingEvent = {
  id: string
  reason: 'SOLD_OUT' | 'LINK_CHANGED' | 'OTHER'
  platform: string
  shopKey: string
  oldTikTokProductId: string | null
  oldTikTokSkuId: string | null
  newTikTokProductId: string | null
  newTikTokSkuId: string | null
  actualInventoryQty: number | null
  systemInventoryQty: number | null
  changedAt: string
  note: string | null
  recordedBy: string
  createdAt: string
}

type ListingEventContext = {
  product: { id: string; canonicalSku: string | null }
  platform: string
  shopKey: string
  currentInventory: number
  confirmedPairs: ListingPair[]
  currentPair: ListingPair | null
  events: ListingEvent[]
  canManage: boolean
}

type ListingReason = ListingEvent['reason']

const businessStatusLabel: Record<string, string> = {
  ACTIVE: '正常在售',
  OUT_OF_STOCK_DELISTED: '缺货下架',
  DISCONTINUED: '停售',
}

const listingReasonLabel: Record<ListingReason, string> = {
  SOLD_OUT: '卖完下架',
  LINK_CHANGED: '换链接',
  OTHER: '其他',
}

function currentLocalDateTimeInput() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return `$${value.toFixed(2)}`
}

function formatRmb(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('zh-CN')
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN')
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="grid min-h-8 grid-cols-[minmax(96px,0.8fr)_minmax(0,1.2fr)] items-baseline gap-4 border-b border-slate-100 py-2 last:border-b-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value === null || value === undefined || value === '' ? '—' : value}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-100 px-5 py-5 last:border-b-0">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>()
  const productId = params?.id
  const toast = useToast()
  const [data, setData] = useState<ProductDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [listingContext, setListingContext] = useState<ListingEventContext | null>(null)
  const [listingError, setListingError] = useState('')
  const [showListingModal, setShowListingModal] = useState(false)
  const [listingReason, setListingReason] = useState<ListingReason>('SOLD_OUT')
  const [oldPairValue, setOldPairValue] = useState('')
  const [newTikTokProductId, setNewTikTokProductId] = useState('')
  const [newTikTokSkuId, setNewTikTokSkuId] = useState('')
  const [listingChangedAt, setListingChangedAt] = useState(currentLocalDateTimeInput())
  const [listingNote, setListingNote] = useState('')
  const [soldOutConfirmed, setSoldOutConfirmed] = useState(false)
  const [listingSubmitting, setListingSubmitting] = useState(false)
  const showLoadingSkeleton = useDelayedVisibility(loading)

  useEffect(() => {
    if (!productId) return
    let cancelled = false
    async function loadDetail() {
      try {
        setLoading(true)
        setError('')
        const response = await fetch(`/api/products/${productId}/detail`)
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || '加载商品详情失败')
        if (!cancelled) setData(result)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载商品详情失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadDetail()
    return () => {
      cancelled = true
    }
  }, [productId])

  useEffect(() => {
    if (!productId) return
    let cancelled = false
    async function loadListingEvents() {
      try {
        setListingError('')
        const response = await fetch(`/api/products/${productId}/listing-events`)
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || '加载Listing变更记录失败')
        if (!cancelled) setListingContext(result)
      } catch (err) {
        if (!cancelled) setListingError(err instanceof Error ? err.message : '加载Listing变更记录失败')
      }
    }
    loadListingEvents()
    return () => {
      cancelled = true
    }
  }, [productId])

  const recentPurchases = useMemo(() => (data?.purchases || []).slice(0, 5), [data?.purchases])

  function openListingModal() {
    if (!listingContext) return
    setListingReason('SOLD_OUT')
    setOldPairValue(listingContext.currentPair?.value || (listingContext.confirmedPairs.length === 1 ? listingContext.confirmedPairs[0].value : ''))
    setNewTikTokProductId('')
    setNewTikTokSkuId('')
    setListingChangedAt(currentLocalDateTimeInput())
    setListingNote('')
    setSoldOutConfirmed(false)
    setShowListingModal(true)
  }

  async function reloadListingContext() {
    if (!productId) return
    const response = await fetch(`/api/products/${productId}/listing-events`)
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || '刷新Listing变更记录失败')
    setListingContext(result)
  }

  async function submitListingEvent() {
    if (!productId || !listingContext) return
    const oldPair = listingContext.confirmedPairs.find(pair => pair.value === oldPairValue) || null
    if (listingReason === 'LINK_CHANGED' && !oldPair) {
      toast.error('旧Listing身份尚未确认，不能记录换链接')
      return
    }
    if (listingReason === 'SOLD_OUT' && !soldOutConfirmed) {
      toast.error('请先确认仓库实际库存为0')
      return
    }
    const changedAt = new Date(listingChangedAt)
    if (Number.isNaN(changedAt.getTime())) {
      toast.error('请选择有效的发生时间')
      return
    }

    const body: Record<string, unknown> = {
      reason: listingReason,
      platform: listingContext.platform,
      shopKey: listingContext.shopKey,
      changedAt: changedAt.toISOString(),
      note: listingNote,
    }
    if (listingReason === 'LINK_CHANGED' && oldPair) {
      body.oldTikTokProductId = oldPair.tiktokProductId
      body.oldTikTokSkuId = oldPair.tiktokSkuId
      body.newTikTokProductId = newTikTokProductId
      body.newTikTokSkuId = newTikTokSkuId
    }

    try {
      setListingSubmitting(true)
      const response = await fetch(`/api/products/${productId}/listing-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '保存Listing变更失败')
      await reloadListingContext()
      if (listingReason === 'SOLD_OUT') {
        setData(current => current ? {
          ...current,
          product: { ...current.product, businessStatus: 'OUT_OF_STOCK_DELISTED' },
        } : current)
      }
      setShowListingModal(false)
      if (result.idempotent) {
        toast.info('相同换链接记录已存在，未重复创建')
      } else if (result.needsAdjustment) {
        toast.warning(`下架记录已保存，系统库存仍为 ${Math.abs(result.suggestedAdjustmentQty || 0)}，请单独确认库存调整`)
      } else {
        toast.success('Listing变更记录已保存')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存Listing变更失败')
    } finally {
      setListingSubmitting(false)
    }
  }

  if (loading) {
    return showLoadingSkeleton ? (
      <div className="space-y-4" aria-label="正在加载商品详情">
        <div className="h-9 w-28 animate-pulse rounded-md bg-slate-100" />
        <div className="h-32 animate-pulse rounded-lg border border-slate-200 bg-slate-100/70" />
        <div className="h-24 animate-pulse rounded-lg border border-slate-200 bg-slate-100/70" />
      </div>
    ) : <div className="h-24" aria-busy="true" />
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <Link href="/dashboard/products" className="text-sm text-blue-600 hover:text-blue-700">← 返回产品库</Link>
        <div className="mt-6 rounded-xl border border-red-100 bg-white p-5 text-sm text-red-600">{error || '商品不存在'}</div>
      </div>
    )
  }

  const { product, business, sales } = data
  const hasSupplementalData = Boolean(
    product.description?.trim()
    || product.notes?.trim()
    || product.productUrl
    || product.materialUrl
    || product.aliases.length,
  )

  return (
    <FunctionalPremiumScope className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard/products" className="text-sm font-medium text-blue-600 hover:text-blue-700">← 返回产品库</Link>
        <div className="flex items-center gap-2">
          {listingContext?.canManage && (
            <button type="button" onClick={openListingModal} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              记录下架 / 换链接
            </button>
          )}
          <Link href="/dashboard/products" className={primaryActionClassName}>编辑基础资料</Link>
          <OverflowMenu items={[
            { label: '商品经营', href: '/dashboard/inventory-purchasing' },
            { label: '销售分析', href: '/dashboard/product-sales' },
          ]} />
        </div>
      </div>

      <header className="rounded-lg border border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
            {product.image ? (
              <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">暂无图片</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-slate-950">{product.name}</h1>
            <div className="mt-1 font-mono text-sm text-slate-500">{product.sku || '—'}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge tone={product.businessStatus === 'ACTIVE' ? 'success' : product.businessStatus === 'DISCONTINUED' ? 'neutral' : 'danger'}>{businessStatusLabel[product.businessStatus] || product.businessStatus}</StatusBadge>
              {!product.isActive && <span className="text-slate-500">已停用</span>}
            </div>
          </div>
        </div>
      </header>

      <section className="grid overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:divide-x xl:divide-slate-100">
        {[
          { label: '当前库存', value: formatNumber(business?.currentInventory) },
          { label: '30天销量', value: formatNumber(sales?.monthSales) },
          { label: '可售天数', value: sales?.currentSellableDays == null ? '—' : `${formatNumber(sales.currentSellableDays)}天` },
          { label: '库存成本', value: formatRmb(business?.inventoryCostRmb) },
          { label: '在途', value: formatNumber(business?.inTransitQty) },
          { label: '库存风险', value: sales?.inventoryRisk || '—' },
        ].map((metric) => (
          <div key={metric.label} className="border-b border-slate-100 px-4 py-3.5 last:border-b-0 sm:border-r lg:border-b-0 xl:border-r-0">
            <div className="text-2xl font-semibold tabular-nums text-slate-950">{metric.value}</div>
            <div className="mt-1 text-xs text-slate-500">{metric.label}</div>
          </div>
        ))}
      </section>

      <details className="group rounded-lg border border-slate-200 bg-white min-[1400px]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
          <span>商品档案</span>
          <ChevronDown className="h-4 w-4 text-slate-400 transition-transform duration-150 group-open:rotate-180" aria-hidden="true" />
        </summary>
        <dl className="border-t border-slate-100 px-4 py-2">
          <Field label="状态" value={businessStatusLabel[product.businessStatus] || product.businessStatus} />
          <Field label="Canonical SKU" value={product.sku} />
          <Field label="默认 Supplier" value={product.defaultSupplier?.name} />
        </dl>
        <div className="flex items-center gap-4 border-t border-slate-100 px-4 py-3 text-sm">
          <Link href="/dashboard/inventory-purchasing" className="text-slate-500 hover:text-slate-900">商品经营</Link>
          <Link href="/dashboard/product-sales" className="text-slate-500 hover:text-slate-900">销售分析</Link>
        </div>
      </details>

      <div className="grid gap-4 min-[1400px]:grid-cols-[minmax(0,1fr)_272px]">
        <main className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Section title="商品信息">
            <dl className="grid gap-x-8 md:grid-cols-2">
              <Field label="默认 Supplier" value={product.defaultSupplier?.name} />
              <Field label="当前售价" value={formatUsd(business?.currentSellingPriceUsd)} />
              <Field label="拿货价" value={formatRmb(business?.costCny ?? product.costCny)} />
              <Field label="颜色" value={product.color} />
              <Field label="长度" value={product.length} />
              <Field label="款式/工艺" value={product.style} />
              <Field label="材质" value={product.material} />
              {product.laceSize && <Field label="Lace Size" value={product.laceSize} />}
            </dl>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <Link href="/dashboard/inventory-purchasing" className="font-medium text-brand-600 hover:text-brand-700">查看库存与订货 →</Link>
              <Link href="/dashboard/product-sales" className="font-medium text-brand-600 hover:text-brand-700">查看销售分析 →</Link>
            </div>
          </Section>

        <Section title="最近采购">
          {recentPurchases.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">采购单号</th>
                    <th className="px-3 py-2 text-left font-medium">Supplier</th>
                    <th className="px-3 py-2 text-left font-medium">状态</th>
                    <th className="px-3 py-2 text-right font-medium">订购</th>
                    <th className="px-3 py-2 text-right font-medium">已收</th>
                    <th className="px-3 py-2 text-right font-medium">未收</th>
                    <th className="px-3 py-2 text-right font-medium">预计到货</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentPurchases.map((purchase) => (
                    <tr key={purchase.purchaseOrderItemId} className="hover:bg-slate-50/70">
                      <td className="px-3 py-3 font-mono text-xs text-slate-700">{purchase.orderNo}</td>
                      <td className="px-3 py-3">{purchase.supplier?.name || purchase.supplierNameSnapshot || '—'}</td>
                      <td className="px-3 py-3">{purchase.statusLabel || purchase.status}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{purchase.orderedQty.toLocaleString('zh-CN')}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{purchase.receivedQty.toLocaleString('zh-CN')}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{purchase.outstandingQty.toLocaleString('zh-CN')}</td>
                      <td className="px-3 py-3 text-right">{formatDate(purchase.expectedArrivalDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 py-1 text-sm text-slate-500">
              <span>暂无关联采购记录</span>
              <Link href="/dashboard/inventory-purchasing" className="font-medium text-brand-600 hover:text-brand-700">查看采购 →</Link>
            </div>
          )}
          {recentPurchases.length > 0 && (
            <Link href="/dashboard/inventory-purchasing" className="mt-3 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">查看采购 →</Link>
          )}
        </Section>

        <Section title="Listing 变更记录">
          {listingError ? (
            <div className="py-1 text-sm text-rose-600">{listingError}</div>
          ) : listingContext?.events.length ? (
            <div className="divide-y divide-slate-100">
              {listingContext.events.map(event => (
                <div key={event.id} className="grid gap-2 py-3 text-sm md:grid-cols-[140px_minmax(0,1fr)_180px] md:items-start">
                  <div>
                    <StatusBadge tone={event.reason === 'SOLD_OUT' ? 'danger' : event.reason === 'LINK_CHANGED' ? 'warning' : 'neutral'}>
                      {listingReasonLabel[event.reason]}
                    </StatusBadge>
                    <div className="mt-1 text-xs text-slate-500">{formatDateTime(event.changedAt)}</div>
                  </div>
                  <div className="min-w-0 text-slate-700">
                    {event.reason === 'LINK_CHANGED' && (
                      <div className="space-y-1 font-mono text-xs">
                        <div className="break-all">旧：{event.oldTikTokProductId} / {event.oldTikTokSkuId}</div>
                        <div className="break-all">新：{event.newTikTokProductId} / {event.newTikTokSkuId}</div>
                      </div>
                    )}
                    {event.reason === 'SOLD_OUT' && (
                      <div>仓库实际库存 0；记录时系统库存 {event.systemInventoryQty ?? 0}</div>
                    )}
                    {event.note && <div className="mt-1 whitespace-pre-wrap text-slate-600">{event.note}</div>}
                  </div>
                  <div className="text-xs text-slate-500 md:text-right">记录人：{event.recordedBy}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-1 text-sm text-slate-500">暂无 Listing 变更记录</div>
          )}
        </Section>

        <Section title="产品资料">
          {hasSupplementalData ? (
            <div className="grid gap-4 text-sm md:grid-cols-2">
            {product.description?.trim() && (
              <div>
                <div className="text-xs text-slate-500">Description</div>
                <div className="mt-1 whitespace-pre-wrap text-slate-800">{product.description}</div>
              </div>
            )}
            {product.notes?.trim() && (
              <div>
                <div className="text-xs text-slate-500">Notes</div>
                <div className="mt-1 whitespace-pre-wrap text-slate-800">{product.notes}</div>
              </div>
            )}
            {(product.productUrl || product.materialUrl) && (
              <div className="flex flex-wrap gap-3">
                {product.productUrl && (
                  <a href={product.productUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">打开商品链接</a>
                )}
                {product.materialUrl && (
                  <a href={product.materialUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">打开素材链接</a>
                )}
              </div>
            )}
            {product.aliases.length > 0 && (
              <div>
                <div className="text-xs text-slate-500">SKU Alias</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {product.aliases.map((alias) => (
                    <span key={alias.id} className="rounded-md border border-slate-200 px-2 py-0.5 font-mono text-xs text-slate-700">
                      {alias.aliasSku}
                    </span>
                  ))}
                </div>
              </div>
            )}
            </div>
          ) : (
            <div className="py-1 text-sm text-slate-500">暂无补充资料</div>
          )}
        </Section>
        </main>

        <aside className="hidden min-[1400px]:block" aria-label="商品档案 Inspector">
          <div className="sticky top-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">商品档案</h2>
              <p className="mt-0.5 text-xs text-slate-500">关键身份信息</p>
            </div>
            <dl className="px-4 py-2">
              <Field label="状态" value={businessStatusLabel[product.businessStatus] || product.businessStatus} />
              <Field label="Canonical SKU" value={product.sku} />
              <Field label="默认 Supplier" value={product.defaultSupplier?.name} />
            </dl>
            <div className="border-t border-slate-100 p-3">
              <div className="flex items-center justify-between text-sm">
                <Link href="/dashboard/inventory-purchasing" className="text-slate-500 hover:text-slate-900">商品经营</Link>
                <Link href="/dashboard/product-sales" className="text-slate-500 hover:text-slate-900">销售分析</Link>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {showListingModal && listingContext && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">记录下架 / 换链接</h2>
              <p className="mt-1 text-sm text-slate-500">Canonical SKU：{listingContext.product.canonicalSku || '—'}</p>
            </div>

            <div className="space-y-5 px-5 py-5">
              <div>
                <div className="text-sm font-medium text-slate-700">原因</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {(['SOLD_OUT', 'LINK_CHANGED', 'OTHER'] as ListingReason[]).map(reason => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setListingReason(reason)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium ${listingReason === reason ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      {listingReasonLabel[reason]}
                    </button>
                  ))}
                </div>
              </div>

              {listingReason === 'LINK_CHANGED' && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    换链接不会清零库存；旧、新 Listing 将继续归属同一个 canonical SKU。
                  </div>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">旧 Listing identity</span>
                    {listingContext.confirmedPairs.length > 0 ? (
                      <select
                        value={oldPairValue}
                        onChange={event => setOldPairValue(event.target.value)}
                        className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">请选择已确认的旧 identity</option>
                        {listingContext.confirmedPairs.map(pair => (
                          <option key={pair.value} value={pair.value}>{pair.tiktokProductId} / {pair.tiktokSkuId}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        当前没有可确认的旧 Listing identity。不能猜测；请先补证，或改用“其他”并填写备注。
                      </div>
                    )}
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">新 TikTok Product ID</span>
                      <input value={newTikTokProductId} onChange={event => setNewTikTokProductId(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">新 TikTok SKU ID</span>
                      <input value={newTikTokSkuId} onChange={event => setNewTikTokSkuId(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    </label>
                  </div>
                </div>
              )}

              {listingReason === 'SOLD_OUT' && (
                <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div><span className="text-slate-500">当前系统库存：</span><strong className="ml-1 text-slate-900">{listingContext.currentInventory}</strong></div>
                    <div><span className="text-slate-500">仓库实际库存：</span><strong className="ml-1 text-slate-900">0</strong></div>
                  </div>
                  {listingContext.currentInventory > 0 ? (
                    <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      需要独立库存纠偏；建议调整量 {`-${listingContext.currentInventory}`}。本操作不会自动创建调整记录。
                    </div>
                  ) : (
                    <div className="text-sm text-emerald-700">当前系统库存也是 0，无需库存纠偏。</div>
                  )}
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={soldOutConfirmed} onChange={event => setSoldOutConfirmed(event.target.checked)} className="mt-0.5" />
                    <span>我已确认仓库实际库存为 0</span>
                  </label>
                  {listingContext.currentInventory > 0 && (
                    <Link href="/dashboard/product-sales" className="inline-block text-sm font-medium text-brand-600 hover:text-brand-700">前往库存调整 →</Link>
                  )}
                </div>
              )}

              <label className="block">
                <span className="text-sm font-medium text-slate-700">发生时间</span>
                <input
                  type="datetime-local"
                  value={listingChangedAt}
                  onChange={event => setListingChangedAt(event.target.value)}
                  className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-slate-500">将按浏览器本地时间转换为带时区的 ISO timestamp。</span>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">备注{listingReason === 'OTHER' ? '（必填）' : '（可选）'}</span>
                <textarea value={listingNote} onChange={event => setListingNote(event.target.value)} rows={3} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button type="button" onClick={() => setShowListingModal(false)} disabled={listingSubmitting} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">取消</button>
              <button
                type="button"
                onClick={submitListingEvent}
                disabled={
                  listingSubmitting
                  || !listingChangedAt
                  || (listingReason === 'LINK_CHANGED' && (!oldPairValue || !newTikTokProductId.trim() || !newTikTokSkuId.trim()))
                  || (listingReason === 'SOLD_OUT' && !soldOutConfirmed)
                  || (listingReason === 'OTHER' && !listingNote.trim())
                }
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {listingSubmitting ? '保存中…' : '保存记录'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FunctionalPremiumScope>
  )
}
