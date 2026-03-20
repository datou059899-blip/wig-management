'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { canAccessTiktokSync } from '@/lib/permissions'
import { PageHeader } from '@/components/layout/PageHeader'

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
  const router = useRouter()
  const { data: session } = useSession()
  const userRole = (session?.user as any)?.role
  const canAccess = canAccessTiktokSync(userRole)
  const canEdit = canAccess

  useEffect(() => {
    if (session !== undefined && !canAccess) {
      router.replace('/dashboard')
    }
  }, [session, canAccess, router])

  const [fileName, setFileName] = useState('')
  const [parsedData, setParsedData] = useState<ParsedRow[]>([])
  const [syncData, setSyncData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [debugInfo, setDebugInfo] = useState<string[][]>([])
  const [syncRange, setSyncRange] = useState<'all' | '24h' | '7d'>('all')
  const [lastStats, setLastStats] = useState<{
    at?: string
    by?: string
    total?: number
    added?: number
    updated?: number
    failed?: number
    fileName?: string
  }>({})
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
        const total = parsedData.length
        const added = typeof data.added === 'number' ? data.added : total
        const updated = typeof data.updated === 'number' ? data.updated : 0
        const failed = typeof data.failed === 'number' ? data.failed : 0

        setLastStats({
          at: new Date().toISOString(),
          by: (session?.user?.name as string) || (session?.user?.email as string) || '系统',
          total,
          added,
          updated,
          failed,
          fileName,
        })

        setMessage({ type: 'success', text: `同步成功，共 ${data.count ?? total} 条记录` })
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
    if (!parsedData.length && !fileName) return
    if (!confirm('仅清空本次导入的解析结果，不影响已写入系统的数据。确定继续？')) return

    setParsedData([])
    setFileName('')
    setDebugInfo([])
    setMessage({ type: 'success', text: '已清空本次导入记录' })
  }

  // 加载已同步数据
  useEffect(() => {
    fetchSyncData()
  }, [])

  if (session === undefined || !canAccess) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        {session === undefined ? '加载中...' : '无权限访问 TikTok 同步，正在跳转...'}
      </div>
    )
  }

  const latestSynced = syncData.reduce<any | null>((acc, cur) => {
    if (!cur?.syncedAt) return acc
    if (!acc) return cur
    return new Date(cur.syncedAt) > new Date(acc.syncedAt) ? cur : acc
  }, null)

  const summaryAt = lastStats.at || (latestSynced ? latestSynced.syncedAt : undefined)
  const summaryBy =
    lastStats.by ||
    ((session?.user?.name as string) || (session?.user?.email as string) || (latestSynced?.syncedBy as string) || '—')
  const summaryTotal = lastStats.total ?? (latestSynced ? syncData.length : 0)
  const summaryAdded = lastStats.added ?? undefined
  const summaryUpdated = lastStats.updated ?? undefined
  const summaryFailed = lastStats.failed ?? undefined

  const filteredSyncData = syncData.filter((item: any) => {
    if (syncRange === 'all') return true
    if (!item.syncedAt) return false
    const ts = new Date(item.syncedAt).getTime()
    const diff = Date.now() - ts
    if (syncRange === '24h') return diff <= 24 * 60 * 60 * 1000
    if (syncRange === '7d') return diff <= 7 * 24 * 60 * 60 * 1000
    return true
  })

  return (
    <div>
      <PageHeader
        title="TikTok 同步工作台"
        description="每天导入 TikTok 后台导出的 Excel，同步每个假发 SKU 的售价与库存，为价格体检和毛利分析提供最新底数。"
      />

      {/* 消息提示 */}
      {message.text && (
        <div className={`mb-4 p-3 rounded-lg ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
          {message.text}
        </div>
      )}

      {/* 上传与同步摘要 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">步骤一：上传 TikTok 导出文件</h2>

        {/* 同步摘要 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 text-xs text-gray-600">
          <div>
            <div className="text-gray-500">最近一次同步时间</div>
            <div className="mt-1 text-sm text-gray-900">
              {summaryAt ? new Date(summaryAt).toLocaleString('zh-CN') : '—'}
            </div>
          </div>
          <div>
            <div className="text-gray-500">最近同步人</div>
            <div className="mt-1 text-sm text-gray-900">{summaryBy}</div>
          </div>
          <div>
            <div className="text-gray-500">上次导入条数</div>
            <div className="mt-1 text-sm text-gray-900">{summaryTotal || '—'}</div>
          </div>
          <div>
            <div className="text-gray-500">上次新增</div>
            <div className="mt-1 text-sm text-gray-900">
              {typeof summaryAdded === 'number' ? summaryAdded : '—'}
            </div>
          </div>
          <div>
            <div className="text-gray-500">上次更新</div>
            <div className="mt-1 text-sm text-gray-900">
              {typeof summaryUpdated === 'number' ? summaryUpdated : '—'}
            </div>
          </div>
          <div>
            <div className="text-gray-500">上次失败</div>
            <div className="mt-1 text-sm text-gray-900">
              {typeof summaryFailed === 'number' ? summaryFailed : '—'}
            </div>
          </div>
        </div>

        {/* 上传说明 */}
        <div className="mb-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
          <p>· 支持直接上传 TikTok 后台导出的 All_Information Excel 文件（.xlsx / .xls / .csv）。</p>
          <p>· 导入后会同步每个 SKU 的价格与库存，用于价格体检与毛利分析。</p>
          <p>· 建议每天至少同步 1 次，保证价格对账和产品驾驶舱的数据新鲜。</p>
        </div>

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

        {canEdit && (parsedData.length > 0 || fileName) && (
          <button
            onClick={handleClear}
            className="mb-4 inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            清空本次导入记录
          </button>
        )}

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

      {/* 同步结果卡片 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">步骤二：本次同步结果</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="text-xs text-gray-500">成功同步</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">
              {(summaryTotal ?? 0) - (summaryFailed ?? 0)}
            </div>
          </div>
          <div className="rounded-lg border border-gray-100 bg-green-50 p-3">
            <div className="text-xs text-gray-600">新增商品</div>
            <div className="mt-1 text-lg font-semibold text-green-700">
              {typeof summaryAdded === 'number' ? summaryAdded : 0}
            </div>
          </div>
          <div className="rounded-lg border border-gray-100 bg-blue-50 p-3">
            <div className="text-xs text-gray-600">更新商品</div>
            <div className="mt-1 text-lg font-semibold text-blue-700">
              {typeof summaryUpdated === 'number' ? summaryUpdated : 0}
            </div>
          </div>
          <div className="rounded-lg border border-gray-100 bg-red-50 p-3">
            <div className="text-xs text-gray-600">失败记录</div>
            <div className="mt-1 text-lg font-semibold text-red-700">
              {typeof summaryFailed === 'number' ? summaryFailed : 0}
            </div>
          </div>
        </div>
      </div>

      {/* 已同步数据列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            步骤三：已写入系统的 TikTok 商品 ({filteredSyncData.length})
          </h2>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span>最近同步：</span>
            <select
              value={syncRange}
              onChange={(e) => setSyncRange(e.target.value as any)}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs"
            >
              <option value="all">全部</option>
              <option value="24h">最近 24 小时</option>
              <option value="7d">最近 7 天</option>
            </select>
          </div>
        </div>

        {filteredSyncData.length === 0 ? (
          <p className="text-gray-500 text-center py-8">暂无同步数据，可先上传 TikTok 导出文件完成一次同步。</p>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">标题</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">价格 (USD)</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">库存</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">同步状态</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">是否异常</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">来源文件</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">同步人</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">同步时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredSyncData.slice(0, 100).map((item: any) => {
                  const status = item.status || '已同步'
                  const abnormal = !item.priceUsd || item.priceUsd <= 0 || item.stock < 0
                  const sourceFile = item.sourceFile || lastStats.fileName || 'TikTok 导出'
                  const syncUser =
                    item.syncedBy ||
                    (session?.user?.name as string) ||
                    (session?.user?.email as string) ||
                    '系统'

                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-2 text-sm">{item.sku}</td>
                      <td className="px-4 py-2 text-sm truncate max-w-xs">{item.title || '-'}</td>
                      <td className="px-4 py-2 text-sm">${item.priceUsd?.toFixed(2) || '0.00'}</td>
                      <td className="px-4 py-2 text-sm">{item.stock}</td>
                      <td className="px-4 py-2 text-xs">
                        <span
                          className={
                            status === '已同步'
                              ? 'inline-flex rounded-full bg-green-50 px-2 py-0.5 text-[11px] text-green-700'
                              : 'inline-flex rounded-full bg-yellow-50 px-2 py-0.5 text-[11px] text-yellow-700'
                          }
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <span
                          className={
                            abnormal
                              ? 'inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-700'
                              : 'inline-flex rounded-full bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600'
                          }
                        >
                          {abnormal ? '异常' : '正常'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-700 truncate max-w-[140px]">
                        {sourceFile}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-700">{syncUser}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {item.syncedAt ? new Date(item.syncedAt).toLocaleString('zh-CN') : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
