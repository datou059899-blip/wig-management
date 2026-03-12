'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

interface Product {
  id: string
  name: string
  sku: string
  image: string
  description: string
  costCny: number
  priceUsd: number
  stock: number
  costUsd: number
  profit: number
  profitMargin: number
  warningStock: boolean
  warningProfit: boolean
  warningMissing: boolean
  tiktokSync: any
}

export default function ProductsPage() {
  const { data: session } = useSession()
  const userRole = (session?.user as any)?.role
  const canEdit = userRole === 'admin' || userRole === 'operator'
  
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [warningFilter, setWarningFilter] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState('desc')
  const [view, setView] = useState<'operator' | 'advertiser'>('operator')

  useEffect(() => {
    fetchProducts()
  }, [search, warningFilter, sortBy, sortOrder])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (warningFilter) params.set('warning', warningFilter)
      params.set('sortBy', sortBy)
      params.set('sortOrder', sortOrder)
      
      const res = await fetch(`/api/products?${params}`)
      const data = await res.json()
      if (res.ok) {
        setProducts(data.products || [])
      }
    } catch (error) {
      console.error('获取产品失败:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">产品列表</h1>
          <p className="text-gray-600">共 {products.length} 个产品</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView('operator')}
            className={`px-4 py-2 rounded-lg ${view === 'operator' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            运营视图
          </button>
          <button
            onClick={() => setView('advertiser')}
            className={`px-4 py-2 rounded-lg ${view === 'advertiser' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            投手视图
          </button>
        </div>
      </div>

      {/* 筛选 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <input
            type="text"
            placeholder="搜索产品名称或 SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <select
            value={warningFilter}
            onChange={(e) => setWarningFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">全部预警</option>
            <option value="stock">库存预警</option>
            <option value="profit">低毛利预警</option>
            <option value="missing">缺信息</option>
          </select>
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [by, order] = e.target.value.split('-')
              setSortBy(by)
              setSortOrder(order)
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="createdAt-desc">最新创建</option>
            <option value="createdAt-asc">最旧创建</option>
            <option value="profit-desc">毛利从高到低</option>
            <option value="profit-asc">毛利从低到高</option>
            <option value="stock-asc">库存从少到多</option>
            <option value="stock-desc">库存从多到少</option>
          </select>
        </div>
      </div>

      {/* 产品列表 */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : products.length === 0 ? (
        <div className="text-center py-12 text-gray-500">暂无产品数据</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {view === 'operator' ? (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">产品</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">SKU</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">成本(CNY)</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">售价(USD)</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">毛利</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">毛利率</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">库存</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">预警</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">产品名称</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">SKU</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">主卖点</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">核心场景</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">TikTok售价</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">素材链接</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    {view === 'operator' ? (
                      <>
                        <td className="px-4 py-3">
                          <div className="flex items-center">
                            {product.image && (
                              <img src={product.image} alt="" className="w-10 h-10 rounded object-cover mr-3" />
                            )}
                            <span className="font-medium text-gray-900 truncate max-w-[200px]">
                              {product.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{product.sku || '-'}</td>
                        <td className="px-4 py-3 text-sm">¥{product.costCny.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm">${product.priceUsd.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={product.profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                            ${product.profit.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={product.profitMargin >= 20 ? 'text-green-600' : 'text-red-600'}>
                            {product.profitMargin.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={product.warningStock ? 'text-red-600 font-medium' : ''}>
                            {product.stock}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {product.warningStock && (
                              <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">库存</span>
                            )}
                            {product.warningProfit && (
                              <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded">毛利</span>
                            )}
                            {product.warningMissing && (
                              <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">缺信息</span>
                            )}
                            {!product.warningStock && !product.warningProfit && !product.warningMissing && (
                              <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">正常</span>
                            )}
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-gray-900">{product.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{product.sku || '-'}</td>
                        <td className="px-4 py-3 text-sm truncate max-w-[200px]">
                          {product.description || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">{product.tiktokSync?.scene || '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          ${product.tiktokSync?.priceUsd?.toFixed(2) || product.priceUsd.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {product.tiktokSync?.materialUrl ? (
                            <a href={product.tiktokSync.materialUrl} target="_blank" className="text-primary-600 hover:underline">
                              查看素材
                            </a>
                          ) : '-'}
                        </td>
                      </>
                    )}
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
