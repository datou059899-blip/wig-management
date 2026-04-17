'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { canAccessProducts, canEditProducts } from '@/lib/permissions'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/EmptyState'

interface Product {
  id: string
  name: string
  sku: string
  image: string
  length?: string
  color?: string
  style?: string
  productUrl?: string
  description?: string
  priceUsd?: number
  costCny?: number
  stock?: number
  updatedAt?: string
}

export default function ProductsPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const userRole = (session?.user as any)?.role
  const canAccess = canAccessProducts(userRole)
  const canEdit = canEditProducts(userRole)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (session !== undefined && !canAccess) {
      router.replace('/dashboard/scripts')
    }
  }, [session, canAccess, router])
  
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // 加载产品数据
  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products')
      if (!res.ok) throw new Error('加载失败')
      const data = await res.json()
      setProducts(data.products || [])
    } catch (error) {
      console.error('获取产品列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  // 搜索过滤 - 支持 SKU、产品名、颜色、长度、款式类型
  const filteredProducts = products.filter(product => {
    if (!searchQuery.trim()) return true
    
    const query = searchQuery.toLowerCase()
    const searchFields = [
      product.sku,
      product.name,
      product.color,
      product.length,
      product.style,
      product.description
    ].filter(Boolean).map(f => f!.toLowerCase())
    
    return searchFields.some(field => field.includes(query))
  })

  // 处理编辑
  const handleEdit = (product: Product) => {
    setEditingProduct({ ...product })
    setPreviewUrl(product.image || null)
    setShowEditModal(true)
  }

  // 处理文件选择
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 检查文件类型
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }

    // 检查文件大小 (最大 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过 5MB')
      return
    }

    // 显示本地预览
    const localUrl = URL.createObjectURL(file)
    setPreviewUrl(localUrl)

    // 上传图片
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '上传失败')
      }

      const data = await res.json()
      if (editingProduct) {
        setEditingProduct({ ...editingProduct, image: data.url })
      }
    } catch (error: any) {
      console.error('上传失败:', error)
      alert('上传失败: ' + error.message)
      // 恢复原来的图片
      setPreviewUrl(editingProduct?.image || null)
    } finally {
      setUploading(false)
      // 清除文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // 保存编辑
  const handleSave = async () => {
    if (!editingProduct) return
    
    try {
      const res = await fetch(`/api/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingProduct.name,
          sku: editingProduct.sku,
          color: editingProduct.color,
          length: editingProduct.length,
          style: editingProduct.style,
          productUrl: editingProduct.productUrl,
          image: editingProduct.image,
        })
      })
      
      if (res.ok) {
        setShowEditModal(false)
        setEditingProduct(null)
        setPreviewUrl(null)
        fetchProducts()
      }
    } catch (error) {
      console.error('保存失败:', error)
    }
  }

  // 打开产品链接
  const openProductUrl = (url?: string) => {
    if (url) {
      window.open(url, '_blank')
    }
  }

  if (!canAccess) return null

  return (
    <div className="p-6">
      <PageHeader
        title="产品库"
        description="通过图片、SKU、产品名、假发属性快速确认产品"
      />

      {/* 搜索栏 */}
      <div className="mb-6">
        <div className="relative max-w-2xl">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索 SKU / 产品名 / 颜色 / 长度 / 款式..."
            className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
          />
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="mt-2 text-sm text-gray-500">
          共 {filteredProducts.length} 款产品 {searchQuery && `(搜索 "${searchQuery}")`}
        </div>
      </div>

      {/* 产品网格 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          title="没有找到产品"
          description={searchQuery ? "请尝试其他搜索关键词" : "暂无产品数据"}
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group"
            >
              {/* 产品图片 */}
              <div className="relative aspect-square bg-gray-100">
                {product.image ? (
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                
                {/* 编辑按钮 */}
                {canEdit && (
                  <button
                    onClick={() => handleEdit(product)}
                    className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
                    title="编辑"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}

                {/* 产品链接按钮 */}
                {product.productUrl && (
                  <button
                    onClick={() => openProductUrl(product.productUrl)}
                    className="absolute bottom-2 right-2 p-1.5 bg-blue-600/90 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-600"
                    title="打开产品链接"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                )}
              </div>

              {/* 产品信息 */}
              <div className="p-3">
                {/* SKU */}
                <div className="text-xs font-mono text-gray-500 mb-1 truncate">
                  {product.sku || '无 SKU'}
                </div>
                
                {/* 产品名 */}
                <h3 className="font-medium text-gray-900 text-sm mb-2 line-clamp-2 min-h-[2.5rem]">
                  {product.name}
                </h3>

                {/* 假发属性 */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {product.color && (
                    <span className="px-1.5 py-0.5 bg-pink-50 text-pink-700 text-xs rounded">
                      {product.color}
                    </span>
                  )}
                  {product.length && (
                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded">
                      {product.length}
                    </span>
                  )}
                  {product.style && (
                    <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 text-xs rounded">
                      {product.style}
                    </span>
                  )}
                </div>

                {/* 产品链接 */}
                {product.productUrl && (
                  <a
                    href={product.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 truncate"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    产品链接
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 编辑弹窗 */}
      {showEditModal && editingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold">编辑产品信息</h2>
            </div>
            <div className="p-6 space-y-4">
              {/* 图片上传 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">产品图片</label>
                <div className="flex items-start gap-4">
                  {/* 图片预览 */}
                  <div className="relative w-32 h-32 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                    {previewUrl ? (
                      <Image
                        src={previewUrl}
                        alt="产品图片"
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    {uploading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                      </div>
                    )}
                  </div>
                  
                  {/* 上传按钮 */}
                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      {uploading ? '上传中...' : '选择图片'}
                    </button>
                    <p className="mt-2 text-xs text-gray-500">
                      支持 JPG、PNG、GIF 格式，最大 5MB
                    </p>
                    {editingProduct.image && (
                      <button
                        onClick={() => {
                          setEditingProduct({ ...editingProduct, image: '' })
                          setPreviewUrl(null)
                        }}
                        className="mt-2 text-xs text-red-600 hover:text-red-800"
                      >
                        删除图片
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* SKU */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                <input
                  type="text"
                  value={editingProduct.sku || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              {/* 产品名 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">产品名称</label>
                <input
                  type="text"
                  value={editingProduct.name || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              {/* 假发属性 */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">颜色</label>
                  <input
                    type="text"
                    value={editingProduct.color || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, color: e.target.value })}
                    placeholder="如：1B, 99J"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">长度</label>
                  <input
                    type="text"
                    value={editingProduct.length || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, length: e.target.value })}
                    placeholder="如：28 inch"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">款式类型</label>
                  <select
                    value={editingProduct.style || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, style: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">请选择</option>
                    <option value="Straight">Straight</option>
                    <option value="Body Wave">Body Wave</option>
                    <option value="Curly">Curly</option>
                    <option value="Deep Wave">Deep Wave</option>
                    <option value="Water Wave">Water Wave</option>
                    <option value="Kinky Curly">Kinky Curly</option>
                    <option value="Loose Wave">Loose Wave</option>
                  </select>
                </div>
              </div>

              {/* 产品链接 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">产品链接</label>
                <input
                  type="url"
                  value={editingProduct.productUrl || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, productUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowEditModal(false)
                  setPreviewUrl(null)
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={uploading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
