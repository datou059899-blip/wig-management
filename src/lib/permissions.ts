/**
 * 基于角色的权限配置
 * 角色：admin | lead | product_operator | operator | editor | optimizer | viewer | influencer_operator
 */

export const ROLES = ['admin', 'lead', 'product_operator', 'operator', 'editor', 'optimizer', 'viewer', 'influencer_operator'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  lead: '总负责人',
  product_operator: '产品运营',
  operator: '运营',
  editor: '剪辑',
  optimizer: '投手',
  viewer: '只读',
  influencer_operator: '达人运营',
}

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: '可访问全部模块，管理用户与系统设置',
  lead: '业务推进负责人，创建和分配任务、设置优先级、管理排期、查看全员任务进度',
  product_operator: '管理选品更新池、产品列表、达人建联、脚本拆解，负责产品推进全流程',
  operator: '产品列表、TikTok 同步、价格对账、脚本拆解、达人建联',
  editor: '脚本拆解、我的任务、我的复盘（仅查看与训练相关动作）',
  optimizer: '产品列表、价格对账、脚本拆解（以投放分析为主）',
  influencer_operator: '以达人建联为主，可配合查看产品列表与脚本拆解',
  viewer: '概览、产品概况、价格概况、脚本概况、达人合作概况，仅只读',
}

/** 各角色的默认首页 */
export const ROLE_DEFAULT_PAGES: Record<string, string> = {
  admin: '/dashboard',
  lead: '/dashboard/workbench',
  product_operator: '/dashboard/opportunities',
  operator: '/dashboard/opportunities',
  influencer_operator: '/dashboard/influencers',
  editor: '/dashboard/scripts',
  optimizer: '/dashboard/workbench',
  viewer: '/dashboard/workbench',
}

/** 各角色可访问的模块（用于展示） */
export const ROLE_MODULES: Record<string, string[]> = {
  admin: ['今日工作台', '选品更新池', '产品列表', '达人建联', '脚本拆解', '经营数据', 'TikTok 同步', '价格对账', '用户管理', '系统设置', '概览'],
  lead: ['今日工作台', '选品更新池', '产品列表', '达人建联', '脚本拆解', '经营数据', '价格对账'],
  product_operator: ['今日工作台', '选品更新池', '产品列表', '达人建联', '脚本拆解', '经营数据'],
  operator: ['今日工作台', '选品更新池', '产品列表', '达人建联', '脚本拆解', '经营数据', 'TikTok 同步', '价格对账'],
  editor: ['今日工作台', '脚本拆解'],
  optimizer: ['今日工作台', '产品列表', '脚本拆解', '经营数据'],
  influencer_operator: ['今日工作台', '达人建联', '产品列表', '脚本拆解'],
  viewer: ['今日工作台', '产品列表', '脚本拆解', '经营数据', '达人建联', '概览'],
}

/** 部门选项 */
export const DEPARTMENTS = [
  { value: '', label: '未设置' },
  { value: '运营部', label: '运营部' },
  { value: '剪辑部', label: '剪辑部' },
  { value: '投放部', label: '投放部' },
  { value: '达人运营部', label: '达人运营部' },
  { value: '供应链', label: '供应链' },
  { value: '财务部', label: '财务部' },
  { value: '管理层', label: '管理层' },
] as const

/** 导航项定义（默认名称） */
const NAV_ITEMS: { name: string; href: string; icon: string; key: string; isSystem?: boolean }[] = [
  // 业务导航（按工作顺序）
  { name: '今日工作台', href: '/dashboard/workbench', icon: '✅', key: 'workbench' },
  { name: '选品更新池', href: '/dashboard/opportunities', icon: '🎯', key: 'opportunities' },
  { name: '产品列表', href: '/dashboard/products', icon: '📦', key: 'products' },
  { name: '达人建联', href: '/dashboard/influencers', icon: '🤝', key: 'influencers' },
  { name: '脚本拆解', href: '/dashboard/scripts', icon: '✂️', key: 'scripts' },
  { name: '热门视频拆解', href: '/dashboard/viral-videos', icon: '🔥', key: 'viral-videos' },
  { name: '视频数据分析', href: '/dashboard/video-metrics', icon: '📹', key: 'video-metrics' },
  { name: '经营数据', href: '/dashboard/performance', icon: '📈', key: 'performance' },
  // 系统模块（放到更多菜单）
  { name: 'TikTok 同步', href: '/dashboard/tiktok-sync', icon: '🔄', key: 'tiktok-sync', isSystem: true },
  { name: '价格对账', href: '/dashboard/price-check', icon: '💰', key: 'price-check', isSystem: true },
  { name: '用户管理', href: '/dashboard/users', icon: '👥', key: 'users', isSystem: true },
  { name: '系统设置', href: '/dashboard/settings', icon: '⚙️', key: 'settings', isSystem: true },
  { name: '概览', href: '/dashboard/overview', icon: '📊', key: 'overview', isSystem: true },
]

// 导出更多菜单项（系统模块）
export const MORE_MENU_ITEMS = NAV_ITEMS.filter(item => item.isSystem)

/** viewer 角色下菜单显示名称 */
const VIEWER_NAV_NAMES: Record<string, string> = {
  overview: '概览',
  products: '产品概况',
  'price-check': '价格概况',
  performance: '经营数据',
  scripts: '脚本概况',
  influencers: '达人合作概况',
}

/** 各角色可见导航 key */
const ROLE_NAV_KEYS: Record<string, string[]> = {
  admin: [
    'workbench',
    'opportunities',
    'products',
    'influencers',
    'scripts',
    'viral-videos',
    'video-metrics',
    'performance',
    'tiktok-sync',
    'price-check',
    'users',
    'settings',
    'overview',
  ],
  lead: [
    'workbench',
    'opportunities',
    'products',
    'influencers',
    'scripts',
    'viral-videos',
    'video-metrics',
    'performance',
    'price-check',
  ],
  product_operator: ['workbench', 'opportunities', 'products', 'influencers', 'scripts', 'viral-videos', 'video-metrics', 'performance'],
  operator: ['workbench', 'opportunities', 'products', 'influencers', 'scripts', 'viral-videos', 'video-metrics', 'performance', 'tiktok-sync', 'price-check'],
  editor: ['workbench', 'scripts', 'viral-videos'],
  optimizer: ['workbench', 'products', 'scripts', 'viral-videos', 'video-metrics', 'performance'],
  viewer: ['workbench', 'products', 'scripts', 'viral-videos', 'video-metrics', 'performance', 'influencers', 'overview'],
  influencer_operator: ['workbench', 'influencers', 'products', 'scripts', 'viral-videos'],
}

export function getNavItemsForRole(role?: string): { name: string; href: string; icon: string }[] {
  const keys = role ? ROLE_NAV_KEYS[role] || [] : []
  const set = new Set(keys)
  let items = NAV_ITEMS.filter((item) => set.has(item.key)).map((item) => ({
    name: role === 'viewer' && VIEWER_NAV_NAMES[item.key] ? VIEWER_NAV_NAMES[item.key] : item.name,
    href: item.href,
    icon: item.icon,
  }))

  // 达人运营：优先展示达人建联
  if (role === 'influencer_operator') {
    items = items.sort((a, b) => {
      if (a.href === '/dashboard/influencers') return -1
      if (b.href === '/dashboard/influencers') return 1
      return 0
    })
  }

  // 总负责人：优先展示今日工作台
  if (role === 'lead') {
    items = items.sort((a, b) => {
      if (a.href === '/dashboard/workbench') return -1
      if (b.href === '/dashboard/workbench') return 1
      return 0
    })
  }

  return items
}

/** 登录后默认跳转 */
export function getDefaultRedirectForRole(role?: string): string {
  if (role && ROLE_DEFAULT_PAGES[role]) {
    return ROLE_DEFAULT_PAGES[role]
  }
  return '/dashboard'
}

// ---------- 页面访问权限 ----------

/** 是否可访问用户管理 */
export function canAccessUsers(role?: string): boolean {
  return role === 'admin'
}

/** 是否可访问系统设置 */
export function canAccessSettings(role?: string): boolean {
  return role === 'admin'
}

/** 是否是总负责人（业务推进负责人） */
export function isLead(role?: string): boolean {
  return role === 'lead'
}

/** 是否可访问产品列表（editor 不可见） */
export function canAccessProducts(role?: string): boolean {
  return (
    role === 'admin' ||
    role === 'lead' ||
    role === 'product_operator' ||
    role === 'operator' ||
    role === 'optimizer' ||
    role === 'viewer' ||
    role === 'influencer_operator'
  )
}

/** 是否可访问选品更新池（admin/lead/product_operator/operator） */
export function canAccessProductOpportunities(role?: string): boolean {
  return role === 'admin' || role === 'lead' || role === 'product_operator' || role === 'operator'
}

/** 是否可编辑产品（admin/lead/product_operator/operator） */
export function canEditProducts(role?: string): boolean {
  return role === 'admin' || role === 'lead' || role === 'product_operator' || role === 'operator'
}

/** 是否可访问 TikTok 同步（仅 admin/operator） */
export function canAccessTiktokSync(role?: string): boolean {
  return role === 'admin' || role === 'operator'
}

/** 是否可访问价格对账（editor 不可见） */
export function canAccessPriceCheck(role?: string): boolean {
  return role === 'admin' || role === 'lead' || role === 'operator' || role === 'optimizer' || role === 'viewer'
}

/** 是否可访问经营数据中心（editor 不可见，viewer 只读） */
export function canAccessPerformance(role?: string): boolean {
  return role === 'admin' || role === 'lead' || role === 'product_operator' || role === 'operator' || role === 'optimizer' || role === 'viewer'
}

/** 是否可访问脚本拆解（全部角色） */
export function canAccessScripts(role?: string): boolean {
  return !!role && ['admin', 'lead', 'product_operator', 'operator', 'editor', 'optimizer', 'viewer', 'influencer_operator'].includes(role)
}

/** 是否可访问达人建联（editor 不可见） */
export function canAccessInfluencers(role?: string): boolean {
  return (
    role === 'admin' ||
    role === 'lead' ||
    role === 'product_operator' ||
    role === 'operator' ||
    role === 'optimizer' ||
    role === 'viewer' ||
    role === 'influencer_operator'
  )
}

/** 是否可管理达人建联（新建、编辑、删除、跟进等） */
export function canManageInfluencers(role?: string): boolean {
  return role === 'admin' || role === 'lead' || role === 'product_operator' || role === 'operator' || role === 'influencer_operator'
}

// ---------- 脚本拆解页按钮权限 ----------

/** 是否可编辑脚本（新建、编辑、保存版本、归档、删除、创建任务） */
export function canEditScripts(role?: string): boolean {
  return role === 'admin' || role === 'lead' || role === 'product_operator' || role === 'operator'
}

/** 是否可删除脚本 */
export function canDeleteScripts(role?: string): boolean {
  return role === 'admin' || role === 'lead' || role === 'product_operator' || role === 'operator'
}

/** 剪辑师：仅可标记已学习、开始练习、提交练习成片、查看点评、加入复盘记录 */
export function isEditorOnly(role?: string): boolean {
  return role === 'editor'
}

/** 脚本页只读（optimizer/viewer/influencer_operator） */
export function isScriptsReadOnly(role?: string): boolean {
  return role === 'optimizer' || role === 'viewer' || role === 'influencer_operator'
}

// ---------- 通用 ----------

/** 是否只读角色 viewer */
export function isViewerOnly(role?: string): boolean {
  return role === 'viewer'
}

/** 是否可访问某路径（用于页面级保护/重定向） */
export function canAccessPath(pathname: string, role?: string): boolean {
  if (!role) return false
  if (pathname === '/dashboard/users') return canAccessUsers(role)
  if (pathname === '/dashboard/settings') return canAccessSettings(role)
  if (pathname === '/dashboard/tiktok-sync') return canAccessTiktokSync(role)
  if (pathname === '/dashboard/products') return canAccessProducts(role)
  if (pathname.startsWith('/dashboard/opportunities')) return canAccessProductOpportunities(role)
  if (pathname === '/dashboard/price-check') return canAccessPriceCheck(role)
  if (pathname === '/dashboard/performance') return canAccessPerformance(role)
  if (pathname === '/dashboard/scripts') return canAccessScripts(role)
  if (pathname === '/dashboard/influencers') return canAccessInfluencers(role)
  if (pathname === '/dashboard/overview') return role === 'viewer' || role === 'admin'
  if (pathname === '/dashboard' || pathname === '/dashboard/account') return true
  return true
}

/** 获取角色可访问的模块列表（用于展示） */
export function getRoleModules(role?: string): string[] {
  return role ? ROLE_MODULES[role] || [] : []
}
