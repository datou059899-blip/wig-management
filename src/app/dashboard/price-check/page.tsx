'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { canAccessPriceCheck } from '@/lib/permissions'
import { PageHeader } from '@/components/layout/PageHeader'

interface PriceCheckItem {
  sku: string
  localPrice: number
  tiktokPrice: number
  difference: number
  differencePercent: number
  productName?: string
}

export default function PriceCheckPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const role = (session?.user as any)?.role
  const canAccess = canAccessPriceCheck(role)
  const [items, setItems] = useState<PriceCheckItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState(
    'all',
  ) // all, higher, lower, match, noTikTok, abnormal, needAdjust
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const thresholdPercent = 20

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
    try {
      // 获取产品数据和 TikTok 同步数据
      const [productsRes, tiktokRes] = await Promise.all([
        fetch('/api/products?pageSize=1000'),
        fetch('/api/tiktok-sync')
      ])
      
      const productsData = await productsRes.json()
      const tiktokData = await tiktokRes.json()
      
      const products = productsData.products || []
      const syncs = tiktokData.syncs || []
      
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
        const localPrice = product?.priceUsd || 0
        const tiktokPrice = sync.priceUsd || 0
        const difference = localPrice - tiktokPrice
        const differencePercent = tiktokPrice > 0 ? (difference / tiktokPrice) * 100 : 0
        
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
          priceItems.push({
            sku: product.sku,
            localPrice: product.priceUsd,
            tiktokPrice: 0,
            difference: product.priceUsd,
            differencePercent: -100,
            productName: product.name
          })
        }
      })
      
      setItems(priceItems)
    } catch (error) {
      console.error('获取价格数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredItems = items.filter((item) => {
    if (filter === 'all') return true
    const hasTikTok = item.tiktokPrice > 0
    const absDiff = Math.abs(item.differencePercent)
    const isHigher = hasTikTok && item.localPrice > item.tiktokPrice
    const isLower = hasTikTok && item.localPrice < item.tiktokPrice
    const isMatch = hasTikTok && absDiff < 1
    const isNoTikTok = item.tiktokPrice === 0
    const isAbnormal =
      !hasTikTok || item.localPrice <= 0 || absDiff >= thresholdPercent

    if (filter === 'higher') return isHigher
    if (filter === 'lower') return isLower
    if (filter === 'match') return isMatch
    if (filter === 'noTikTok') return isNoTikTok
    if (filter === 'abnormal') return isAbnormal
    if (filter === 'needAdjust') return hasTikTok && absDiff >= thresholdPercent
    return true
  })

  const stats = {
    total: items.length,
    higher: items.filter(i => i.localPrice > i.tiktokPrice).length,
    lower: items.filter(i => i.localPrice < i.tiktokPrice && i.tiktokPrice > 0).length,
    match: items.filter(i => Math.abs(i.differencePercent) < 1).length,
    noTikTok: items.filter(i => i.tiktokPrice === 0).length
  }

  const getSuggestion = (item: PriceCheckItem): string => {
    if (item.tiktokPrice === 0) return '待同步'
    if (item.localPrice <= 0) return '检查异常'
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

  return (
    <div>
      <PageHeader
        title="TikTok 价格体检"
        description="对比商品仓定价与 TikTok 实际售价，揪出价格偏高/偏低的假发 SKU，避免亏本卖货或浪费流量。"
      />

      {/* 体检说明栏 */}
      <div className="mb-4 rounded-xl border border-gray-100 bg-white p-4 text-xs text-gray-600">
        <div className="flex flex-wrap items-center gap-4">
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
          <div className="flex-1 min-w-[200px]">
            <div className="text-gray-500">体检说明</div>
            <div className="mt-0.5 text-sm text-gray-700">
              本地价与 TikTok 售价偏差超过阈值时，给出「建议下调/建议上调」等动作指引；未同步的 SKU 建议先完成同步。
            </div>
          </div>
        </div>
      </div>

      {/* 价格体检概览（可点击筛选） */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`text-left bg-white p-4 rounded-xl shadow-sm border transition ${
            filter === 'all' ? 'border-primary-500 ring-1 ring-primary-100' : 'border-gray-100'
          }`}
        >
          <p className="text-sm text-gray-500">参与体检的 SKU 数</p>
          <p className="mt-1 text-2xl font-bold">{stats.total}</p>
        </button>
        <button
          type="button"
          onClick={() => setFilter('higher')}
          className={`text-left bg-white p-4 rounded-xl shadow-sm border transition ${
            filter === 'higher' ? 'border-red-500 ring-1 ring-red-100' : 'border-gray-100'
          }`}
        >
          <p className="text-sm text-gray-500">本地价高于 TikTok（需下调）</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{stats.higher}</p>
        </button>
        <button
          type="button"
          onClick={() => setFilter('lower')}
          className={`text-left bg-white p-4 rounded-xl shadow-sm border transition ${
            filter === 'lower' ? 'border-green-500 ring-1 ring-green-100' : 'border-gray-100'
          }`}
        >
          <p className="text-sm text-gray-500">本地价低于 TikTok（有提价空间）</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{stats.lower}</p>
        </button>
        <button
          type="button"
          onClick={() => setFilter('match')}
          className={`text-left bg-white p-4 rounded-xl shadow-sm border transition ${
            filter === 'match' ? 'border-blue-500 ring-1 ring-blue-100' : 'border-gray-100'
          }`}
        >
          <p className="text-sm text-gray-500">价格基本一致</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{stats.match}</p>
        </button>
        <button
          type="button"
          onClick={() => setFilter('noTikTok')}
          className={`text-left bg-white p-4 rounded-xl shadow-sm border transition ${
            filter === 'noTikTok' ? 'border-gray-500 ring-1 ring-gray-100' : 'border-gray-100'
          }`}
        >
          <p className="text-sm text-gray-500">商品仓有价 · TikTok 无价</p>
          <p className="mt-1 text-2xl font-bold text-gray-600">{stats.noTikTok}</p>
        </button>
      </div>

      {/* 按价格场景筛选 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm ${
              filter === 'all' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            全部
          </button>
          <button
            onClick={() => setFilter('higher')}
            className={`px-4 py-2 rounded-lg text-sm ${
              filter === 'higher' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            本地价高
          </button>
          <button
            onClick={() => setFilter('lower')}
            className={`px-4 py-2 rounded-lg text-sm ${
              filter === 'lower' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            本地价低
          </button>
          <button
            onClick={() => setFilter('match')}
            className={`px-4 py-2 rounded-lg text-sm ${
              filter === 'match' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            价格一致
          </button>
          <button
            onClick={() => setFilter('noTikTok')}
            className={`px-4 py-2 rounded-lg text-sm ${
              filter === 'noTikTok' ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            未同步
          </button>
          <button
            onClick={() => setFilter('abnormal')}
            className={`px-4 py-2 rounded-lg text-sm ${
              filter === 'abnormal' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
            }`}
          >
            只看异常
          </button>
          <button
            onClick={() => setFilter('needAdjust')}
            className={`px-4 py-2 rounded-lg text-sm ${
              filter === 'needAdjust' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'
            }`}
          >
            只看需调价
          </button>
        </div>
      </div>

      {/* 价格对比表 */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          当前条件下没有价格体检数据，试试切换上方筛选或先在 TikTok 同步工作台完成一次同步。
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
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
                      <td className="px-4 py-2 text-xs text-right">
                        <span
                          className={
                            item.localPrice > item.tiktokPrice
                              ? 'text-red-600'
                              : item.localPrice < item.tiktokPrice
                              ? 'text-green-600'
                              : ''
                          }
                        >
                          ${item.localPrice.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-right">
                        {item.tiktokPrice > 0 ? `$${item.tiktokPrice.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-4 py-2 text-xs text-right">
                        <span
                          className={
                            item.difference > 0
                              ? 'text-red-600'
                              : item.difference < 0
                              ? 'text-green-600'
                              : ''
                          }
                        >
                          {item.difference > 0 ? '+' : ''}
                          {item.difference.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-right">
                        {item.tiktokPrice > 0 ? (
                          <span
                            className={`inline-flex items-center justify-end rounded-full px-2 py-0.5 text-[11px] ${
                              item.differencePercent >= thresholdPercent
                                ? 'bg-red-50 text-red-700'
                                : item.differencePercent <= -thresholdPercent
                                ? 'bg-green-50 text-green-700'
                                : Math.abs(item.differencePercent) < 1
                                ? 'bg-gray-50 text-gray-700'
                                : 'bg-yellow-50 text-yellow-700'
                            }`}
                          >
                            {item.differencePercent > 0 ? '+' : ''}
                            {item.differencePercent.toFixed(1)}%
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${
                            suggestion === '建议下调'
                              ? 'bg-red-50 text-red-700'
                              : suggestion === '建议上调'
                              ? 'bg-green-50 text-green-700'
                              : suggestion === '保持一致'
                              ? 'bg-gray-50 text-gray-700'
                              : suggestion === '待同步'
                              ? 'bg-gray-100 text-gray-700'
                              : 'bg-yellow-50 text-yellow-700'
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
        </div>
      )}
    </div>
  )
}
