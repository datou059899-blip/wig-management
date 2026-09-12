'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { OverflowMenu, useDelayedVisibility } from '@/components/dashboard/FunctionalPremium'

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

const businessStatusLabel: Record<string, string> = {
  ACTIVE: '正常在售',
  OUT_OF_STOCK_DELISTED: '缺货下架',
  DISCONTINUED: '停售',
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
  const [data, setData] = useState<ProductDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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

  const recentPurchases = useMemo(() => (data?.purchases || []).slice(0, 5), [data?.purchases])

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard/products" className="text-sm font-medium text-blue-600 hover:text-blue-700">← 返回产品库</Link>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/products" className="rounded-md bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-brand-700">编辑基础资料</Link>
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
              <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">{businessStatusLabel[product.businessStatus] || product.businessStatus}</span>
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

      <details className="rounded-lg border border-slate-200 bg-white min-[1400px]:hidden">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">商品档案与操作</summary>
        <dl className="border-t border-slate-100 px-4 py-2">
          <Field label="状态" value={businessStatusLabel[product.businessStatus] || product.businessStatus} />
          <Field label="Canonical SKU" value={product.sku} />
          <Field label="默认 Supplier" value={product.defaultSupplier?.name} />
        </dl>
        <div className="flex items-center gap-4 border-t border-slate-100 px-4 py-3 text-sm">
          <Link href="/dashboard/products" className="font-medium text-brand-600 hover:text-brand-700">编辑基础资料</Link>
          <Link href="/dashboard/inventory-purchasing" className="text-slate-500 hover:text-slate-900">商品经营</Link>
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
              <p className="mt-0.5 text-xs text-slate-500">关键身份与 owner 操作</p>
            </div>
            <dl className="px-4 py-2">
              <Field label="状态" value={businessStatusLabel[product.businessStatus] || product.businessStatus} />
              <Field label="Canonical SKU" value={product.sku} />
              <Field label="默认 Supplier" value={product.defaultSupplier?.name} />
            </dl>
            <div className="border-t border-slate-100 p-3">
              <Link href="/dashboard/products" className="flex h-9 w-full items-center justify-center rounded-md bg-brand-600 px-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-brand-700">编辑基础资料</Link>
              <div className="mt-3 flex items-center justify-between text-sm">
                <Link href="/dashboard/inventory-purchasing" className="text-slate-500 hover:text-slate-900">商品经营</Link>
                <Link href="/dashboard/product-sales" className="text-slate-500 hover:text-slate-900">销售分析</Link>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
