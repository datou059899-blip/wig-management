export type ScriptItem = {
  id: string
  title: string
  platform: string
  sku: string
  sourceUrl: string
  status: string
  updatedAt: string
  tags: string[]
  isLearned: boolean
  isPracticing: boolean
  positionAnalysis: string
  hookAnalysis: string
  rhythmAnalysis: string
  shotAnalysis: string
  subtitleAnalysis: string
  whyItWorked: string
  whatToWatch: string
  commonMistakes: string
  todayExecution: string
}

export type InfluencerStatus =
  | 'to_screen'
  | 'to_outreach'
  | 'sent'
  | 'negotiating'
  | 'sample_sent'
  | 'posted'
  | 'long_term'
  | 'paused'
  | 'not_coop'

export type Potential = 'A' | 'B' | 'C'

export type FollowUp = {
  id: string
  at: string
  by: string
  note: string
  type?: '首联' | '二次跟进' | '报价沟通' | '寄样沟通' | '催出片' | '复盘' | '其他'
  channel?: '私信' | '邮件' | 'WhatsApp' | '微信' | '其他'
  responseStatus?: '无回复' | '有兴趣' | '拒绝' | '待确认'
  nextAction?: string
  nextFollowUpAt?: string
}

export type Influencer = {
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
  owner: string
  potential: Potential
  email?: string
  whatsapp?: string
  phone?: string
  language?: string
  tags?: string[]
  matchedProducts?: string[]
  lastFollowUpAt?: string
  lastFollowUpNote?: string
  firstContactAt?: string
  nextFollowUpAt?: string
  nextAction: string
  timeline: FollowUp[]
  quote?: { currency: 'USD'; amount?: number; note?: string }
  commission?: number
  sample?: { address?: string; tracking?: string; sentAt?: string }
  deliverables?: { videoUrl?: string; postedAt?: string; note?: string }
  review?: { summary?: string; score?: number }
  isLongTermPartner?: boolean
  isPaused?: boolean
}

export type ProductItem = {
  id: string
  name: string
  sku: string
  image: string
  description: string
  material?: string | null
  style?: string | null
  costCny: number
  priceUsd: number
  discountPriceUsd?: number | null
  firstLegLogisticsCostUsd: number
  lastLegLogisticsCostUsd: number
  laceSize?: string | null
  influencerCommissionUsd: number
  adCostUsd: number
  stock: number
  costUsd: number
  effectivePrice: number
  profit: number
  profitMargin: number
  warningStock: boolean
  warningProfit: boolean
  warningMissing: boolean
  tiktokSync: any
  updatedAt?: string
}

export type DayPoint = {
  date: string
  gmv: number
  orders: number
  adsCost: number
}

export type ProductPerf = {
  id: string
  name: string
  sku: string
  productLine: string
  owner: string
  status: 'normal' | 'watch' | 'pause'
  todayGmv: number
  todayOrders: number
  todayAdsCost: number
  lastUpdatedAt: string
}

export type DataStatus = {
  shopLastSyncAt: string | null
  adsLastSyncAt: string | null
  lastImportedBy: string | null
  state: 'ok' | 'stale' | 'error'
}

