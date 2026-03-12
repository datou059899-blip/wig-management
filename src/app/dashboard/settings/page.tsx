'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

export default function SettingsPage() {
  const { data: session } = useSession()
  const userRole = (session?.user as any)?.role
  const isAdmin = userRole === 'admin'
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  
  const [exchangeRate, setExchangeRate] = useState('7.2')
  const [stockWarningThreshold, setStockWarningThreshold] = useState('10')
  const [profitMarginWarningThreshold, setProfitMarginWarningThreshold] = useState('20')

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/config')
      const data = await res.json()
      if (res.ok) {
        setExchangeRate(data.exchange_rate || '7.2')
        setStockWarningThreshold(data.stock_warning_threshold || '10')
        setProfitMarginWarningThreshold(data.profit_margin_warning_threshold || '20')
      }
    } catch (error) {
      console.error('获取配置失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!isAdmin) return
    
    setSaving(true)
    setMessage({ type: '', text: '' })
    
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange_rate: exchangeRate,
          stock_warning_threshold: stockWarningThreshold,
          profit_margin_warning_threshold: profitMarginWarningThreshold,
        }),
      })
      
      if (res.ok) {
        setMessage({ type: 'success', text: '保存成功' })
      } else {
        setMessage({ type: 'error', text: '保存失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">只有管理员可以访问系统设置</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        加载中...
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">系统设置</h1>
        <p className="text-gray-600">配置系统参数和预警阈值</p>
      </div>

      {message.text && (
        <div className={`mb-4 p-3 rounded-lg ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-2xl">
        <div className="space-y-6">
          {/* 汇率设置 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              汇率 (CNY → USD)
            </label>
            <input
              type="number"
              step="0.01"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="例如: 7.2"
            />
            <p className="mt-1 text-sm text-gray-500">
              1 元人民币等于多少美元
            </p>
          </div>

          {/* 库存预警阈值 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              库存预警阈值
            </label>
            <input
              type="number"
              value={stockWarningThreshold}
              onChange={(e) => setStockWarningThreshold(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="例如: 10"
            />
            <p className="mt-1 text-sm text-gray-500">
              库存低于此数值时触发预警
            </p>
          </div>

          {/* 毛利率预警阈值 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              毛利率预警阈值 (%)
            </label>
            <input
              type="number"
              step="0.1"
              value={profitMarginWarningThreshold}
              onChange={(e) => setProfitMarginWarningThreshold(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="例如: 20"
            />
            <p className="mt-1 text-sm text-gray-500">
              毛利率低于此百分比时触发预警
            </p>
          </div>

          {/* 保存按钮 */}
          <div className="pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2 px-4 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
