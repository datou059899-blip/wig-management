'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import * as XLSX from 'xlsx'

interface ParsedRow {
  sku: string
  skuId?: string
  title?: string
  priceUsd: number
  originalPriceUsd?: number
  stock: number
  status?: string
}

export default function TikTokSyncPage() {
  const { data: session } = useSession()
  const userRole = (session?.user as any)?.role
  const canEdit = userRole === 'admin' || userRole === 'operator'
  
  const [fileName, setFileName] = useState('')
  const [parsedData, setParsedData] = useState<ParsedRow[]>([])
  const [syncData, setSyncData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [debugInfo, setDebugInfo] = useState<string[][]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 规范化函数
  const norm = (s: string) => {
    if (!s) return ''
    return s
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/_/g, ' ')
      .toLowerCase()
      .trim()
  }

  // 检查是否像模板行
  const looksLikeTemplateRow = (sku: string) => {
    if (!sku) return true
    const templateKeywords = [
      '商品或销售变体的识别码',
      '用于在其他系统中快速找到商品',
      '用于匹配系统中的商品',
      '示例',
      '示例:',
    ]
    return templateKeywords.some(kw => sku.includes(kw)) || sku.length > 50
  }

  // 解析价格
  const parsePrice = (val: any): number => {
    if (typeof val === 'number') return val
    if (!val) return 0
    const cleaned = String(val).replace(/,/g, '').replace(/¥/g, '').trim()
    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : num
  }

  // 解析库存
  const parseStock = (val: any): number => {
    if (typeof val === 'number') return val
    if (!val) return 0
    const cleaned = String(val).replace(/,/g, '').trim()
    const num = parseInt(cleaned)
    return isNaN(num) ? 0 : num
  }

  // 解析 Excel 文件
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setMessage({ type: '', text: '' })
    setFileName(file.name)
    setDebugInfo([])

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]
      
      if (jsonData.length < 2) {
        setMessage({ type: 'error', text: '文件数据行数不足' })
        setLoading(false)
        return
      }

      // 设置调试信息（前6行）
      setDebugInfo(jsonData.slice(0, 6))

      // 识别表头行 - TikTok All_Information 模板格式
      const SKU_HEADER_KEYS = ['seller_sku', '商家sku', 'seller sku', '商家 sku']
      const PRICE_HEADER_KEYS = ['零售价（本地币种）', 'price', 'list price', '售价', '价格']
      const STOCK_HEADER_KEYS = ['warehouse quantity', 'warehouse_quantity', '库存', 'quantity']

      // 检测 TikTok All_Information 模板（第1行包含 "All_Information"）
      const isTikTokTemplate = jsonData.length > 1 && 
        Array.isArray(jsonData[1]) && 
        jsonData[1].some((cell: any) => String(cell).includes('All_Information'))

      let bestHeaderRow = -1
      let dataStartRow = 1 // 默认数据从表头后一行开始

      if (isTikTokTemplate) {
        // TikTok All_Information 模板：
        // 第0行是列名 (product_id, category...)
        // 第1行是 "V3", "All_Information", "metric"
        // 第2行是中文列名 (商品 ID, 类目...)
        // 第3行是必填信息
        // 第4行是填写说明
        // 第5行开始是实际数据
        bestHeaderRow = 0
        dataStartRow = 6 // 从第6行开始读取数据
      } else {
        // 普通格式：查找包含 seller_sku 的行
        let bestScore = 0

        for (let i = 0; i < Math.min(10, jsonData.length); i++) {
          const row = jsonData[i]
          if (!Array.isArray(row)) continue
          
          let score = 0
          let hasSku = false

          for (const cell of row) {
            const normalized = norm(String(cell))
            if (SKU_HEADER_KEYS.some(k => normalized.includes(k))) {
              score += 2
              hasSku = true
            }
            if (PRICE_HEADER_KEYS.some(k => normalized.includes(k))) score += 1
            if (STOCK_HEADER_KEYS.some(k => normalized.includes(k))) score += 1
          }

          if (hasSku && score > bestScore) {
            bestScore = score
            bestHeaderRow = i
          }
        }

        if (bestHeaderRow === -1) {
          bestHeaderRow = 0
        }
      }

      const headerRow = jsonData[bestHeaderRow]
      
      // 找列索引
      let skuCol = -1
      let priceCol = -1
      let stockCol = -1
      let skuIdCol = -1
      let titleCol = -1
      let originalPriceCol = -1

      headerRow.forEach((cell: any, idx: number) => {
        const normalized = norm(String(cell))
        if (skuCol === -1 && SKU_HEADER_KEYS.some(k => normalized.includes(k))) skuCol = idx
        if (priceCol === -1 && PRICE_HEADER_KEYS.some(k => normalized.includes(k))) priceCol = idx
        if (stockCol === -1 && STOCK_HEADER_KEYS.some(k => normalized.includes(k))) stockCol = idx
        if (normalized.includes('sku_id')) skuIdCol = idx
        if (normalized.includes('title') || normalized.includes('商品标题')) titleCol = idx
        if (normalized.includes('original') || normalized.includes('原价')) originalPriceCol = idx
      })

      if (skuCol === -1) {
        setMessage({ type: 'error', text: '无法识别 SKU 列，请检查表头' })
        setLoading(false)
        return
      }

      // 解析数据行
      const parsed: ParsedRow[] = []
      for (let i = dataStartRow; i < jsonData.length; i++) {
        const row = jsonData[i]
        if (!Array.isArray(row) || !row[skuCol]) continue
        
        const sku = String(row[skuCol]).trim()
        if (looksLikeTemplateRow(sku)) continue
        if (!sku) continue

        parsed.push({
          sku,
          skuId: skuIdCol >= 0 ? String(row[skuIdCol] || '') : undefined,
          title: titleCol >= 0 ? String(row[titleCol] || '') : undefined,
          priceUsd: priceCol >= 0 ? parsePrice(row[priceCol]) : 0,
          originalPriceUsd: originalPriceCol >= 0 ? parsePrice(row[originalPriceCol]) : undefined,
          stock: stockCol >= 0 ? parseStock(row[stockCol]) : 0,
        })
      }

      setParsedData(parsed)
      if (parsed.length === 0) {
        setMessage({ type: 'error', text: '未能解析到有效数据行' })
      } else {
        setMessage({ type: 'success', text: `成功解析 ${parsed.length} 条数据` })
      }
    } catch (error) {
      console.error('解析文件失败:', error)
      setMessage({ type: 'error', text: '解析文件失败，请检查文件格式' })
    } finally {
      setLoading(false)
    }
  }

  // 同步到服务器
  const handleSync = async () => {
    if (parsedData.length === 0) return
    
    setSyncing(true)
    setMessage({ type: '', text: '' })

    try {
      const res = await fetch('/api/tiktok-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: parsedData }),
      })
      
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: `同步成功，共 ${data.count} 条记录` })
        setParsedData([])
        fetchSyncData()
      } else {
        setMessage({ type: 'error', text: data.error || '同步失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '同步失败，请重试' })
    } finally {
      setSyncing(false)
    }
  }

  // 获取已同步数据
  const fetchSyncData = async () => {
    try {
      const res = await fetch('/api/tiktok-sync')
      const data = await res.json()
      if (res.ok) {
        setSyncData(data.syncs || [])
      }
    } catch (error) {
      console.error('获取同步数据失败:', error)
    }
  }

  // 清空同步数据
  const handleClear = async () => {
    if (!confirm('确定要清空所有 TikTok 同步数据吗？')) return
    
    try {
      const res = await fetch('/api/tiktok-sync', { method: 'DELETE' })
      if (res.ok) {
        setMessage({ type: 'success', text: '清空成功' })
        setSyncData([])
      } else {
        setMessage({ type: 'error', text: '清空失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '清空失败' })
    }
  }

  // 加载已同步数据
  useEffect(() => {
    fetchSyncData()
  }, [])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">TikTok 数据同步</h1>
        <p className="text-gray-600">从 TikTok 后台导出的 Excel 文件中导入 SKU、价格、库存</p>
      </div>

      {/* 消息提示 */}
      {message.text && (
        <div className={`mb-4 p-3 rounded-lg ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
          {message.text}
        </div>
      )}

      {/* 文件上传 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">导入数据</h2>
        
        <div className="flex items-center gap-4 mb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || !canEdit}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '解析中...' : '选择文件'}
          </button>
          {fileName && <span className="text-gray-600">{fileName}</span>}
        </div>

        {/* 解析预览 */}
        {parsedData.length > 0 && canEdit && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">预览 ({parsedData.length} 条)</span>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {syncing ? '同步中...' : '确认同步'}
              </button>
            </div>
            <div className="overflow-x-auto border rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">价格 (USD)</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">库存</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {parsedData.slice(0, 10).map((row, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-sm">{row.sku}</td>
                      <td className="px-4 py-2 text-sm">${row.priceUsd.toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm">{row.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsedData.length > 10 && (
              <p className="text-sm text-gray-500 mt-2">... 还有 {parsedData.length - 10} 条</p>
            )}
          </div>
        )}

        {/* 调试信息 */}
        {debugInfo.length > 0 && parsedData.length === 0 && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-700 mb-2">原始数据（前6行）:</p>
            <pre className="text-xs overflow-x-auto">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* 已同步数据列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            已同步数据 ({syncData.length})
          </h2>
          {canEdit && syncData.length > 0 && (
            <button
              onClick={handleClear}
              className="px-3 py-1 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50"
            >
              清空数据
            </button>
          )}
        </div>

        {syncData.length === 0 ? (
          <p className="text-gray-500 text-center py-8">暂无同步数据</p>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">标题</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">价格 (USD)</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">库存</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">同步时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {syncData.slice(0, 20).map((item: any) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2 text-sm">{item.sku}</td>
                    <td className="px-4 py-2 text-sm truncate max-w-xs">{item.title || '-'}</td>
                    <td className="px-4 py-2 text-sm">${item.priceUsd?.toFixed(2) || '0.00'}</td>
                    <td className="px-4 py-2 text-sm">{item.stock}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {new Date(item.syncedAt).toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
