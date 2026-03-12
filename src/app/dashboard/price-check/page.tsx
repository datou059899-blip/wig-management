'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

interface PriceCheckItem {
  sku: string
  localPrice: number
  tiktokPrice: number
  difference: number
  differencePercent: number
  productName?: string
}

export default function PriceCheckPage() {
  const { data: session } = useSession()
  const [items, setItems] = useState<PriceCheckItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, higher, lower, match

  useEffect(() => {
    fetchPriceData()
  }, [])

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

  const filteredItems = items.filter(item => {
    if (filter === 'all') return true
    if (filter === 'higher') return item.localPrice > item.tiktokPrice
    if (filter === 'lower') return item.localPrice < item.tiktokPrice && item.tiktokPrice > 0
    if (filter === 'match') return Math.abs(item.differencePercent) < 1
    if (filter === 'noTikTok') return item.tiktokPrice === 0
    return true
  })

  const stats = {
    total: items.length,
    higher: items.filter(i => i.localPrice > i.tiktokPrice).length,
    lower: items.filter(i => i.localPrice < i.tiktokPrice && i.tiktokPrice > 0).length,
    match: items.filter(i => Math.abs(i.differencePercent) < 1).length,
    noTikTok: items.filter(i => i.tiktokPrice === 0).length
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">TikTok 价格体检</h1>
        <p className="text-gray-600">
          对比商品仓定价与 TikTok 实际售价，揪出价格偏高/偏低的假发 SKU，避免亏本卖货或浪费流量。
        </p>
      </div>

      {/* 价格体检概览 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <p className="text-sm text-gray-500">参与体检的 SKU 数</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <p className="text-sm text-gray-500">本地价高于 TikTok（需下调）</p>
          <p className="text-2xl font-bold text-red-600">{stats.higher}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <p className="text-sm text-gray-500">本地价低于 TikTok（有提价空间）</p>
          <p className="text-2xl font-bold text-green-600">{stats.lower}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <p className="text-sm text-gray-500">价格基本一致</p>
          <p className="text-2xl font-bold text-blue-600">{stats.match}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border">
          <p className="text-sm text-gray-500">商品仓有价 · TikTok 无价</p>
          <p className="text-2xl font-bold text-gray-600">{stats.noTikTok}</p>
        </div>
      </div>

      {/* 按价格场景筛选 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg ${filter === 'all' ? 'bg-primary-600 text-white' : 'bg-gray-100'}`}
          >
            全部
          </button>
          <button
            onClick={() => setFilter('higher')}
            className={`px-4 py-2 rounded-lg ${filter === 'higher' ? 'bg-red-600 text-white' : 'bg-gray-100'}`}
          >
            本地价高
          </button>
          <button
            onClick={() => setFilter('lower')}
            className={`px-4 py-2 rounded-lg ${filter === 'lower' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}
          >
            本地价低
          </button>
          <button
            onClick={() => setFilter('match')}
            className={`px-4 py-2 rounded-lg ${filter === 'match' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
          >
            价格一致
          </button>
          <button
            onClick={() => setFilter('noTikTok')}
            className={`px-4 py-2 rounded-lg ${filter === 'noTikTok' ? 'bg-gray-600 text-white' : 'bg-gray-100'}`}
          >
            未同步
          </button>
        </div>
      </div>

      {/* 价格对比表 */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12 text-gray-500">暂无数据</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">SKU</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">产品名称</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">本地定价 (USD)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">TikTok 售价 (USD)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">差额</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">差额比例</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium">{item.sku}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 truncate max-w-[200px]">
                      {item.productName || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={item.localPrice > item.tiktokPrice ? 'text-red-600' : item.localPrice < item.tiktokPrice ? 'text-green-600' : ''}>
                        ${item.localPrice.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {item.tiktokPrice > 0 ? `$${item.tiktokPrice.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={item.difference > 0 ? 'text-red-600' : item.difference < 0 ? 'text-green-600' : ''}>
                        {item.difference > 0 ? '+' : ''}{item.difference.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {item.tiktokPrice > 0 ? (
                        <span className={`px-2 py-1 rounded text-xs ${
                          item.differencePercent > 5 ? 'bg-red-100 text-red-700' :
                          item.differencePercent < -5 ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {item.differencePercent > 0 ? '+' : ''}{item.differencePercent.toFixed(1)}%
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
