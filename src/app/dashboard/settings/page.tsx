'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { canAccessSettings } from '@/lib/permissions'
import { PageHeader } from '@/components/layout/PageHeader'

export default function SettingsPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const userRole = (session?.user as any)?.role
  const isAdmin = canAccessSettings(userRole)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  const [exchangeRate, setExchangeRate] = useState('7.2')
  const [stockWarningThreshold, setStockWarningThreshold] = useState('10')
  const [profitMarginWarningThreshold, setProfitMarginWarningThreshold] = useState('20')
  const [defaultCurrency, setDefaultCurrency] = useState('USD')
  const [timezone, setTimezone] = useState('Asia/Shanghai')
  const [priceDiffThreshold, setPriceDiffThreshold] = useState('20')
  const [scriptDefaultDueDays, setScriptDefaultDueDays] = useState('1')
  const [influencerFollowupDays, setInfluencerFollowupDays] = useState('2')
  const [sampleNudgeDays, setSampleNudgeDays] = useState('7')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [lastSavedBy, setLastSavedBy] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (session !== undefined && !isAdmin) {
      router.replace('/dashboard')
    }
  }, [session, isAdmin, router])

  useEffect(() => {
    if (isAdmin) fetchConfig()
  }, [isAdmin])

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/config')
      const data = await res.json()
      if (res.ok) {
        setExchangeRate(data.exchange_rate || '7.2')
        setStockWarningThreshold(data.stock_warning_threshold || '10')
        setProfitMarginWarningThreshold(data.profit_margin_warning_threshold || '20')
        setDefaultCurrency(data.default_currency || 'USD')
        setTimezone(data.timezone || 'Asia/Shanghai')
        setPriceDiffThreshold(data.price_diff_threshold || '20')
        setScriptDefaultDueDays(data.script_default_due_days || '1')
        setInfluencerFollowupDays(data.influencer_followup_days || '2')
        setSampleNudgeDays(data.sample_nudge_days || '7')
        setLastSavedAt(data.__last_saved_at || null)
        setLastSavedBy(data.__last_saved_by || null)
        setDirty(false)
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
          default_currency: defaultCurrency,
          timezone,
          price_diff_threshold: priceDiffThreshold,
          script_default_due_days: scriptDefaultDueDays,
          influencer_followup_days: influencerFollowupDays,
          sample_nudge_days: sampleNudgeDays,
          __last_saved_at: new Date().toISOString(),
          __last_saved_by:
            (session?.user?.name as string) || (session?.user?.email as string) || '系统',
        }),
      })
      
      if (res.ok) {
        setMessage({ type: 'success', text: '保存成功' })
        setLastSavedAt(new Date().toISOString())
        setLastSavedBy(
          ((session?.user?.name as string) ||
            (session?.user?.email as string) ||
            '系统') as string,
        )
        setDirty(false)
      } else {
        setMessage({ type: 'error', text: '保存失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  if (session === undefined || !isAdmin) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        {session === undefined ? '加载中...' : '无权限访问系统设置，正在跳转...'}
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
      <PageHeader
        title="系统设置中心"
        description="统一配置汇率、预警阈值与业务规则，确保产品、价格、脚本训练和达人建联在同一套参数下运转。"
        actions={
          <div className="text-xs text-gray-500 space-y-0.5 text-right">
            <div>
              最近保存时间：
              {lastSavedAt ? new Date(lastSavedAt).toLocaleString('zh-CN') : '—'}
            </div>
            <div>最近保存人：{lastSavedBy || '—'}</div>
          </div>
        }
      />

      {message.text && (
        <div
          className={`mb-4 p-3 rounded-lg ${
            message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
          }`}
        >
          {message.text}
        </div>
      )}

      {dirty && (
        <div className="mb-4 p-3 rounded-lg bg-blue-50 text-blue-700 text-xs">
          当前有未保存的设置修改，离开页面前请先点击下方“保存设置中心”。
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-6xl">
        {/* 基础参数 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">A. 基础参数</h2>
            <p className="mt-1 text-xs text-gray-500">
              决定所有价格、时间和展示的基础单位，建议只由管理员修改。
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              汇率 (CNY → USD)
            </label>
            <input
              type="number"
              step="0.01"
              value={exchangeRate}
              onChange={(e) => {
                setExchangeRate(e.target.value)
                setDirty(true)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="例如: 7.2"
            />
            <p className="mt-1 text-xs text-gray-500">
              1 元人民币等于多少美元，用于成本和毛利换算。
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              默认币种
            </label>
            <select
              value={defaultCurrency}
              onChange={(e) => {
                setDefaultCurrency(e.target.value)
                setDirty(true)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="USD">USD（美元）</option>
              <option value="CNY">CNY（人民币）</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              价格和统计报表的默认展示币种，目前产品和价格对账以 USD 为主。
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              时区
            </label>
            <select
              value={timezone}
              onChange={(e) => {
                setTimezone(e.target.value)
                setDirty(true)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="Asia/Shanghai">Asia/Shanghai（中国时间）</option>
              <option value="UTC">UTC</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              用于展示“今日”“最近 7 天”等统计时间的计算基准。
            </p>
          </div>
        </div>

        {/* 预警规则 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">B. 预警规则</h2>
            <p className="mt-1 text-xs text-gray-500">
              用于产品驾驶舱和价格体检的红黄灯规则，建议每次调整后观察一周再改。
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              库存预警阈值
            </label>
            <input
              type="number"
              value={stockWarningThreshold}
              onChange={(e) => {
                setStockWarningThreshold(e.target.value)
                setDirty(true)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="例如: 10"
            />
            <p className="mt-1 text-xs text-gray-500">
              产品库存低于该数值时，在产品驾驶舱中标记为“库存预警”。
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              毛利率预警阈值 (%)
            </label>
            <input
              type="number"
              step="0.1"
              value={profitMarginWarningThreshold}
              onChange={(e) => {
                setProfitMarginWarningThreshold(e.target.value)
                setDirty(true)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="例如: 20"
            />
            <p className="mt-1 text-xs text-gray-500">
              毛利率低于该百分比时，在产品驾驶舱中标记为“低毛利”。
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              价格差异阈值 (%)
            </label>
            <input
              type="number"
              step="1"
              value={priceDiffThreshold}
              onChange={(e) => {
                setPriceDiffThreshold(e.target.value)
                setDirty(true)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="例如: 20"
            />
            <p className="mt-1 text-xs text-gray-500">
              TikTok 价格体检中，本地价与平台价差异超过该百分比时，标记为“价格异常 / 建议调价”。
            </p>
          </div>
        </div>

        {/* 业务规则 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">C. 业务规则</h2>
            <p className="mt-1 text-xs text-gray-500">
              针对脚本训练和达人建联的默认规则，帮助团队形成稳定的协作节奏。
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              脚本默认截止时间（天）
            </label>
            <input
              type="number"
              value={scriptDefaultDueDays}
              onChange={(e) => {
                setScriptDefaultDueDays(e.target.value)
                setDirty(true)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="例如: 1"
            />
            <p className="mt-1 text-xs text-gray-500">
              创建剪辑任务时，默认的“今日/本次练习”截止天数，用于生成 due 时间。
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              达人跟进提醒天数
            </label>
            <input
              type="number"
              value={influencerFollowupDays}
              onChange={(e) => {
                setInfluencerFollowupDays(e.target.value)
                setDirty(true)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="例如: 2"
            />
            <p className="mt-1 text-xs text-gray-500">
              已发送但未回复的达人超过该天数后，在达人建联工作台的“今日待跟进提醒”中提示。
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              已寄样催出片天数
            </label>
            <input
              type="number"
              value={sampleNudgeDays}
              onChange={(e) => {
                setSampleNudgeDays(e.target.value)
                setDirty(true)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="例如: 7"
            />
            <p className="mt-1 text-xs text-gray-500">
              已寄样但尚未出片的达人超过该天数后，在达人建联工作台中提示“已寄样待催出片”。
            </p>
          </div>
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="mt-6 max-w-6xl">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full lg:w-auto px-6 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {saving ? '保存中...' : '保存设置中心'}
        </button>
      </div>
    </div>
  )
}
