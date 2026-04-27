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
  notes?: string
  priceUsd?: number
  costCny?: number
  stock?: number
  isActive?: boolean
  updatedAt?: string
}

const STYLE_OPTIONS = [
  { value: '', label: '请选择' },
  { value: 'Straight', label: 'Straight (直发)' },
  { value: 'Body Wave', label: 'Body Wave (大波浪)' },
  { value: 'Curly', label: 'Curly (卷发)' },
  { value: 'Deep Wave', label: 'Deep Wave (深波浪)' },
  { value: 'Water Wave', label: 'Water Wave (水波纹)' },
  { value: 'Kinky Curly', label: 'Kinky Curly (非洲卷)' },
  { value: 'Loose Wave', label: 'Loose Wave (松散波浪)' },
]

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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [recentlyUpdated, setRecentlyUpdated] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  
  // 图片预览状态
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null)

  // 自动隐藏 Toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  // 自动清除高亮
  useEffect(() => {
    if (recentlyUpdated) {
      const timer = setTimeout(() => setRecentlyUpdated(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [recentlyUpdated])

  // 新增产品表单
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    name: '',
    sku: '',
    image: '',
    color: '',
    length: '',
    style: '',
    productUrl: '',
    description: '',
    notes: '',
  })

  // 加载产品数据
  useEffect(() => {
    fetchProducts()
  }, [page, pageSize])

  const fetchProducts = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/products?page=${page}&pageSize=${pageSize}`)
      if (!res.ok) throw new Error('加载失败')
      const data = await res.json()
      setProducts(data.products || [])
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 1)
    } catch (error) {
      console.error('获取产品列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  // 搜索过滤
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

  // 处理新增
  const handleAdd = () => {
    setNewProduct({
      name: '',
      sku: '',
      image: '',
      color: '',
      length: '',
      style: '',
      productUrl: '',
      description: '',
      notes: '',
    })
    setPreviewUrl(null)
    setShowAddModal(true)
  }

  // 处理编辑
  const handleEdit = (product: Product) => {
    setEditingProduct({ ...product })
    setPreviewUrl(product.image || null)
    setShowEditModal(true)
  }

  // 处理删除确认
  const handleDeleteClick = (product: Product) => {
    setProductToDelete(product)
    setShowDeleteConfirm(true)
  }

  // 执行删除（软删除）
  const handleDeleteConfirm = async () => {
    if (!productToDelete) return
    try {
      const res = await fetch(`/api/products/${productToDelete.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setShowDeleteConfirm(false)
        setProductToDelete(null)
        fetchProducts()
      } else {
        const error = await res.json()
        alert(error.error || '删除失败')
      }
    } catch (error) {
      console.error('删除失败:', error)
      alert('删除失败')
    }
  }

  // 处理文件选择
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, isNew: boolean = false) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过 5MB')
      return
    }
    const localUrl = URL.createObjectURL(file)
    setPreviewUrl(localUrl)
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
      if (isNew) {
        setNewProduct({ ...newProduct, image: data.url })
      } else if (editingProduct) {
        setEditingProduct({ ...editingProduct, image: data.url })
      }
    } catch (error: any) {
      console.error('上传失败:', error)
      alert('上传失败: ' + error.message)
      if (isNew) {
        setPreviewUrl(newProduct.image || null)
      } else {
        setPreviewUrl(editingProduct?.image || null)
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // 保存新增
  const handleSaveNew = async () => {
    if (!newProduct.name?.trim()) {
      alert('请输入产品名称')
      return
    }
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct)
      })
      if (res.ok) {
        const createdProduct = await res.json()
        setShowAddModal(false)
        setNewProduct({
          name: '',
          sku: '',
          image: '',
          color: '',
          length: '',
          style: '',
          productUrl: '',
          description: '',
          notes: '',
        })
        setPreviewUrl(null)
        // 跳转到第一页并刷新，确保新创建的产品显示在最前面
        setPage(1)
        await fetchProducts()
        // 高亮新创建的产品
        setRecentlyUpdated(createdProduct.id)
        setToast({ message: '产品创建成功', type: 'success' })
      } else {
        const error = await res.json()
        alert(error.error || '创建失败')
      }
    } catch (error) {
      console.error('创建失败:', error)
      alert('创建失败')
    }
  }

  // 保存编辑
  const handleSave = async () => {
    if (!editingProduct) return
    if (!editingProduct.name?.trim()) {
      setToast({ message: '请输入产品名称', type: 'error' })
      return
    }
    try {
      // 检查图片大小，如果太大提示用户
      const imageUrl = editingProduct.image
      if (imageUrl && imageUrl.length > 2 * 1024 * 1024) {
        setToast({ message: '图片太大，请重新上传较小的图片（建议不超过 2MB）', type: 'error' })
        return
      }

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
          description: editingProduct.description,
          image: imageUrl,
        })
      })
      if (res.ok) {
        const updatedId = editingProduct.id
        setShowEditModal(false)
        setEditingProduct(null)
        setPreviewUrl(null)
        await fetchProducts()
        setRecentlyUpdated(updatedId)
        setToast({ message: '产品信息已更新', type: 'success' })
      } else {
        // 改进错误处理：检查响应类型
        const contentType = res.headers.get('content-type')
        let errorMessage = '保存失败'
        if (contentType && contentType.includes('application/json')) {
          const error = await res.json()
          errorMessage = error.error || '保存失败'
        } else if (res.status === 413) {
          errorMessage = '图片太大，请压缩后再上传（建议不超过 2MB）'
        } else {
          const text = await res.text()
          errorMessage = text || `保存失败 (${res.status})`
        }
        setToast({ message: errorMessage, type: 'error' })
      }
    } catch (error: any) {
      console.error('保存失败:', error)
      setToast({ message: '保存失败: ' + (error.message || '网络错误'), type: 'error' })
    }
  }

  // 打开产品链接
  const openProductUrl = (url?: string) => {
    if (url) {
      window.open(url, '_blank')
    }
  }

  // 监听 Esc 键关闭预览
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewProduct) {
        setPreviewProduct(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewProduct])

  if (!canAccess) return null

  return (
    <div className="p-6">
      <PageHeader
        title="产品库"
        description="通过图片、SKU、产品名、假发属性快速确认产品"
      />

      {/* 搜索栏和新增按钮 */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative max-w-2xl flex-1">
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

        {canEdit && (
          <button
            onClick={handleAdd}
            className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新增产品
          </button>
        )}
      </div>

      {/* 状态栏 */}
      <div className="mb-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="text-sm text-gray-500">
          共 {total} 款产品
          {totalPages > 1 && (
            <span className="ml-2">
              第 {page} 页 / 共 {totalPages} 页
              <span className="ml-1 text-gray-400">
                ({(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} / {total})
              </span>
            </span>
          )}
          {searchQuery && <span className="ml-2">(搜索 "{searchQuery}")</span>}
        </div>
        
        {/* 每页数量选择 */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">每页显示:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value))
              setPage(1)
            }}
            className="px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* Toast 提示 */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg transition-all ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* 产品网格 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          title="没有找到产品"
          description={searchQuery ? "请尝试其他搜索关键词" : "暂无产品数据，点击上方按钮新增"}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className={`relative bg-white rounded-lg border overflow-hidden hover:shadow-md transition-all group ${
                  recentlyUpdated === product.id
                    ? 'border-green-500 ring-2 ring-green-200 shadow-lg'
                    : 'border-gray-200'
                }`}
              >
                {recentlyUpdated === product.id && (
                  <div className="absolute top-0 left-0 right-0 bg-green-500 text-white text-xs py-1 px-2 text-center z-10">
                    ✓ 已更新
                  </div>
                )}
                {/* 产品图片 */}
                <div 
                  className="relative aspect-square bg-gray-100 cursor-pointer group/image"
                  onClick={() => product.image && setPreviewProduct(product)}
                >
                  {product.image ? (
                    <>
                      <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                      />
                      {/* 悬停提示 */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-sm font-medium flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                          </svg>
                          点击查看大图
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}

                  {/* 操作按钮 */}
                  {canEdit && (
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEdit(product)}
                        className="p-1.5 bg-white/90 rounded-md shadow-sm hover:bg-white"
                        title="编辑"
                      >
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteClick(product)}
                        className="p-1.5 bg-white/90 rounded-md shadow-sm hover:bg-white"
                        title="删除"
                      >
                        <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
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
                  <div className="text-xs font-mono text-gray-500 mb-1 truncate">
                    {product.sku || '无 SKU'}
                  </div>
                  <h3 className="font-medium text-gray-900 text-sm mb-2 line-clamp-2 min-h-[2.5rem]">
                    {product.name}
                  </h3>
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
          
          {/* 分页导航 */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (page <= 3) {
                    pageNum = i + 1
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = page - 2 + i
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-10 h-10 rounded-lg ${
                        page === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
                })}
              </div>
              
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}

      {/* 新增产品弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold">新增产品</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">产品图片</label>
                <div className="flex items-start gap-4">
                  <div className="relative w-32 h-32 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                    {previewUrl ? (
                      <Image src={previewUrl} alt="产品图片" fill className="object-cover" />
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
                  <div className="flex-1">
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handleFileSelect(e, true)} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      {uploading ? '上传中...' : '选择图片'}
                    </button>
                    <p className="mt-2 text-xs text-gray-500">支持 JPG、PNG、GIF 格式，最大 5MB</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKU <span className="text-gray-400">(可选)</span></label>
                <input type="text" value={newProduct.sku || ''} onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })} placeholder="如：WIG-001" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">产品名称 <span className="text-red-500">*</span></label>
                <input type="text" value={newProduct.name || ''} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="请输入产品名称" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">颜色</label>
                  <input type="text" value={newProduct.color || ''} onChange={(e) => setNewProduct({ ...newProduct, color: e.target.value })} placeholder="如：1B" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">长度</label>
                  <input type="text" value={newProduct.length || ''} onChange={(e) => setNewProduct({ ...newProduct, length: e.target.value })} placeholder="如：28 inch" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">款式类型</label>
                  <select value={newProduct.style || ''} onChange={(e) => setNewProduct({ ...newProduct, style: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    {STYLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">产品链接</label>
                <input type="url" value={newProduct.productUrl || ''} onChange={(e) => setNewProduct({ ...newProduct, productUrl: e.target.value })} placeholder="https://..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">产品介绍</label>
                <textarea value={newProduct.description || ''} onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })} placeholder="填写产品核心卖点、适合达人/风格、颜色长度特点、适合直播还是短视频、团队内部备注等..." rows={4} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea value={newProduct.notes || ''} onChange={(e) => setNewProduct({ ...newProduct, notes: e.target.value })} placeholder="产品备注信息..." rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => { setShowAddModal(false); setPreviewUrl(null); }} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={handleSaveNew} disabled={uploading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">创建</button>
            </div>
          </div>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">产品图片</label>
                <div className="flex items-start gap-4">
                  <div className="relative w-32 h-32 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                    {previewUrl ? (
                      <Image src={previewUrl} alt="产品图片" fill className="object-cover" />
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
                  <div className="flex-1">
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handleFileSelect(e, false)} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      {uploading ? '上传中...' : '选择图片'}
                    </button>
                    <p className="mt-2 text-xs text-gray-500">支持 JPG、PNG、GIF 格式，最大 5MB</p>
                    {editingProduct.image && (
                      <button onClick={() => { setEditingProduct({ ...editingProduct, image: '' }); setPreviewUrl(null); }} className="mt-2 text-xs text-red-600 hover:text-red-800">删除图片</button>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                <input type="text" value={editingProduct.sku || ''} onChange={(e) => setEditingProduct({ ...editingProduct, sku: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">产品名称</label>
                <input type="text" value={editingProduct.name || ''} onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">颜色</label>
                  <input type="text" value={editingProduct.color || ''} onChange={(e) => setEditingProduct({ ...editingProduct, color: e.target.value })} placeholder="如：1B" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">长度</label>
                  <input type="text" value={editingProduct.length || ''} onChange={(e) => setEditingProduct({ ...editingProduct, length: e.target.value })} placeholder="如：28 inch" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">款式类型</label>
                  <select value={editingProduct.style || ''} onChange={(e) => setEditingProduct({ ...editingProduct, style: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    {STYLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">产品链接</label>
                <input type="url" value={editingProduct.productUrl || ''} onChange={(e) => setEditingProduct({ ...editingProduct, productUrl: e.target.value })} placeholder="https://..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">产品介绍</label>
                <textarea value={editingProduct.description || ''} onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })} placeholder="填写产品核心卖点、适合达人/风格、颜色长度特点、适合直播还是短视频、团队内部备注等..." rows={4} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => { setShowEditModal(false); setPreviewUrl(null); }} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={handleSave} disabled={uploading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && productToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-red-600">确认下架产品</h2>
            </div>
            <div className="p-6">
              <p className="text-gray-700 mb-4">
                确定要下架产品 <strong>"{productToDelete.name}"</strong> 吗？
              </p>
              <p className="text-sm text-gray-500">
                下架后产品将不再显示在产品库中，但历史关联数据（如达人建联、寄样记录等）将保留。
              </p>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => { setShowDeleteConfirm(false); setProductToDelete(null); }} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={handleDeleteConfirm} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">确认下架</button>
            </div>
          </div>
        </div>
      )}

      {/* 图片预览弹窗 */}
      {previewProduct && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewProduct(null)}
        >
          <div 
            className="relative max-w-4xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              onClick={() => setPreviewProduct(null)}
              className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white transition-colors"
              title="关闭 (Esc)"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* 图片容器 */}
            <div className="relative flex-1 flex items-center justify-center bg-black/50 rounded-lg overflow-hidden min-h-[300px]">
              {previewProduct.image ? (
                <Image
                  src={previewProduct.image}
                  alt={previewProduct.name}
                  width={800}
                  height={800}
                  className="object-contain max-h-[70vh] w-auto"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <svg className="w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
            </div>

            {/* 产品信息 */}
            <div className="mt-4 bg-white rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="text-sm font-mono text-gray-500 mb-1">
                    {previewProduct.sku || '无 SKU'}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {previewProduct.name}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {previewProduct.color && (
                      <span className="px-2 py-1 bg-pink-50 text-pink-700 text-sm rounded">
                        颜色: {previewProduct.color}
                      </span>
                    )}
                    {previewProduct.length && (
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 text-sm rounded">
                        长度: {previewProduct.length}
                      </span>
                    )}
                    {previewProduct.style && (
                      <span className="px-2 py-1 bg-purple-50 text-purple-700 text-sm rounded">
                        款式: {previewProduct.style}
                      </span>
                    )}
                  </div>
                </div>
                {previewProduct.productUrl && (
                  <a
                    href={previewProduct.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    打开链接
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
