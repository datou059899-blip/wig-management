'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { canAccessPageForUser } from '@/lib/pagePermissions'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  CompactEmptyState,
  FilterChip,
  FunctionalPremiumScope,
  InteractiveMetric,
  StatusBadge,
  StickyToolbar,
  secondaryActionClassName,
  useDelayedVisibility,
} from '@/components/dashboard/FunctionalPremium'

interface PriceCheckItem {
  sku: string
  localPrice: number | null
  tiktokPrice: number
  difference: number | null
  differencePercent: number | null
  productName?: string
}

export default function PriceCheckPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const canAccess = canAccessPageForUser(session?.user as any, 'priceCheck')
  const [items, setItems] = useState<PriceCheckItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [hasTikTokSyncData, setHasTikTokSyncData] = useState(false)
  const [filter, setFilter] = useState(
    'all',
  ) // all, higher, lower, match, noTikTok, abnormal, needAdjust
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const thresholdPercent = 20
  const showLoading = useDelayedVisibility(loading)

  useEffect(() => {
    if (session !== undefined && !canAccess) {
      router.replace('/dashboard/scripts')
    }
  }, [session, canAccess, router])

  useEffect(() => {
    if (canAccess) fetchPriceData()
  }, [canAccess])

  const fetchPriceData = async () => {
    setLoading(true)
    setLoadError('')
    try {
      // 获取产品数据和 TikTok 同步数据
      const [productsRes, tiktokRes] = await Promise.all([
        fetch('/api/products?pageSize=1000'),
        fetch('/api/tiktok-sync')
      ])
      
      const productsData = await productsRes.json()
      const tiktokData = await tiktokRes.json()
      if (!productsRes.ok || !tiktokRes.ok) throw new Error('价格数据加载失败')
      
      const products = productsData.products || []
      const syncs = tiktokData.syncs || []
      setHasTikTokSyncData(syncs.length > 0)
      
      // 最近同步时间
      if (syncs.length > 0) {
        const latest = syncs.reduce((acc: any, cur: any) => {
          if (!cur?.syncedAt) return acc
          if (!acc) return cur
          return new Date(cur.syncedAt) > new Date(acc.syncedAt) ? cur : acc
        }, null as any)
        setLastSyncedAt(latest?.syncedAt || null)
      } else {
        setLastSyncedAt(null)
      }
      
      // 合并数据
      const priceItems: PriceCheckItem[] = []
      
      // 从 TikTok 同步数据遍历
      syncs.forEach((sync: any) => {
        const product = products.find((p: any) => p.sku === sync.sku)
        const localPrice = typeof product?.effectivePrice === 'number' ? product.effectivePrice : null
        const tiktokPrice = sync.priceUsd || 0
        const difference = localPrice === null ? null : localPrice - tiktokPrice
        const differencePercent = difference !== null && tiktokPrice > 0 ? (difference / tiktokPrice) * 100 : null
        
        priceItems.push({
          sku: sync.sku,
          localPrice,
          tiktokPrice,
          difference,
          differencePercent,
          productName: product?.name
        })
      })
      
      // 找出有本地定价但未同步的产品
      products.forEach((product: any) => {
        if (!syncs.find((s: any) => s.sku === product.sku)) {
          const localPrice = typeof product.effectivePrice === 'number' ? product.effectivePrice : null
          priceItems.push({
            sku: product.sku,
            localPrice,
            tiktokPrice: 0,
            difference: localPrice,
            differencePercent: localPrice === null ? null : -100,
            productName: product.name
          })
        }
      })
      
      setItems(priceItems)
    } catch (error) {
      console.error('获取价格数据失败:', error)
      setLoadError('价格数据加载失败，请刷新后重试')
      setHasTikTokSyncData(false)
    } finally {
      setLoading(false)
    }
  }

  const filteredItems = items.filter((item) => {
    if (filter === 'all') return true
    const hasTikTok = item.tiktokPrice > 0
    const absDiff = item.differencePercent === null ? null : Math.abs(item.differencePercent)
    const isHigher = hasTikTok && item.localPrice !== null && item.localPrice > item.tiktokPrice
    const isLower = hasTikTok && item.localPrice !== null && item.localPrice < item.tiktokPrice
    const isMatch = hasTikTok && absDiff !== null && absDiff < 1
    const isNoTikTok = item.tiktokPrice === 0
    const isAbnormal =
      !hasTikTok || item.localPrice === null || item.localPrice <= 0 || (absDiff !== null && absDiff >= thresholdPercent)

    if (filter === 'higher') return isHigher
    if (filter === 'lower') return isLower
    if (filter === 'match') return isMatch
    if (filter === 'noTikTok') return isNoTikTok
    if (filter === 'abnormal') return isAbnormal
    if (filter === 'needAdjust') return hasTikTok && absDiff !== null && absDiff >= thresholdPercent
    return true
  })

  const stats = {
    total: items.length,
    higher: items.filter(i => i.localPrice !== null && i.localPrice > i.tiktokPrice).length,
    lower: items.filter(i => i.localPrice !== null && i.localPrice < i.tiktokPrice && i.tiktokPrice > 0).length,
    match: items.filter(i => i.differencePercent !== null && Math.abs(i.differencePercent) < 1).length,
    noTikTok: items.filter(i => i.tiktokPrice === 0).length
  }

  const getSuggestion = (item: PriceCheckItem): string => {
    if (item.tiktokPrice === 0) return '待同步'
    if (item.localPrice === null || item.differencePercent === null || item.localPrice <= 0) return '检查异常'
    if (item.differencePercent >= thresholdPercent) return '建议下调'
    if (item.differencePercent <= -thresholdPercent) return '建议上调'
    if (Math.abs(item.differencePercent) < 1) return '保持一致'
    return '关注波动'
  }

  if (session === undefined || !canAccess) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        {session === undefined ? '加载中...' : '无权限访问价格对账，正在跳转...'}
      </div>
    )
  }

  const filterLabels: Record<string, string> = {
    all: '全部',
    higher: '本地价高',
    lower: '本地价低',
    match: '价格一致',
    noTikTok: '未同步',
    abnormal: '只看异常',
    needAdjust: '只看需调价',
  }

  return (
    <FunctionalPremiumScope className="space-y-4">
      <PageHeader
        title="价格对账"
        description="核对商品仓定价与 TikTok 实际售价，快速定位差异与缺失数据。"
      />

      <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <div className="text-gray-500">数据来源</div>
            <div className="mt-0.5 text-sm text-gray-900">
              TikTok 同步工作台导入（/dashboard/tiktok-sync）
            </div>
          </div>
          <div>
            <div className="text-gray-500">最近同步时间</div>
            <div className="mt-0.5 text-sm text-gray-900">
              {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString('zh-CN') : '—'}
            </div>
          </div>
          <div>
            <div className="text-gray-500">当前价格差异阈值</div>
            <div className="mt-0.5 text-sm text-gray-900">±{thresholdPercent}%</div>
          </div>
        </div>
      </div>

      <div className={`${!loading && !loadError && hasTikTokSyncData ? 'grid' : 'hidden'} overflow-hidden rounded-lg border border-gray-200 bg-white md:grid-cols-5 md:divide-x md:divide-gray-100`}>
        <InteractiveMetric label="参与核对" value={stats.total.toLocaleString('zh-CN')} active={filter === 'all'} onPress={() => setFilter('all')} />
        <InteractiveMetric label="本地价高" value={stats.higher.toLocaleString('zh-CN')} active={filter === 'higher'} onPress={() => setFilter('higher')} />
        <InteractiveMetric label="本地价低" value={stats.lower.toLocaleString('zh-CN')} active={filter === 'lower'} onPress={() => setFilter('lower')} />
        <InteractiveMetric label="价格一致" value={stats.match.toLocaleString('zh-CN')} active={filter === 'match'} onPress={() => setFilter('match')} />
        <InteractiveMetric label="TikTok 无价" value={stats.noTikTok.toLocaleString('zh-CN')} active={filter === 'noTikTok'} onPress={() => setFilter('noTikTok')} />
      </div>

      <StickyToolbar className={!loading && !loadError && hasTikTokSyncData ? '' : 'hidden'}>
        <label className="text-xs font-medium text-gray-500" htmlFor="price-scenario">核对场景</label>
        <select id="price-scenario" value={filter} onChange={(event) => setFilter(event.target.value)} className="input h-9 w-auto min-w-40 py-1.5">
          {Object.entries(filterLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <span className="ml-auto text-xs tabular-nums text-gray-500">当前 {filteredItems.length.toLocaleString('zh-CN')} 条</span>
        {filter !== 'all' ? <FilterChip label={filterLabels[filter]} onRemove={() => setFilter('all')} /> : null}
      </StickyToolbar>

      {/* 价格对比表 */}
      {loading ? (
        showLoading ? <div className="h-40 animate-pulse rounded-lg border border-gray-200 bg-gray-100/70" /> : <div className="h-40" />
      ) : loadError ? (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-white px-4 py-4 text-sm text-red-700">
          <span>{loadError}</span>
          <button type="button" onClick={fetchPriceData} className={`${secondaryActionClassName} shrink-0`}>重新加载</button>
        </div>
      ) : !hasTikTokSyncData ? (
        <div className="rounded-lg border border-gray-200 bg-white"><CompactEmptyState>暂无可比 TikTok 售价数据；完成 TikTok 同步后可进行价格核对。</CompactEmptyState></div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white"><CompactEmptyState>当前条件下没有价格核对数据，请调整筛选条件。</CompactEmptyState></div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="max-h-[640px] overflow-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">产品名称</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">本地定价 (USD)</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">TikTok 售价 (USD)</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">差额</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">差额比例</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">建议动作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredItems.map((item, idx) => {
                  const suggestion = getSuggestion(item)
                  return (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-xs font-medium">{item.sku}</td>
                      <td className="px-4 py-2 text-xs text-gray-600 truncate max-w-[220px]">
                        {item.productName || '-'}
                      </td>
                      <td className="px-4 py-2 text-right text-xs tabular-nums">
                        <span
                          className={
                            item.localPrice !== null && item.localPrice > item.tiktokPrice
                              ? 'text-red-600'
                              : item.localPrice !== null && item.localPrice < item.tiktokPrice
                              ? 'text-green-600'
                              : ''
                          }
                        >
                          {item.localPrice === null ? '—' : `$${item.localPrice.toFixed(2)}`}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-xs tabular-nums">
                        {item.tiktokPrice > 0 ? `$${item.tiktokPrice.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-4 py-2 text-right text-xs tabular-nums">
                        <span
                          className={
                            item.difference !== null && item.difference > 0
                              ? 'text-red-600'
                              : item.difference !== null && item.difference < 0
                              ? 'text-green-600'
                              : ''
                          }
                        >
                          {item.difference === null
                            ? '—'
                            : `${item.difference > 0 ? '+' : ''}${item.difference.toFixed(2)}`}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-xs tabular-nums">
                        {item.tiktokPrice > 0 && item.differencePercent !== null ? (
                          <StatusBadge tone={Math.abs(item.differencePercent) >= thresholdPercent ? 'danger' : Math.abs(item.differencePercent) < 1 ? 'success' : 'warning'}>
                            {item.differencePercent > 0 ? '+' : ''}
                            {item.differencePercent.toFixed(1)}%
                          </StatusBadge>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <StatusBadge tone={suggestion === '保持一致' ? 'success' : suggestion === '建议下调' || suggestion === '检查异常' ? 'danger' : suggestion === '建议上调' || suggestion === '关注波动' ? 'warning' : 'neutral'}>
                          {suggestion}
                        </StatusBadge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </FunctionalPremiumScope>
  )
}
