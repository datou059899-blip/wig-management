'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { canAccessInfluencers, canManageInfluencers } from '@/lib/permissions'
// 跨用户同步：以数据库/API 为唯一真源（不再用 localStorage 作为真源）

type InfluencerStatus =
  | 'to_outreach'
  | 'sent'
  | 'sample_sent'
  | 'cooperating'
  | 'posted'
  | 'done'
  | 'paused'
  | 'not_coop'

type Potential = 'A' | 'B' | 'C'
type CooperationLevel = 'normal' | 'key' | 'deep'

type FollowUp = {
  id: string
  at: string // ISO
  by: string
  note: string
  type?: '首联' | '二次跟进' | '报价沟通' | '寄样沟通' | '催出片' | '复盘' | '其他'
  channel?: '私信' | '邮件' | 'WhatsApp' | '微信' | '其他'
  responseStatus?: '无回复' | '有兴趣' | '拒绝' | '待确认'
  nextAction?: string
  nextFollowUpAt?: string // ISO
}

type Influencer = {
  id: string
  nickname: string
  platform: 'TikTok' | 'Instagram' | 'YouTube' | 'Other'
  profileUrl?: string
  country?: string
  followers: number
  contentTypes: string[]
  productLines: string[]
  matchProducts: string[]
  status: InfluencerStatus
  cooperationLevel?: CooperationLevel
  owner: string
  potential: Potential
  email?: string
  whatsapp?: string
  phone?: string
  instagram?: string
  otherContact?: string
  language?: string
  tags?: string[]
  matchedProducts?: string[]
  lastFollowUpAt?: string // ISO
  lastFollowUpNote?: string
  firstContactAt?: string // ISO
  nextFollowUpAt?: string // ISO
  nextAction: string
  timeline: FollowUp[]
  quote?: { currency: 'USD'; amount?: number; note?: string }
  commission?: number
  sample?: { address?: string; tracking?: string; sentAt?: string }
  deepRequirements?: string
  deepKeyProducts?: string[]
  deepFrequency?: string
  deepNotes?: string
  deliverables?: { videoUrl?: string; postedAt?: string; note?: string }
  review?: { summary?: string; score?: number }
  isLongTermPartner?: boolean
  isPaused?: boolean
}

const coopLabel: Record<CooperationLevel, string> = {
  normal: '普通',
  key: '重点',
  deep: '深度合作',
}

const coopTone: Record<CooperationLevel, string> = {
  normal: 'bg-gray-50 text-gray-700 border-gray-200',
  key: 'bg-amber-50 text-amber-800 border-amber-200',
  deep: 'bg-purple-50 text-purple-700 border-purple-200',
}

function CoopBadge({ level }: { level?: CooperationLevel }) {
  const v: CooperationLevel = level || 'normal'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] whitespace-nowrap ${coopTone[v]}`}>
      {coopLabel[v]}
    </span>
  )
}

const statusLabel: Record<InfluencerStatus, string> = {
  to_outreach: '待建联',
  sent: '已发送',
  sample_sent: '已寄样',
  cooperating: '合作中',
  posted: '已出片',
  done: '已完成',
  paused: '暂停跟进',
  not_coop: '不合作',
}

const statusTone: Record<
  InfluencerStatus,
  { bg: string; text: string; border: string }
> = {
  to_outreach: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  sent: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  sample_sent: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  cooperating: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  posted: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  done: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  paused: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  not_coop: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
}

function formatFollowers(n: number) {
  if (!Number.isFinite(n)) return '-'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}W`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(Math.round(n))
}

function daysAgo(iso?: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  return `${days} 天前`
}

function daysDiffFromNow(iso?: string) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function computeReminder(x: Influencer): { level: 'info' | 'warn'; text: string } | null {
  const last = x.lastFollowUpAt || x.sample?.sentAt || x.deliverables?.postedAt
  const d = daysDiffFromNow(last)
  if (x.status === 'sent' && (d == null || d >= 3)) return { level: 'warn', text: '已发送 3 天未回复：建议二次跟进' }
  if (x.status === 'cooperating' && (d == null || d >= 2)) return { level: 'warn', text: '合作中 2 天无进展：建议推进寄样/排期' }
  if (x.status === 'sample_sent') {
    const sd = daysDiffFromNow(x.sample?.sentAt)
    if (sd != null && sd >= 7 && !x.deliverables?.videoUrl) return { level: 'warn', text: '已寄样 7 天未出片：建议催出片' }
  }
  if (x.status === 'posted') {
    const pd = daysDiffFromNow(x.deliverables?.postedAt)
    if (pd != null && pd >= 3) return { level: 'info', text: '已出片 3 天：建议复盘合作' }
  }
  return null
}

type ToastType = 'success' | 'error' | 'info'
type Toast = { id: string; type: ToastType; text: string }

function Toasts({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((t) => setTimeout(() => onRemove(t.id), 2600))
    return () => timers.forEach(clearTimeout)
  }, [toasts, onRemove])

  if (toasts.length === 0) return null
  const tone = (type: ToastType) => {
    if (type === 'success') return 'bg-green-50 border-green-200 text-green-800'
    if (type === 'error') return 'bg-red-50 border-red-200 text-red-800'
    return 'bg-gray-50 border-gray-200 text-gray-800'
  }
  return (
    <div className="fixed right-4 top-20 z-50 space-y-2">
      {toasts.map((t) => (
        <div key={t.id} className={`min-w-[240px] max-w-[360px] rounded-lg border px-3 py-2 text-xs shadow-sm ${tone(t.type)}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="leading-relaxed">{t.text}</div>
            <button className="text-[11px] opacity-70 hover:opacity-100" onClick={() => onRemove(t.id)}>
              关闭
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-8 overflow-y-auto">
        <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-[85vh] flex flex-col">
          <div className="px-4 py-3 border-b">
            <div className="text-sm font-semibold text-gray-900">{title}</div>
            {subtitle && <div className="mt-0.5 text-[11px] text-gray-500">{subtitle}</div>}
          </div>
          <div className="px-4 py-4 overflow-y-auto flex-1">{children}</div>
          {footer && <div className="px-4 py-3 border-t bg-gray-50 shrink-0">{footer}</div>}
        </div>
      </div>
    </div>
  )
}

function statusSortKey(s: InfluencerStatus) {
  const order: InfluencerStatus[] = [
    'to_outreach',
    'sent',
    'cooperating',
    'sample_sent',
    'posted',
    'done',
    'paused',
    'not_coop',
  ]
  return order.indexOf(s) === -1 ? 999 : order.indexOf(s)
}

function getNextActionForStatus(status: InfluencerStatus) {
  if (status === 'to_outreach') return '发送首条消息'
  if (status === 'sent') return '二次跟进'
  if (status === 'cooperating') return '安排寄样'
  if (status === 'sample_sent') return '催出片'
  if (status === 'posted') return '复盘合作'
  if (status === 'done') return '二次合作'
  if (status === 'paused') return '恢复跟进'
  return '标记不合作'
}

const mockData: Influencer[] = [
  {
    id: 'inf_1',
    nickname: 'LunaHairLab',
    platform: 'TikTok',
    profileUrl: 'https://tiktok.com/@lunahairlab',
    country: 'US',
    followers: 186000,
    contentTypes: ['测评', '开箱', '教程'],
    productLines: ['蕾丝假发', '日常通勤'],
    matchProducts: ['HD Lace Bob', 'Glueless Curly 24"'],
    status: 'to_outreach',
    owner: 'Yuyuhan',
    potential: 'A',
    email: 'luna@example.com',
    lastFollowUpAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    lastFollowUpNote: '准备首条 DM 话术 + 产品匹配点',
    nextAction: '发送首条消息',
    timeline: [
      {
        id: 't1',
        at: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
        by: '运营',
        note: '完成达人筛选与产品匹配，准备建联。',
        nextAction: '发送首条消息',
      },
    ],
    quote: { currency: 'USD', note: '先询价，争取置换合作' },
  },
  {
    id: 'inf_2',
    nickname: 'WigDailyTips',
    platform: 'Instagram',
    profileUrl: 'https://instagram.com/wigdailytips',
    country: 'CA',
    followers: 42000,
    contentTypes: ['Reels', 'Before/After'],
    productLines: ['初学者佩戴', '发际线教程'],
    matchProducts: ['Beginner Glueless', 'Natural Hairline'],
    status: 'sent',
    owner: 'Yuyuhan',
    potential: 'B',
    whatsapp: '+1 000 000 0000',
    lastFollowUpAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    lastFollowUpNote: '已发送合作邀请，等待回复',
    nextAction: '二次跟进',
    timeline: [
      {
        id: 't1',
        at: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
        by: '运营',
        note: '发送首条合作私信（置换+佣金）。',
        nextAction: '等待回复 / 48h 跟进',
      },
    ],
  },
  {
    id: 'inf_3',
    nickname: 'GlamWigReview',
    platform: 'YouTube',
    profileUrl: 'https://youtube.com/@glamwigreview',
    country: 'UK',
    followers: 9800,
    contentTypes: ['长测评', '对比评测'],
    productLines: ['高客单', '高品质蕾丝'],
    matchProducts: ['HD Lace 13x6', 'Remy Straight 26"'],
    status: 'cooperating',
    owner: 'Alice',
    potential: 'A',
    email: 'glam@example.com',
    lastFollowUpAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    lastFollowUpNote: '对方报价 $350 + 佣金 10%，需要确认预算',
    nextAction: '安排寄样',
    timeline: [
      {
        id: 't1',
        at: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
        by: '运营',
        note: '对方回复愿意合作，索要报价与寄样流程。',
      },
      {
        id: 't2',
        at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
        by: '运营',
        note: '收到报价：$350 + 10% 佣金，交期 7 天。',
        nextAction: '确认报价',
      },
    ],
    quote: { currency: 'USD', amount: 350, note: '含 1 条长测评 + 1 条 Shorts' },
  },
  {
    id: 'inf_4',
    nickname: 'CurlyWigQueen',
    platform: 'TikTok',
    profileUrl: 'https://tiktok.com/@curlywigqueen',
    country: 'US',
    followers: 265000,
    contentTypes: ['剧情', '变装', '开头强钩子'],
    productLines: ['卷发', '爆款开头'],
    matchProducts: ['Glueless Curly 24"'],
    status: 'sample_sent',
    owner: 'Alice',
    potential: 'A',
    lastFollowUpAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    lastFollowUpNote: '已寄样，等签收后确认拍摄脚本',
    nextAction: '催出片',
    timeline: [
      {
        id: 't1',
        at: new Date(Date.now() - 1000 * 60 * 60 * 70).toISOString(),
        by: '运营',
        note: '确认寄样地址与尺码。',
      },
      {
        id: 't2',
        at: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
        by: '运营',
        note: '寄样已发出，等待签收。',
        nextAction: '签收后对齐拍摄脚本',
      },
    ],
    sample: { tracking: 'DHL-XXXX', sentAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString() },
  },
  {
    id: 'inf_5',
    nickname: 'EverydayWigFit',
    platform: 'TikTok',
    profileUrl: 'https://tiktok.com/@everydaywigfit',
    country: 'AU',
    followers: 15600,
    contentTypes: ['真实体验', '上头效果'],
    productLines: ['日常通勤'],
    matchProducts: ['HD Lace Bob'],
    status: 'posted',
    owner: 'Yuyuhan',
    potential: 'B',
    lastFollowUpAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    lastFollowUpNote: '已出片，待复盘效果和二次合作',
    nextAction: '复盘合作',
    timeline: [
      {
        id: 't1',
        at: new Date(Date.now() - 1000 * 60 * 60 * 200).toISOString(),
        by: '运营',
        note: '完成建联与寄样。',
      },
      {
        id: 't2',
        at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
        by: '运营',
        note: '对方发布视频，已拿到链接。',
        nextAction: '复盘合作',
      },
    ],
    deliverables: { videoUrl: 'https://tiktok.com/@everydaywigfit/video/123', postedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString() },
    review: { summary: '开头钩子弱，但佩戴过程真实，评论区咨询多。建议二次合作强化前3秒。', score: 7 },
  },
]

const owners = ['Yuyuhan', 'Alice', 'Bob']
const regions = ['US', 'CA', 'UK', 'AU', 'DE', 'FR']
const platforms: Array<Influencer['platform']> = ['TikTok', 'Instagram', 'YouTube', 'Other']
const productLines = ['蕾丝假发', '卷发', '日常通勤', '初学者佩戴', '高客单']

function StatCard({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left w-full rounded-xl border shadow-sm px-4 py-3 hover:bg-gray-50 transition ${
        active
          ? 'border-primary-400 bg-primary-50 ring-2 ring-primary-200 shadow-md'
          : 'border-gray-100 bg-white'
      }`}
    >
      <div className={`text-[11px] ${active ? 'text-primary-700' : 'text-gray-500'}`}>{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{count}</div>
      <div className="mt-1 text-[11px] text-gray-500">点击筛选</div>
    </button>
  )
}

function Badge({ status }: { status: InfluencerStatus }) {
  const tone = statusTone[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] whitespace-nowrap ${tone.bg} ${tone.text} ${tone.border}`}>
      {statusLabel[status]}
    </span>
  )
}

function PotentialBadge({ p }: { p: Potential }) {
  const map: Record<Potential, string> = {
    A: 'bg-green-50 text-green-700 border-green-200',
    B: 'bg-blue-50 text-blue-700 border-blue-200',
    C: 'bg-gray-50 text-gray-600 border-gray-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] ${map[p]}`}>
      潜力 {p}
    </span>
  )
}

function Drawer({
  open,
  onClose,
  influencer,
  onAddFollowUp,
  onUpdateStatus,
}: {
  open: boolean
  onClose: () => void
  influencer: Influencer | null
  onAddFollowUp: (id: string, note: string, nextAction?: string) => void
  onUpdateStatus: (id: string, status: InfluencerStatus) => void
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !influencer) return null

  const infoRow = (k: string, v?: string) => (
    <div className="flex items-start justify-between gap-3 py-1">
      <div className="text-[11px] text-gray-500">{k}</div>
      <div className="text-[11px] text-gray-800 text-right break-words">{v || '-'}</div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        ref={panelRef}
        className="absolute right-0 top-0 h-full w-full sm:w-[520px] bg-white shadow-2xl border-l border-gray-200 flex flex-col"
      >
        <div className="px-4 py-3 border-b flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">{influencer.nickname}</div>
            <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-gray-500">
              <span>{influencer.platform}</span>
              <span className="text-gray-300">|</span>
              <span>{influencer.country || '-'}</span>
              <span className="text-gray-300">|</span>
              <span>{formatFollowers(influencer.followers)} 粉丝</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          >
            关闭
          </button>
        </div>

        <div className="px-4 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-2">
          <Badge status={influencer.status} />
          <CoopBadge level={(influencer.cooperationLevel as any) || 'normal'} />
          <PotentialBadge p={influencer.potential} />
          <span className="text-[11px] text-gray-500">负责人：{influencer.owner}</span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => {
                const note = window.prompt('新增跟进记录（简短动作/结论）：')
                if (!note || !note.trim()) return
                const next = window.prompt('下一步动作（可选）：', influencer.nextAction || '')
                onAddFollowUp(influencer.id, note.trim(), next?.trim() || undefined)
              }}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            >
              新建跟进记录
            </button>
            <button
              onClick={() => {
                const next = window.prompt(
                  `更新状态：\n${Object.entries(statusLabel)
                    .map(([k, v]) => `${k} = ${v}`)
                    .join('\n')}`,
                  influencer.status,
                )
                if (!next) return
                if (!(next in statusLabel)) return
                onUpdateStatus(influencer.id, next as InfluencerStatus)
              }}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            >
              更新状态
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {(influencer.cooperationLevel || 'normal') === 'deep' && (
            <div className="border border-purple-100 rounded-xl p-3 bg-purple-50">
              <div className="text-xs font-semibold text-purple-900 mb-2">深度合作要点</div>
              <div className="space-y-1">
                {infoRow('固定合作频率', influencer.deepFrequency)}
                {infoRow('重点合作产品', (influencer.deepKeyProducts || []).join(' / '))}
                {infoRow('定制合作要求', influencer.deepRequirements)}
                {infoRow('特别注意事项', influencer.deepNotes)}
              </div>
            </div>
          )}
          <div className="border border-gray-100 rounded-xl p-3">
            <div className="text-xs font-semibold text-gray-900 mb-2">基本资料</div>
            <div className="divide-y">
              {infoRow('达人', influencer.nickname)}
              {infoRow('平台链接', influencer.profileUrl)}
              {infoRow('内容类型', influencer.contentTypes.join(' / '))}
              {infoRow('产品线', influencer.productLines.join(' / '))}
              {infoRow('匹配产品', influencer.matchProducts.join(' / '))}
            </div>
          </div>

          <div className="border border-gray-100 rounded-xl p-3">
            <div className="text-xs font-semibold text-gray-900 mb-2">联系方式</div>
            <div className="divide-y">
              {infoRow('邮箱', influencer.email)}
              {infoRow('WhatsApp', influencer.whatsapp)}
            </div>
          </div>

          <div className="border border-gray-100 rounded-xl p-3">
            <div className="text-xs font-semibold text-gray-900 mb-2">报价信息</div>
            <div className="divide-y">
              {infoRow('报价', influencer.quote?.amount ? `$${influencer.quote.amount}` : undefined)}
              {infoRow('备注', influencer.quote?.note)}
            </div>
          </div>

          <div className="border border-gray-100 rounded-xl p-3">
            <div className="text-xs font-semibold text-gray-900 mb-2">寄样信息</div>
            <div className="divide-y">
              {infoRow('寄样时间', influencer.sample?.sentAt ? new Date(influencer.sample.sentAt).toLocaleString('zh-CN') : undefined)}
              {infoRow('快递单号', influencer.sample?.tracking)}
              {infoRow('地址', influencer.sample?.address)}
            </div>
          </div>

          <div className="border border-gray-100 rounded-xl p-3">
            <div className="text-xs font-semibold text-gray-900 mb-2">出片链接</div>
            <div className="divide-y">
              {infoRow('发布时间', influencer.deliverables?.postedAt ? new Date(influencer.deliverables.postedAt).toLocaleString('zh-CN') : undefined)}
              {infoRow('链接', influencer.deliverables?.videoUrl)}
              {infoRow('备注', influencer.deliverables?.note)}
            </div>
          </div>

          <div className="border border-gray-100 rounded-xl p-3">
            <div className="text-xs font-semibold text-gray-900 mb-2">跟进时间线</div>
            <div className="space-y-2">
              {influencer.timeline
                .slice()
                .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
                .map((t) => (
                  <div key={t.id} className="rounded-lg border border-gray-100 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-gray-500">{new Date(t.at).toLocaleString('zh-CN')}</div>
                      <div className="text-[11px] text-gray-500">{t.by}</div>
                    </div>
                    <div className="mt-1 text-xs text-gray-800 leading-relaxed">{t.note}</div>
                    {t.nextAction && (
                      <div className="mt-1 text-[11px] text-gray-600">下一步：{t.nextAction}</div>
                    )}
                  </div>
                ))}
              {influencer.timeline.length === 0 && (
                <div className="text-[11px] text-gray-500">暂无跟进记录。</div>
              )}
            </div>
          </div>

          <div className="border border-gray-100 rounded-xl p-3">
            <div className="text-xs font-semibold text-gray-900 mb-2">合作复盘</div>
            <div className="divide-y">
              {infoRow('评分', influencer.review?.score != null ? String(influencer.review?.score) : undefined)}
              {infoRow('总结', influencer.review?.summary)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function InfluencersPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const role = (session?.user as any)?.role as string | undefined
  const canAccess = canAccessInfluencers(role)
  const canManage = canManageInfluencers(role)
  const operatorName = (session?.user as any)?.name || session?.user?.email || '运营'

  useEffect(() => {
    if (session !== undefined && !canAccess) {
      router.replace('/dashboard/scripts')
    }
  }, [session, canAccess, router])

  // 单一状态源：全页所有展示/统计/操作都基于这份 influencers
  const [items, setItems] = useState<Influencer[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState<Toast[]>([])
  const itemsRef = useRef<Influencer[] | null>(null)
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const pushToast = (type: ToastType, text: string) => {
    setToasts((prev) => [...prev, { id: `t_${Math.random().toString(16).slice(2)}`, type, text }])
  }
  const removeToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))

  const [statFilter, setStatFilter] = useState<InfluencerStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [platform, setPlatform] = useState<string>('all')
  const [region, setRegion] = useState<string>('all')
  const [status, setStatus] = useState<string>('all')
  const [owner, setOwner] = useState<string>('all')
  const [productLine, setProductLine] = useState<string>('all')
  const [coopLevel, setCoopLevel] = useState<string>('all')
  const [followersBand, setFollowersBand] = useState<string>('all')
  const [followUpRecency, setFollowUpRecency] = useState<string>('all')
  const [debugOpen, setDebugOpen] = useState(false)

  const [selected, setSelected] = useState<Influencer | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [rowMenuOpenId, setRowMenuOpenId] = useState<string>('')

  const [actionOpen, setActionOpen] = useState(false)
  const [actionTargetId, setActionTargetId] = useState('')
  const [actionForm, setActionForm] = useState({
    summary: '',
    messageSummary: '',
    intent: '',
    quoteUsd: '',
    commissionPct: '',
    sampleSentAt: '',
    expectedPostAt: '',
    postUrl: '',
    reviewSummary: '',
  })
  const [actionError, setActionError] = useState<string>('')

  const [createOpen, setCreateOpen] = useState(false)
  const [editTargetId, setEditTargetId] = useState<string>('')
  const [importOpen, setImportOpen] = useState(false)
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [followUpTargetId, setFollowUpTargetId] = useState<string>('')
  const [followUpForm, setFollowUpForm] = useState({
    type: '其他' as NonNullable<FollowUp['type']>,
    channel: '私信' as NonNullable<FollowUp['channel']>,
    responseStatus: '无回复' as NonNullable<FollowUp['responseStatus']>,
    summary: '',
    nextAction: '',
    nextFollowUpAt: '',
    operator: operatorName as string,
  })
  const [followUpError, setFollowUpError] = useState<string>('')
  const [createForm, setCreateForm] = useState({
    nickname: '',
    platform: 'TikTok' as Influencer['platform'],
    profileUrl: '',
    country: '',
    language: '',
    followers: '',
    email: '',
    phone: '',
    whatsapp: '',
    instagram: '',
    otherContact: '',
    quoteUsd: '',
    quoteNote: '',
    sampleAddress: '',
    contentTypes: '',
    productLines: '',
    matchProducts: '',
    owner: operatorName as string,
    potential: 'C' as Potential,
    status: 'to_outreach' as InfluencerStatus,
    cooperationLevel: 'normal' as CooperationLevel,
    deepRequirements: '',
    deepKeyProducts: '',
    deepFrequency: '',
    deepNotes: '',
    notes: '',
  })
  const [createError, setCreateError] = useState<string>('')

  const openUpsert = (x?: Influencer) => {
    setCreateError('')
    if (x) {
      setEditTargetId(x.id)
      setCreateForm({
        nickname: x.nickname || '',
        platform: x.platform || 'TikTok',
        profileUrl: x.profileUrl || '',
        owner: x.owner || operatorName,
        status: x.status || 'to_outreach',
        cooperationLevel: (x.cooperationLevel || 'normal') as CooperationLevel,
        country: x.country || '',
        language: x.language || '',
        followers: x.followers ? String(x.followers) : '',
        email: x.email || '',
        phone: x.phone || '',
        whatsapp: x.whatsapp || '',
        instagram: x.instagram || '',
        otherContact: x.otherContact || '',
        quoteUsd: x.quote?.amount != null ? String(x.quote.amount) : '',
        quoteNote: x.quote?.note ? String(x.quote.note) : '',
        sampleAddress: x.sample?.address ? String(x.sample.address) : '',
        deepRequirements: x.deepRequirements || '',
        deepKeyProducts: (x.deepKeyProducts || []).join(', '),
        deepFrequency: x.deepFrequency || '',
        deepNotes: x.deepNotes || '',
        contentTypes: (x.contentTypes || []).join(', '),
        productLines: (x.productLines || []).join(', '),
        matchProducts: (x.matchProducts || []).join(', '),
        potential: (x.potential || 'C') as Potential,
        notes: x.lastFollowUpNote || '',
      })
    } else {
      setEditTargetId('')
      setCreateForm((p) => ({
        ...p,
        nickname: '',
        platform: 'TikTok',
        profileUrl: '',
        owner: operatorName as string,
        status: 'to_outreach',
        cooperationLevel: 'normal',
        deepRequirements: '',
        deepKeyProducts: '',
        deepFrequency: '',
        deepNotes: '',
        country: '',
        language: '',
        followers: '',
        email: '',
        phone: '',
        whatsapp: '',
        instagram: '',
        otherContact: '',
        quoteUsd: '',
        quoteNote: '',
        sampleAddress: '',
        contentTypes: '',
        productLines: '',
        matchProducts: '',
        potential: 'C',
        notes: '',
      }))
    }
    setCreateOpen(true)
  }

  const apiPatch = async (id: string, patch: Record<string, any>) => {
    const res = await fetch(`/api/influencers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as any)?.error || '保存失败')
  }

  const apiDelete = async (id: string) => {
    const res = await fetch(`/api/influencers/${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as any)?.error || '删除失败')
  }

  const apiCreate = async (payload: Record<string, any>) => {
    const res = await fetch('/api/influencers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as any)?.error || '创建失败')
    return (data as any)?.id as string | undefined
  }

  const apiSeed = async () => {
    const res = await fetch('/api/influencers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ __seed: true }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as any)?.error || '重置失败')
  }

  const loadInfluencers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/influencers?take=1000')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '加载失败')
      const normalizeStatus = (s: any): InfluencerStatus => {
        const raw = String(s || '').trim()
        if (raw === 'negotiating') return 'cooperating'
        if (raw === 'long_term') return 'done'
        if (raw === 'to_screen') return 'to_outreach'
        if (
          raw === 'to_outreach' ||
          raw === 'sent' ||
          raw === 'sample_sent' ||
          raw === 'cooperating' ||
          raw === 'posted' ||
          raw === 'done' ||
          raw === 'paused' ||
          raw === 'not_coop'
        )
          return raw as InfluencerStatus
        return 'to_outreach'
      }
      const next = ((data.items || []) as any[]).map((x) => {
        const status = normalizeStatus(x.status)
        return {
          ...x,
          status,
          nextAction: String(x.nextAction || '') || getNextActionForStatus(status),
        } as Influencer
      })
      setItems(next)
    } catch (e) {
      console.error(e)
      pushToast('error', '加载达人数据失败')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadInfluencers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const baseItems = items ?? []

  const stats = useMemo(() => {
    const base = baseItems
    const count = (s: InfluencerStatus) => base.filter((x) => x.status === s).length
    return {
      to_outreach: count('to_outreach'),
      sent: count('sent'),
      sample_sent: count('sample_sent'),
      cooperating: count('cooperating'),
      posted: count('posted'),
      done: count('done'),
      paused: count('paused'),
      not_coop: count('not_coop'),
    }
  }, [baseItems])

  const effectiveStatus: InfluencerStatus | null =
    statFilter !== 'all' ? statFilter : status === 'all' ? null : (status as InfluencerStatus)
  const effectiveLabel = effectiveStatus ? statusLabel[effectiveStatus] : '全部'

  const filtered = useMemo(() => {
    let list = [...baseItems]

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((x) => {
        const hay = [
          x.nickname,
          x.email || '',
          x.profileUrl || '',
          x.matchProducts.join(' '),
          x.productLines.join(' '),
          x.contentTypes.join(' '),
        ]
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
    }

    if (effectiveStatus) list = list.filter((x) => x.status === effectiveStatus)
    if (platform !== 'all') list = list.filter((x) => x.platform === platform)
    if (region !== 'all') list = list.filter((x) => x.country === region)
    if (owner !== 'all') list = list.filter((x) => x.owner === owner)
    if (coopLevel !== 'all') list = list.filter((x) => (x.cooperationLevel || 'normal') === coopLevel)
    if (productLine !== 'all') list = list.filter((x) => x.productLines.includes(productLine))

    if (followersBand !== 'all') {
      const f = (x: Influencer) => x.followers
      if (followersBand === '0-10k') list = list.filter((x) => f(x) < 10_000)
      if (followersBand === '10k-50k') list = list.filter((x) => f(x) >= 10_000 && f(x) < 50_000)
      if (followersBand === '50k-200k') list = list.filter((x) => f(x) >= 50_000 && f(x) < 200_000)
      if (followersBand === '200k+') list = list.filter((x) => f(x) >= 200_000)
    }

    if (followUpRecency !== 'all') {
      const now = Date.now()
      const withinDays = (iso: string | undefined, days: number) => {
        if (!iso) return false
        const d = new Date(iso)
        if (Number.isNaN(d.getTime())) return false
        return now - d.getTime() <= days * 24 * 60 * 60 * 1000
      }
      if (followUpRecency === '3d') list = list.filter((x) => withinDays(x.lastFollowUpAt, 3))
      if (followUpRecency === '7d') list = list.filter((x) => withinDays(x.lastFollowUpAt, 7))
      if (followUpRecency === '14d') list = list.filter((x) => withinDays(x.lastFollowUpAt, 14))
      if (followUpRecency === 'over14d') list = list.filter((x) => !withinDays(x.lastFollowUpAt, 14))
    }

    // 优先把今天需要联系/跟进的放前面（动作驱动）
    list.sort((a, b) => {
      const ak = statusSortKey(a.status)
      const bk = statusSortKey(b.status)
      if (ak !== bk) return ak - bk
      const at = a.lastFollowUpAt ? new Date(a.lastFollowUpAt).getTime() : 0
      const bt = b.lastFollowUpAt ? new Date(b.lastFollowUpAt).getTime() : 0
      return bt - at
    })

    return list
  }, [baseItems, search, platform, region, status, owner, coopLevel, productLine, followersBand, followUpRecency, statFilter, effectiveStatus])

  const openDetail = (x: Influencer) => {
    setSelected(x)
    setDrawerOpen(true)
  }

  const appendFollowUp = async (id: string, entry: FollowUp, patch?: Partial<Influencer>) => {
    setItems((prev) => {
      if (!prev) return prev
      return prev.map((x) => {
        if (x.id !== id) return x
        return {
          ...x,
          ...patch,
          lastFollowUpAt: entry.at,
          lastFollowUpNote: entry.note,
          nextAction: entry.nextAction || x.nextAction,
          nextFollowUpAt: entry.nextFollowUpAt || x.nextFollowUpAt,
          timeline: [entry, ...x.timeline],
        }
      })
    })
    setSelected((prev) => {
      if (!prev || prev.id !== id) return prev
      return {
        ...prev,
        ...patch,
        lastFollowUpAt: entry.at,
        lastFollowUpNote: entry.note,
        nextAction: entry.nextAction || prev.nextAction,
        nextFollowUpAt: entry.nextFollowUpAt || prev.nextFollowUpAt,
        timeline: [entry, ...prev.timeline],
      }
    })

    try {
      const cur = (itemsRef.current ?? []).find((x) => x.id === id)
      const nextTimeline = [entry, ...(cur?.timeline || [])]
      await apiPatch(id, {
        ...(patch || {}),
        lastFollowUpAt: entry.at,
        lastFollowUpNote: entry.note,
        nextAction: entry.nextAction || cur?.nextAction || '',
        nextFollowUpAt: entry.nextFollowUpAt ?? cur?.nextFollowUpAt ?? null,
        timeline: nextTimeline,
      })
      pushToast('success', '已保存')
    } catch (e) {
      console.error(e)
      pushToast('error', '保存失败（可重试）')
    }
  }

  const updateInfluencer = async (id: string, patch: Partial<Influencer>) => {
    setItems((prev) => {
      if (!prev) return prev
      return prev.map((x) => (x.id === id ? { ...x, ...patch } : x))
    })
    setSelected((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev))

    try {
      await apiPatch(id, patch as any)
      pushToast('success', '已保存')
    } catch (e) {
      console.error(e)
      pushToast('error', '保存失败（可重试）')
    }
  }

  // 下一步动作与“记一条跟进”统一走 appendFollowUp，确保列表/最近跟进/抽屉时间线同步
  const addFollowUp = async (id: string, note: string, nextAction?: string) => {
    const entry: FollowUp = {
      id: `fu_${Math.random().toString(16).slice(2)}`,
      at: new Date().toISOString(),
      by: operatorName,
      note,
      nextAction,
    }
    await appendFollowUp(id, entry)
  }

  const openNextAction = (x: Influencer) => {
    setActionError('')
    setActionTargetId(x.id)
    setActionForm({
      summary: '',
      messageSummary: '',
      intent: '',
      quoteUsd: x.quote?.amount != null ? String(x.quote.amount) : '',
      commissionPct: x.commission != null ? String(x.commission) : '',
      sampleSentAt: x.sample?.sentAt ? x.sample.sentAt.slice(0, 16) : '',
      expectedPostAt: x.nextFollowUpAt ? x.nextFollowUpAt.slice(0, 16) : '',
      postUrl: x.deliverables?.videoUrl || '',
      reviewSummary: x.review?.summary || '',
    })
    setActionOpen(true)
  }

  const applyNextAction = async () => {
    if (!items) return
    const target = items.find((x) => x.id === actionTargetId)
    if (!target) return
    if (!actionForm.summary.trim()) {
      setActionError('请填写本次操作摘要')
      return
    }

    const now = new Date().toISOString()
    const baseEntry: FollowUp = {
      id: `fu_${Math.random().toString(16).slice(2)}`,
      at: now,
      by: operatorName,
      type: '其他',
      channel: '私信',
      responseStatus: '待确认',
      note: actionForm.summary.trim(),
      nextAction: undefined,
      nextFollowUpAt: undefined,
    }

    try {
      if (target.status === 'to_outreach') {
      // 首联：写入首次联系时间 + 状态变为已发送
      const nextAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
      await updateInfluencer(target.id, {
        status: 'sent',
        firstContactAt: target.firstContactAt || now,
        lastFollowUpAt: now,
        lastFollowUpNote: baseEntry.note,
        nextFollowUpAt: nextAt,
        nextAction: '二次跟进',
      })
      await addFollowUp(target.id, baseEntry.note, '二次跟进')
      pushToast('success', '已记录首联，并更新为“已发送”')
    } else if (target.status === 'sent') {
      await updateInfluencer(target.id, {
        status: 'cooperating',
        lastFollowUpAt: now,
        lastFollowUpNote: baseEntry.note,
        nextAction: '安排寄样',
      })
      await addFollowUp(target.id, baseEntry.note, '安排寄样')
      pushToast('success', '已进入“合作中”')
    } else if (target.status === 'cooperating') {
      // 合作中：可更新报价/佣金；确认是否已寄样
      const q = actionForm.quoteUsd.trim()
      const c = actionForm.commissionPct.trim()
      if (q && !/^\d+(\.\d+)?$/.test(q)) {
        setActionError('报价需为数字')
        return
      }
      if (c && !/^\d+(\.\d+)?$/.test(c)) {
        setActionError('佣金需为数字（%）')
        return
      }
      const goSample = window.confirm('是否已寄样？确定=进入“已寄样”，取消=保持“合作中”。')
      const sentAt = actionForm.sampleSentAt ? new Date(actionForm.sampleSentAt).toISOString() : now
      await updateInfluencer(target.id, {
        quote: q ? { currency: 'USD', amount: Number(q) } : target.quote,
        commission: c ? Number(c) : target.commission,
        status: goSample ? 'sample_sent' : 'cooperating',
        sample: goSample ? { ...(target.sample || {}), sentAt } : target.sample,
        lastFollowUpAt: now,
        lastFollowUpNote: baseEntry.note,
        nextAction: goSample ? '催出片' : '安排寄样',
        nextFollowUpAt: goSample ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() : target.nextFollowUpAt,
      })
      await addFollowUp(target.id, baseEntry.note, goSample ? '催出片' : '安排寄样')
      pushToast('success', goSample ? '已更新为“已寄样”' : '已记录合作推进')
    } else if (target.status === 'sample_sent') {
      // 催出片：设置预计出片/下次跟进
      const expected = actionForm.expectedPostAt
        ? new Date(actionForm.expectedPostAt).toISOString()
        : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
      await updateInfluencer(target.id, {
        lastFollowUpAt: now,
        lastFollowUpNote: baseEntry.note,
        nextFollowUpAt: expected,
        nextAction: '等待出片',
      })
      await addFollowUp(target.id, baseEntry.note, '等待出片')
      pushToast('success', '已记录催出片，并设置下次跟进时间')
    } else if (target.status === 'posted') {
      // 复盘合作：补出片链接/复盘总结，可标记长期合作
      const url = actionForm.postUrl.trim()
      if (url && !url.startsWith('http')) {
        setActionError('出片链接需以 http(s) 开头')
        return
      }
      await updateInfluencer(target.id, {
        deliverables: url ? { ...(target.deliverables || {}), videoUrl: url, postedAt: target.deliverables?.postedAt || now } : target.deliverables,
        review: { ...(target.review || {}), summary: actionForm.reviewSummary.trim() || target.review?.summary },
        status: 'done',
        lastFollowUpAt: now,
        lastFollowUpNote: baseEntry.note,
        nextAction: '二次合作',
      })
      await addFollowUp(target.id, baseEntry.note, '二次合作')
      pushToast('success', '已完成并归档')
    } else {
      await updateInfluencer(target.id, { lastFollowUpAt: now, lastFollowUpNote: baseEntry.note })
      await addFollowUp(target.id, baseEntry.note)
      pushToast('success', '已记录操作')
    }
    } catch (e) {
      console.error(e)
      pushToast('error', '操作保存失败，请重试')
      return
    }

    setActionOpen(false)
    setActionTargetId('')
    setActionForm({
      summary: '',
      messageSummary: '',
      intent: '',
      quoteUsd: '',
      commissionPct: '',
      sampleSentAt: '',
      expectedPostAt: '',
      postUrl: '',
      reviewSummary: '',
    })
    setActionError('')
  }

  // （已上移并改为走 appendFollowUp）

  const updateStatus = async (id: string, s: InfluencerStatus) => {
    setItems((prev) => {
      if (!prev) return prev
      return prev.map((x) => (x.id === id ? { ...x, status: s } : x))
    })
    setSelected((prev) => (prev && prev.id === id ? { ...prev, status: s } : prev))
    try {
      await apiPatch(id, { status: s, nextAction: getNextActionForStatus(s) })
      pushToast('success', '已保存')
    } catch (e) {
      console.error(e)
      pushToast('error', '状态保存失败，请重试')
    }
  }

  const resetFilters = () => {
    setStatFilter('all')
    setSearch('')
    setPlatform('all')
    setRegion('all')
    setStatus('all')
    setOwner('all')
    setCoopLevel('all')
    setProductLine('all')
    setFollowersBand('all')
    setFollowUpRecency('all')
  }

  if (session === undefined || !canAccess) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        {session === undefined ? '加载中...' : '无权限访问达人建联，正在跳转...'}
      </div>
    )
  }

  const totalCount = baseItems.length
  const debugBuildTag = 'influencers-linkage-debug-2026-03-16-01'
  const isDev = process.env.NODE_ENV !== 'production'

  return (
    <div className="space-y-5">
      <Toasts toasts={toasts} onRemove={removeToast} />
      {/* 顶部标题区 */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">达人建联工作台</h1>
          <p className="mt-1 text-sm text-gray-600">
            统一管理达人筛选、联系、跟进、寄样和出片进度
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {isDev && (
            <button
              onClick={() => setDebugOpen((v) => !v)}
              className="px-2.5 py-2 text-[11px] rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              title="仅开发模式显示"
              type="button"
            >
              Debug
              <span className="ml-1 opacity-60">{debugOpen ? '▲' : '▼'}</span>
            </button>
          )}
          <button
            onClick={() => {
              if (!canManage) return
              openUpsert()
            }}
            className="px-3 py-2 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            disabled={!canManage}
          >
            新建达人
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="px-3 py-2 text-xs bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200"
          >
            批量导入
          </button>
          <button
            onClick={() => {
              if (!canManage) return
              setFollowUpError('')
              setFollowUpTargetId('')
              setFollowUpForm((p) => ({
                ...p,
                operator: operatorName as string,
                summary: '',
                nextAction: '',
                nextFollowUpAt: '',
                type: '其他',
                channel: '私信',
                responseStatus: '无回复',
              }))
              setFollowUpOpen(true)
            }}
            className="px-3 py-2 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            disabled={!canManage}
          >
            新建跟进记录
          </button>
        </div>
      </div>

      {isDev && debugOpen && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-700">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="font-mono">build: {debugBuildTag}</span>
            <span className="font-mono">statFilter: {statFilter}</span>
            <span className="font-mono">statusSelect: {status}</span>
            <span>总人数：{totalCount}</span>
            <span>待建联：{stats.to_outreach}</span>
            <span>已发送：{stats.sent}</span>
            <span>合作中：{stats.cooperating}</span>
            <span>已寄样：{stats.sample_sent}</span>
            <span>已出片：{stats.posted}</span>
            <span>已完成：{stats.done}</span>
            <span>暂停：{stats.paused}</span>
            <span>不合作：{stats.not_coop}</span>
            <span>当前列表：{filtered.length}</span>
            <span>localStorage 已加载：是</span>
            {selected && (
              <span>
                当前选中：{selected.nickname}（{statusLabel[selected.status]}）
              </span>
            )}
          </div>
        </div>
      )}

      {/* 今日待跟进提醒（3-5 条最急事项） */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-gray-900">今日待跟进提醒</div>
          <div className="text-[11px] text-gray-500">基于简单规则自动提示</div>
        </div>
        {items && (() => {
          const urgent = [...items]
            .map((x) => ({ x, r: computeReminder(x) }))
            .filter((p) => Boolean(p.r))
            .sort((a, b) => (daysDiffFromNow(a.x.lastFollowUpAt || a.x.sample?.sentAt || a.x.deliverables?.postedAt) ?? 999) - (daysDiffFromNow(b.x.lastFollowUpAt || b.x.sample?.sentAt || b.x.deliverables?.postedAt) ?? 999))
            .slice(0, 5)

          if (urgent.length === 0) {
            return <div className="text-[11px] text-gray-500">暂无紧急提醒。</div>
          }
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {urgent.map(({ x, r }) => (
                <button
                  key={x.id}
                  onClick={() => openDetail(x)}
                  className={`text-left rounded-lg border px-3 py-2 hover:bg-gray-50 ${
                    (r as any).level === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="text-xs font-medium text-gray-900">{(r as any).text}</div>
                  <div className="mt-1 text-[11px] text-gray-600">
                    {x.nickname} · 下一步：{x.nextAction}
                  </div>
                </button>
              ))}
            </div>
          )
        })()}
      </div>

      {/* 新建达人弹窗 */}
      <Modal
        open={createOpen}
        title={editTargetId ? '编辑达人资料' : '新建达人'}
        subtitle={editTargetId ? '可随时补充资料并更新状态（不会影响当前筛选）' : '先录入基础必填信息，其他可后补'}
        onClose={() => setCreateOpen(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setCreateOpen(false)}
              className="px-3 py-2 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={() => {
                if (!canManage) {
                  setCreateError(editTargetId ? '无权限更新达人' : '无权限新建达人')
                  return
                }
                if (!createForm.nickname.trim()) {
                  setCreateError('昵称必填')
                  return
                }
                if (createForm.followers && !/^\d+$/.test(createForm.followers.trim())) {
                  setCreateError('粉丝量需为整数')
                  return
                }
                if (!createForm.profileUrl.trim()) {
                  setCreateError('主页链接必填')
                  return
                }
                setCreateError('')
                const contentTypes = createForm.contentTypes
                  .split(/[,/;\n]/)
                  .map((s) => s.trim())
                  .filter(Boolean)
                const productLines = createForm.productLines
                  .split(/[,/;\n]/)
                  .map((s) => s.trim())
                  .filter(Boolean)
                const matchProducts = createForm.matchProducts
                  .split(/[,/;\n]/)
                  .map((s) => s.trim())
                  .filter(Boolean)
                void (async () => {
                  try {
                    setLoading(true)
                    const now = new Date().toISOString()
                    const q = createForm.quoteUsd.trim()
                    const quote =
                      q && /^\d+(\.\d+)?$/.test(q)
                        ? { currency: 'USD' as const, amount: Number(q), note: createForm.quoteNote.trim() || undefined }
                        : createForm.quoteNote.trim()
                          ? { currency: 'USD' as const, note: createForm.quoteNote.trim() }
                          : undefined
                    const sample = createForm.sampleAddress.trim()
                      ? { address: createForm.sampleAddress.trim() }
                      : undefined
                    const deepKeyProducts = createForm.deepKeyProducts
                      .split(/[,/;\n]/)
                      .map((s) => s.trim())
                      .filter(Boolean)

                    const payload: any = {
                      nickname: createForm.nickname.trim(),
                      platform: createForm.platform,
                      profileUrl: createForm.profileUrl.trim(),
                      owner: createForm.owner || operatorName,
                      status: createForm.status,
                      nextAction: getNextActionForStatus(createForm.status),
                      cooperationLevel: createForm.cooperationLevel,
                      country: createForm.country.trim() || undefined,
                      followers: createForm.followers ? Number(createForm.followers) : 0,
                      contentTypes,
                      productLines,
                      matchProducts,
                      potential: createForm.potential,
                      email: createForm.email.trim() || undefined,
                      phone: createForm.phone.trim() || undefined,
                      whatsapp: createForm.whatsapp.trim() || undefined,
                      instagram: createForm.instagram.trim() || undefined,
                      otherContact: createForm.otherContact.trim() || undefined,
                      language: createForm.language.trim() || undefined,
                      quote,
                      sample,
                      deepRequirements:
                        createForm.cooperationLevel === 'deep'
                          ? createForm.deepRequirements.trim() || undefined
                          : undefined,
                      deepKeyProducts:
                        createForm.cooperationLevel === 'deep' ? deepKeyProducts : undefined,
                      deepFrequency:
                        createForm.cooperationLevel === 'deep'
                          ? createForm.deepFrequency.trim() || undefined
                          : undefined,
                      deepNotes:
                        createForm.cooperationLevel === 'deep'
                          ? createForm.deepNotes.trim() || undefined
                          : undefined,
                    }

                    if (editTargetId) {
                      await apiPatch(editTargetId, payload)
                      // 局部更新：不拉全量列表、不打断筛选/滚动
                      await updateInfluencer(editTargetId, {
                        ...payload,
                        quote,
                        sample,
                        lastFollowUpNote: createForm.notes.trim() || undefined,
                        lastFollowUpAt: now,
                      } as any)
                      pushToast('success', '已更新达人资料')
                    } else {
                      const createdId = (await apiCreate({
                        ...payload,
                        timeline: [
                          {
                            id: `fu_${Math.random().toString(16).slice(2)}`,
                            at: now,
                            by: operatorName,
                            type: '其他',
                            channel: '其他',
                            responseStatus: '无回复',
                            note: createForm.notes.trim() || '新建达人卡片，等待补全资料。',
                            nextAction: getNextActionForStatus(createForm.status),
                          },
                        ],
                      })) as string
                      setItems((prev) => {
                        const base = prev ?? []
                        const local: Influencer = {
                          id: createdId || `tmp_${Math.random().toString(16).slice(2)}`,
                          nickname: createForm.nickname.trim(),
                          platform: createForm.platform,
                          profileUrl: createForm.profileUrl.trim(),
                          country: createForm.country.trim() || undefined,
                          followers: createForm.followers ? Number(createForm.followers) : 0,
                          contentTypes,
                          productLines,
                          matchProducts,
                          status: createForm.status,
                          cooperationLevel: createForm.cooperationLevel,
                          owner: createForm.owner || operatorName,
                          potential: createForm.potential,
                          email: createForm.email.trim() || undefined,
                          phone: createForm.phone.trim() || undefined,
                          whatsapp: createForm.whatsapp.trim() || undefined,
                          instagram: createForm.instagram.trim() || undefined,
                          otherContact: createForm.otherContact.trim() || undefined,
                          language: createForm.language.trim() || undefined,
                          tags: [],
                          lastFollowUpAt: now,
                          lastFollowUpNote: createForm.notes.trim() || '新建达人卡片，等待补全资料。',
                          nextAction: getNextActionForStatus(createForm.status),
                          timeline: [
                            {
                              id: `fu_${Math.random().toString(16).slice(2)}`,
                              at: now,
                              by: operatorName,
                              type: '其他',
                              channel: '其他',
                              responseStatus: '无回复',
                              note: createForm.notes.trim() || '新建达人卡片，等待补全资料。',
                              nextAction: getNextActionForStatus(createForm.status),
                            },
                          ],
                          quote,
                          sample,
                          deepRequirements:
                            createForm.cooperationLevel === 'deep'
                              ? createForm.deepRequirements.trim() || undefined
                              : undefined,
                          deepKeyProducts:
                            createForm.cooperationLevel === 'deep' ? deepKeyProducts : undefined,
                          deepFrequency:
                            createForm.cooperationLevel === 'deep'
                              ? createForm.deepFrequency.trim() || undefined
                              : undefined,
                          deepNotes:
                            createForm.cooperationLevel === 'deep'
                              ? createForm.deepNotes.trim() || undefined
                              : undefined,
                        }
                        return [local, ...base]
                      })
                      pushToast('success', '已新建达人（后台写入中）')
                    }
                    setCreateOpen(false)
                    setEditTargetId('')
                  } catch (e) {
                    console.error(e)
                    setCreateError((e as any)?.message || '创建失败')
                  } finally {
                    setLoading(false)
                  }
                })()
              }}
              className="px-3 py-2 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              保存
            </button>
          </div>
        }
      >
        {createError && <div className="mb-3 text-xs text-red-600">{createError}</div>}
        <div className="space-y-4 text-xs">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="text-xs font-semibold text-gray-900 mb-2">基础必填</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-gray-600 mb-1">昵称（必填）</div>
                <input
                  value={createForm.nickname}
                  onChange={(e) => setCreateForm((p) => ({ ...p, nickname: e.target.value }))}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg bg-white"
                />
              </div>
              <div>
                <div className="text-[11px] text-gray-600 mb-1">平台（必填）</div>
                <select
                  value={createForm.platform}
                  onChange={(e) => setCreateForm((p) => ({ ...p, platform: e.target.value as any }))}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg bg-white"
                >
                  <option value="TikTok">TikTok</option>
                  <option value="Instagram">Instagram</option>
                  <option value="YouTube">YouTube</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <div className="text-[11px] text-gray-600 mb-1">主页链接（必填）</div>
                <input
                  value={createForm.profileUrl}
                  onChange={(e) => setCreateForm((p) => ({ ...p, profileUrl: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg bg-white"
                />
              </div>
              <div>
                <div className="text-[11px] text-gray-600 mb-1">负责人（必填）</div>
                <input
                  value={createForm.owner}
                  onChange={(e) => setCreateForm((p) => ({ ...p, owner: e.target.value }))}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg bg-white"
                />
              </div>
              <div>
                <div className="text-[11px] text-gray-600 mb-1">初始状态（必填）</div>
                <select
                  value={createForm.status}
                  onChange={(e) => setCreateForm((p) => ({ ...p, status: e.target.value as any }))}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg bg-white"
                >
                  {Object.entries(statusLabel).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-[11px] text-gray-600 mb-1">合作层级</div>
                <select
                  value={createForm.cooperationLevel}
                  onChange={(e) => setCreateForm((p) => ({ ...p, cooperationLevel: e.target.value as any }))}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg bg-white"
                >
                  <option value="normal">普通</option>
                  <option value="key">重点</option>
                  <option value="deep">深度合作</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-100 bg-white p-3">
            <div className="text-xs font-semibold text-gray-900 mb-2">可后补（随时可编辑）</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-gray-600 mb-1">国家/地区</div>
                <input
                  value={createForm.country}
                  onChange={(e) => setCreateForm((p) => ({ ...p, country: e.target.value }))}
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
                />
              </div>
              <div>
                <div className="text-[11px] text-gray-600 mb-1">粉丝量</div>
                <input
                  value={createForm.followers}
                  onChange={(e) => setCreateForm((p) => ({ ...p, followers: e.target.value }))}
                  placeholder="例如：42000"
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
                />
              </div>
              <div className="md:col-span-2">
                <div className="text-[11px] text-gray-600 mb-1">内容类型（逗号分隔）</div>
                <input
                  value={createForm.contentTypes}
                  onChange={(e) => setCreateForm((p) => ({ ...p, contentTypes: e.target.value }))}
                  placeholder="测评, 教程, 开箱"
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
                />
              </div>
              <div className="md:col-span-2">
                <div className="text-[11px] text-gray-600 mb-1">匹配产品（逗号分隔）</div>
                <input
                  value={createForm.matchProducts}
                  onChange={(e) => setCreateForm((p) => ({ ...p, matchProducts: e.target.value }))}
                  placeholder="HD Lace Bob, Glueless Curly 24"
                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
                />
              </div>
              <div className="md:col-span-2">
                <div className="text-[11px] text-gray-600 mb-1">备注</div>
                <textarea
                  value={createForm.notes}
                  onChange={(e) => setCreateForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full min-h-[72px] px-2.5 py-2 border border-gray-200 rounded-lg"
                />
              </div>
            </div>

            <div className="mt-3 border-t pt-3">
              <div className="text-xs font-semibold text-gray-900 mb-2">联系方式（可选）</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-gray-600 mb-1">邮箱</div>
                  <input value={createForm.email} onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))} className="w-full px-2.5 py-2 border border-gray-200 rounded-lg" />
                </div>
                <div>
                  <div className="text-[11px] text-gray-600 mb-1">WhatsApp</div>
                  <input value={createForm.whatsapp} onChange={(e) => setCreateForm((p) => ({ ...p, whatsapp: e.target.value }))} className="w-full px-2.5 py-2 border border-gray-200 rounded-lg" />
                </div>
                <div>
                  <div className="text-[11px] text-gray-600 mb-1">Instagram（账号/链接）</div>
                  <input value={createForm.instagram} onChange={(e) => setCreateForm((p) => ({ ...p, instagram: e.target.value }))} className="w-full px-2.5 py-2 border border-gray-200 rounded-lg" />
                </div>
                <div>
                  <div className="text-[11px] text-gray-600 mb-1">其他联系方式</div>
                  <input value={createForm.otherContact} onChange={(e) => setCreateForm((p) => ({ ...p, otherContact: e.target.value }))} className="w-full px-2.5 py-2 border border-gray-200 rounded-lg" />
                </div>
              </div>
            </div>

            <div className="mt-3 border-t pt-3">
              <div className="text-xs font-semibold text-gray-900 mb-2">合作报价 / 寄样信息（可选）</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-gray-600 mb-1">合作报价（USD）</div>
                  <input value={createForm.quoteUsd} onChange={(e) => setCreateForm((p) => ({ ...p, quoteUsd: e.target.value }))} placeholder="例如：350" className="w-full px-2.5 py-2 border border-gray-200 rounded-lg" />
                </div>
                <div>
                  <div className="text-[11px] text-gray-600 mb-1">报价备注</div>
                  <input value={createForm.quoteNote} onChange={(e) => setCreateForm((p) => ({ ...p, quoteNote: e.target.value }))} placeholder="含几条视频/交期等" className="w-full px-2.5 py-2 border border-gray-200 rounded-lg" />
                </div>
                <div className="md:col-span-2">
                  <div className="text-[11px] text-gray-600 mb-1">寄样地址/收件信息</div>
                  <textarea value={createForm.sampleAddress} onChange={(e) => setCreateForm((p) => ({ ...p, sampleAddress: e.target.value }))} className="w-full min-h-[72px] px-2.5 py-2 border border-gray-200 rounded-lg whitespace-pre-wrap" placeholder="姓名/电话/地址/邮编等" />
                </div>
              </div>
            </div>

            {createForm.cooperationLevel === 'deep' && (
              <div className="mt-3 border-t pt-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-900">深度合作（额外字段）</div>
                  <span className="text-[11px] text-purple-700">仅深度合作显示</span>
                </div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <div className="text-[11px] text-gray-600 mb-1">定制合作要求</div>
                    <textarea
                      value={createForm.deepRequirements}
                      onChange={(e) => setCreateForm((p) => ({ ...p, deepRequirements: e.target.value }))}
                      className="w-full min-h-[72px] px-2.5 py-2 border border-gray-200 rounded-lg whitespace-pre-wrap"
                      placeholder="例如：固定开头结构/必须展示佩戴细节/字幕节奏要求…"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-[11px] text-gray-600 mb-1">重点合作产品（逗号分隔）</div>
                    <input
                      value={createForm.deepKeyProducts}
                      onChange={(e) => setCreateForm((p) => ({ ...p, deepKeyProducts: e.target.value }))}
                      className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
                      placeholder="例如：HD Lace Bob, Glueless Curly 24"
                    />
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-600 mb-1">固定合作频率</div>
                    <input
                      value={createForm.deepFrequency}
                      onChange={(e) => setCreateForm((p) => ({ ...p, deepFrequency: e.target.value }))}
                      className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
                      placeholder="例如：每周 1 条 / 每月 2 场直播"
                    />
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-600 mb-1">特别注意事项</div>
                    <input
                      value={createForm.deepNotes}
                      onChange={(e) => setCreateForm((p) => ({ ...p, deepNotes: e.target.value }))}
                      className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
                      placeholder="例如：避免某些话术/必须提前 3 天对脚本"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* 批量导入弹窗（mock 占位） */}
      <Modal
        open={importOpen}
        title="批量导入达人"
        subtitle="支持 CSV/Excel（本版为 mock 占位：先展示流程结构）"
        onClose={() => setImportOpen(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setImportOpen(false)}
              className="px-3 py-2 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50"
            >
              关闭
            </button>
            <button
              onClick={() => {
                pushToast('info', '导入功能（字段映射/预览/去重）下一步接入')
                setImportOpen(false)
              }}
              className="px-3 py-2 text-xs bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200"
            >
              确认（占位）
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="text-xs font-semibold text-gray-900 mb-1">步骤 1：上传文件</div>
            <input type="file" className="text-xs" />
            <div className="mt-1 text-[11px] text-gray-500">支持 CSV / Excel。后续会加入字段映射与去重提示。</div>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="text-xs font-semibold text-gray-900 mb-1">步骤 2：字段映射（占位）</div>
            <div className="text-[11px] text-gray-600">示例：昵称 → name，平台 → platform，粉丝量 → followers ...</div>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="text-xs font-semibold text-gray-900 mb-1">步骤 3：导入预览（占位）</div>
            <div className="text-[11px] text-gray-600">将展示前 20 行预览、重复项提醒、失败原因。</div>
          </div>
        </div>
      </Modal>

      {/* 新建跟进记录弹窗 */}
      <Modal
        open={followUpOpen}
        title="新建跟进记录"
        subtitle="记录动作、对方反馈、下一步和下次跟进时间"
        onClose={() => setFollowUpOpen(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setFollowUpOpen(false)}
              className="px-3 py-2 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={() => {
                if (!followUpTargetId) {
                  setFollowUpError('请选择达人')
                  return
                }
                if (!followUpForm.summary.trim()) {
                  setFollowUpError('跟进摘要必填')
                  return
                }
                setFollowUpError('')
                const nextAt = followUpForm.nextFollowUpAt ? new Date(followUpForm.nextFollowUpAt) : null
                if (nextAt && Number.isNaN(nextAt.getTime())) {
                  setFollowUpError('下次跟进时间格式不正确')
                  return
                }
                const entry: FollowUp = {
                  id: `fu_${Math.random().toString(16).slice(2)}`,
                  at: new Date().toISOString(),
                  by: followUpForm.operator || operatorName,
                  type: followUpForm.type,
                  channel: followUpForm.channel,
                  responseStatus: followUpForm.responseStatus,
                  note: followUpForm.summary.trim(),
                  nextAction: followUpForm.nextAction.trim() || undefined,
                  nextFollowUpAt: nextAt ? nextAt.toISOString() : undefined,
                }
                void appendFollowUp(followUpTargetId, entry)
                pushToast('success', '已新增跟进记录')
                setFollowUpOpen(false)
              }}
              className="px-3 py-2 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              保存
            </button>
          </div>
        }
      >
        {followUpError && <div className="mb-3 text-xs text-red-600">{followUpError}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="md:col-span-2">
            <div className="text-[11px] text-gray-600 mb-1">选择达人</div>
              <select
                value={followUpTargetId}
                onChange={(e) => setFollowUpTargetId(e.target.value)}
                className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
              >
                <option value="">请选择</option>
                {baseItems.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nickname}（{statusLabel[x.status]}）
                  </option>
                ))}
              </select>
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">跟进类型</div>
            <select
              value={followUpForm.type}
              onChange={(e) => setFollowUpForm((p) => ({ ...p, type: e.target.value as any }))}
              className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
            >
              {['首联','二次跟进','报价沟通','寄样沟通','催出片','复盘','其他'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">渠道</div>
            <select
              value={followUpForm.channel}
              onChange={(e) => setFollowUpForm((p) => ({ ...p, channel: e.target.value as any }))}
              className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
            >
              {['私信','邮件','WhatsApp','微信','其他'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <div className="text-[11px] text-gray-600 mb-1">跟进摘要（必填）</div>
            <textarea
              value={followUpForm.summary}
              onChange={(e) => setFollowUpForm((p) => ({ ...p, summary: e.target.value }))}
              className="w-full min-h-[72px] px-2.5 py-2 border border-gray-200 rounded-lg"
              placeholder="例如：已二次跟进，提醒对方确认合作方式与交期"
            />
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">对方回复</div>
            <select
              value={followUpForm.responseStatus}
              onChange={(e) => setFollowUpForm((p) => ({ ...p, responseStatus: e.target.value as any }))}
              className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
            >
              {['无回复','有兴趣','拒绝','待确认'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-1">下次跟进时间</div>
            <input
              type="datetime-local"
              value={followUpForm.nextFollowUpAt}
              onChange={(e) => setFollowUpForm((p) => ({ ...p, nextFollowUpAt: e.target.value }))}
              className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
            />
          </div>
          <div className="md:col-span-2">
            <div className="text-[11px] text-gray-600 mb-1">下一步动作</div>
            <input
              value={followUpForm.nextAction}
              onChange={(e) => setFollowUpForm((p) => ({ ...p, nextAction: e.target.value }))}
              className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
              placeholder="例如：确认报价 / 安排寄样 / 催出片"
            />
          </div>
        </div>
      </Modal>

      {/* 顶部统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="待建联"
          count={stats.to_outreach}
          active={statFilter === 'to_outreach'}
          onClick={() => {
            setStatus('all')
            setStatFilter((v) => (v === 'to_outreach' ? 'all' : 'to_outreach'))
          }}
        />
        <StatCard
          label="已发送"
          count={stats.sent}
          active={statFilter === 'sent'}
          onClick={() => {
            setStatus('all')
            setStatFilter((v) => (v === 'sent' ? 'all' : 'sent'))
          }}
        />
        <StatCard
          label="已寄样"
          count={stats.sample_sent}
          active={statFilter === 'sample_sent'}
          onClick={() => {
            setStatus('all')
            setStatFilter((v) => (v === 'sample_sent' ? 'all' : 'sample_sent'))
          }}
        />
        <StatCard
          label="合作中"
          count={stats.cooperating}
          active={statFilter === 'cooperating'}
          onClick={() => {
            setStatus('all')
            setStatFilter((v) => (v === 'cooperating' ? 'all' : 'cooperating'))
          }}
        />
        <StatCard
          label="已出片"
          count={stats.posted}
          active={statFilter === 'posted'}
          onClick={() => {
            setStatus('all')
            setStatFilter((v) => (v === 'posted' ? 'all' : 'posted'))
          }}
        />
        <StatCard
          label="已完成"
          count={stats.done}
          active={statFilter === 'done'}
          onClick={() => {
            setStatus('all')
            setStatFilter((v) => (v === 'done' ? 'all' : 'done'))
          }}
        />
      </div>

      {/* 中间筛选区 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex-1">
            <div className="text-[11px] text-gray-500 mb-1">搜索</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="支持达人昵称 / 邮箱 / 平台链接 / 产品关键词"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 w-full lg:w-auto">
            <div>
              <div className="text-[11px] text-gray-500 mb-1">平台</div>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg"
              >
                <option value="all">全部</option>
                {platforms.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-1">国家/地区</div>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg"
              >
                <option value="all">全部</option>
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-1">状态</div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg"
              >
                <option value="all">全部</option>
                {Object.entries(statusLabel).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-1">负责人</div>
              <select
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg"
              >
                <option value="all">全部</option>
                {owners.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-1">合作层级</div>
              <select
                value={coopLevel}
                onChange={(e) => setCoopLevel(e.target.value)}
                className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg"
              >
                <option value="all">全部</option>
                <option value="normal">普通</option>
                <option value="key">重点</option>
                <option value="deep">深度合作</option>
              </select>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-1">产品线</div>
              <select
                value={productLine}
                onChange={(e) => setProductLine(e.target.value)}
                className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg"
              >
                <option value="all">全部</option>
                {productLines.map((pl) => (
                  <option key={pl} value={pl}>
                    {pl}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-1">粉丝量</div>
              <select
                value={followersBand}
                onChange={(e) => setFollowersBand(e.target.value)}
                className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg"
              >
                <option value="all">全部</option>
                <option value="0-10k">0-10K</option>
                <option value="10k-50k">10K-50K</option>
                <option value="50k-200k">50K-200K</option>
                <option value="200k+">200K+</option>
              </select>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-1">最近跟进</div>
              <select
                value={followUpRecency}
                onChange={(e) => setFollowUpRecency(e.target.value)}
                className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg"
              >
                <option value="all">全部</option>
                <option value="3d">近 3 天</option>
                <option value="7d">近 7 天</option>
                <option value="14d">近 14 天</option>
                <option value="over14d">超过 14 天</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-[11px] text-gray-500">
            当前 {filtered.length} 位达人（按“下一步动作优先”排序）
          </div>
          <button
            onClick={resetFilters}
            className="px-2.5 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            清空筛选
          </button>
          <button
            onClick={() => {
              if (!canManage) {
                pushToast('error', '无权限重置数据')
                return
              }
              void (async () => {
                try {
                  setLoading(true)
                  await apiSeed()
                  await loadInfluencers()
                  pushToast('success', '已重置为默认测试数据（全员可见）')
                  resetFilters()
                } catch (e) {
                  console.error(e)
                  pushToast('error', '重置失败')
                } finally {
                  setLoading(false)
                }
              })()
            }}
            className="px-2.5 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 border border-red-100"
          >
            重置测试数据
          </button>
        </div>
      </div>

      {/* 主列表区域 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">
            当前显示：{effectiveLabel}达人（{filtered.length}）
          </div>
          <div className="text-[11px] text-gray-500">建议从「待建联 / 已发送 / 合作中」开始推进</div>
        </div>

        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-gray-500">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-500">暂无符合条件的达人。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-[11px] text-gray-500">达人</th>
                  <th className="px-4 py-2 text-left text-[11px] text-gray-500">平台</th>
                  <th className="px-4 py-2 text-left text-[11px] text-gray-500">粉丝量</th>
                  <th className="px-4 py-2 text-left text-[11px] text-gray-500">内容类型</th>
                  <th className="px-4 py-2 text-left text-[11px] text-gray-500">匹配产品</th>
                  <th className="px-4 py-2 text-left text-[11px] text-gray-500">当前状态</th>
                  <th className="px-4 py-2 text-left text-[11px] text-gray-500">最近跟进</th>
                  <th className="px-4 py-2 text-left text-[11px] text-gray-500">负责人</th>
                  <th className="px-4 py-2 text-left text-[11px] text-gray-500">潜力</th>
                  <th className="px-4 py-2 text-left text-[11px] text-gray-500">合作层级</th>
                  <th className="px-4 py-2 text-left text-[11px] text-gray-500">下一步动作</th>
                  <th className="px-4 py-2 text-left text-[11px] text-gray-500">跟进记录</th>
                  <th className="px-4 py-2 text-left text-[11px] text-gray-500">更多操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.map((x) => (
                  <tr
                    key={x.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => openDetail(x)}
                  >
                    <td className="px-4 py-2 align-middle">
                      <div className="text-sm font-medium text-gray-900 truncate max-w-[220px]">
                        {x.nickname}
                      </div>
                      <div className="mt-0.5 text-[11px] text-gray-500 truncate max-w-[220px]">
                        {x.country || '-'} · {x.productLines[0] || '未标注产品线'}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700 align-middle">
                      <span className="px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-[11px]">
                        {x.platform}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700 align-middle">
                      {formatFollowers(x.followers)}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700 align-middle">
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {x.contentTypes.slice(0, 2).map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-full bg-gray-50 text-[11px] text-gray-600 border border-gray-200"
                          >
                            {t}
                          </span>
                        ))}
                        {x.contentTypes.length > 2 && (
                          <span className="text-[11px] text-gray-400">+{x.contentTypes.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700 align-middle">
                      <div className="text-[11px] text-gray-700 truncate max-w-[240px]">
                        {x.matchProducts.join(' / ') || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <Badge status={x.status} />
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <div className="text-[11px] text-gray-700">{daysAgo(x.lastFollowUpAt)}</div>
                      <div className="text-[11px] text-gray-400 truncate max-w-[200px]">
                        {x.lastFollowUpNote || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700 align-middle">{x.owner}</td>
                    <td className="px-4 py-2 align-middle">
                      <PotentialBadge p={x.potential} />
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <CoopBadge level={(x.cooperationLevel as any) || 'normal'} />
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-900 font-medium whitespace-nowrap">{x.nextAction}</span>
                        {canManage && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              openNextAction(x)
                            }}
                            className="ml-auto px-2.5 py-1.5 text-[11px] rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                          >
                            {x.nextAction}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 align-middle">
                      {canManage ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setFollowUpError('')
                            setFollowUpTargetId(x.id)
                            setFollowUpForm((p) => ({
                              ...p,
                              operator: operatorName as string,
                              summary: '',
                              nextAction: x.nextAction || '',
                              nextFollowUpAt: '',
                              type: '其他',
                              channel: '私信',
                              responseStatus: '无回复',
                            }))
                            setFollowUpOpen(true)
                          }}
                          className="px-2.5 py-1.5 text-[11px] rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        >
                          记一条跟进
                        </button>
                      ) : (
                        <span className="text-[11px] text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setRowMenuOpenId((v) => (v === x.id ? '' : x.id))
                          }}
                          className="px-2.5 py-1.5 text-[11px] rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        >
                          更多
                        </button>
                        {rowMenuOpenId === x.id && (
                          <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg text-xs z-20">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setRowMenuOpenId('')
                                openDetail(x)
                              }}
                              className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 text-gray-700"
                            >
                              查看详情
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setRowMenuOpenId('')
                                if (!canManage) return
                                openUpsert(x)
                              }}
                              className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 text-gray-700"
                            >
                              编辑资料
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setRowMenuOpenId('')
                                if (!canManage) return
                                const nextOwner = window.prompt('重新分配负责人：', x.owner || '') || ''
                                if (!nextOwner.trim()) return
                                updateInfluencer(x.id, { owner: nextOwner.trim() })
                                pushToast('success', '已更新负责人')
                              }}
                              className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 text-gray-700"
                            >
                              重新分配负责人
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setRowMenuOpenId('')
                                if (!canManage) return
                                const next = window.prompt(
                                  `更改状态：\n${Object.entries(statusLabel)
                                    .map(([k, v]) => `${k} = ${v}`)
                                    .join('\n')}`,
                                  x.status,
                                )
                                if (!next) return
                                if (!(next in statusLabel)) return
                                void updateInfluencer(x.id, { status: next as any, nextAction: getNextActionForStatus(next as any) })
                                pushToast('success', '已更新状态')
                              }}
                              className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 text-gray-700"
                            >
                              更改状态
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setRowMenuOpenId('')
                                if (!canManage) return
                                void updateInfluencer(x.id, { status: 'done', nextAction: '二次合作' })
                                pushToast('success', '已标记为已完成')
                              }}
                              className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 text-gray-700"
                            >
                              标记已完成
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setRowMenuOpenId('')
                                if (!canManage) return
                                void updateInfluencer(x.id, { isPaused: true, status: 'paused', nextAction: '暂停跟进' })
                                pushToast('info', '已暂停跟进')
                              }}
                              className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 text-gray-700"
                            >
                              暂停跟进
                            </button>
                            <div className="border-t border-gray-200" />
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setRowMenuOpenId('')
                                if (!canManage) return
                                const first = window.confirm('删除达人将移除该达人及所有跟进记录，确认继续？')
                                if (!first) return
                                const second = window.confirm(`再次确认删除「${x.nickname}」？此操作不可恢复。`)
                                if (!second) return
                                  void (async () => {
                                  try {
                                    await apiDelete(x.id)
                                      setItems((prev) => (prev ? prev.filter((it) => it.id !== x.id) : prev))
                                      if (selected?.id === x.id) {
                                        setSelected(null)
                                        setDrawerOpen(false)
                                      }
                                      pushToast('success', '已删除达人')
                                  } catch (err) {
                                    console.error(err)
                                    pushToast('error', '删除失败')
                                  }
                                })()
                              }}
                              className="block w-full px-3 py-1.5 text-left hover:bg-red-50 text-red-600"
                            >
                              删除（危险）
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Drawer
        open={drawerOpen}
        influencer={selected}
        onClose={() => setDrawerOpen(false)}
        onAddFollowUp={addFollowUp}
        onUpdateStatus={updateStatus}
      />

      {/* 下一步动作弹窗（按状态推进流程） */}
      <Modal
        open={actionOpen}
        title="推进下一步动作"
        subtitle="记录动作摘要并推进状态（会同步更新时间线与下一步动作）"
        onClose={() => setActionOpen(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setActionOpen(false)}
              className="px-3 py-2 text-xs bg-white border border-gray-200 text-gray-800 rounded-lg hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={applyNextAction}
              className="px-3 py-2 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              确认并推进
            </button>
          </div>
        }
      >
        {actionError && <div className="mb-3 text-xs text-red-600">{actionError}</div>}
        {(() => {
          if (!items) return <div className="text-xs text-gray-500">未选择达人</div>
          const target = items.find((x) => x.id === actionTargetId)
          if (!target) return <div className="text-xs text-gray-500">未选择达人</div>

          return (
            <div className="space-y-3 text-xs">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs font-semibold text-gray-900">{target.nickname}</div>
                  <Badge status={target.status} />
                  <span className="text-[11px] text-gray-500">下一步：{target.nextAction}</span>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-gray-600 mb-1">本次操作摘要（必填）</div>
                <textarea
                  value={actionForm.summary}
                  onChange={(e) => setActionForm((p) => ({ ...p, summary: e.target.value }))}
                  className="w-full min-h-[80px] px-2.5 py-2 border border-gray-200 rounded-lg"
                  placeholder="例如：已发送首条合作私信，说明置换+佣金方案，并约定3天后跟进"
                />
              </div>

              {target.status === 'to_outreach' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <div className="text-[11px] text-gray-600 mb-1">发送内容摘要（可选）</div>
                    <input
                      value={actionForm.messageSummary}
                      onChange={(e) => setActionForm((p) => ({ ...p, messageSummary: e.target.value }))}
                      className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
                      placeholder="例如：置换合作 + 佣金 10% + 提供产品卖点脚本"
                    />
                  </div>
                </div>
              )}

              {target.status === 'cooperating' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] text-gray-600 mb-1">报价（USD，可选）</div>
                    <input
                      value={actionForm.quoteUsd}
                      onChange={(e) => setActionForm((p) => ({ ...p, quoteUsd: e.target.value }))}
                      className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
                      placeholder="350"
                    />
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-600 mb-1">佣金（%，可选）</div>
                    <input
                      value={actionForm.commissionPct}
                      onChange={(e) => setActionForm((p) => ({ ...p, commissionPct: e.target.value }))}
                      className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
                      placeholder="10"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-[11px] text-gray-600 mb-1">寄样时间（可选）</div>
                    <input
                      type="datetime-local"
                      value={actionForm.sampleSentAt}
                      onChange={(e) => setActionForm((p) => ({ ...p, sampleSentAt: e.target.value }))}
                      className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
                    />
                    <div className="mt-1 text-[11px] text-gray-500">提交时会询问是否进入“已寄样”。</div>
                  </div>
                </div>
              )}

              {target.status === 'sample_sent' && (
                <div>
                  <div className="text-[11px] text-gray-600 mb-1">预计出片/下次跟进时间（可选）</div>
                  <input
                    type="datetime-local"
                    value={actionForm.expectedPostAt}
                    onChange={(e) => setActionForm((p) => ({ ...p, expectedPostAt: e.target.value }))}
                    className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
                  />
                </div>
              )}

              {target.status === 'posted' && (
                <div className="space-y-3">
                  <div>
                    <div className="text-[11px] text-gray-600 mb-1">出片链接（可选）</div>
                    <input
                      value={actionForm.postUrl}
                      onChange={(e) => setActionForm((p) => ({ ...p, postUrl: e.target.value }))}
                      className="w-full px-2.5 py-2 border border-gray-200 rounded-lg"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-600 mb-1">复盘总结（可选）</div>
                    <textarea
                      value={actionForm.reviewSummary}
                      onChange={(e) => setActionForm((p) => ({ ...p, reviewSummary: e.target.value }))}
                      className="w-full min-h-[72px] px-2.5 py-2 border border-gray-200 rounded-lg"
                      placeholder="表现结果、问题点、下次合作建议…"
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}

