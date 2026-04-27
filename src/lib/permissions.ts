/**
 * 基于角色的权限配置
 * 业务角色：管理 | 老板 | 产品 | 运营 | BD | 剪辑 | 浏览
 */

export const ROLES = ['admin', 'boss', 'product', 'operator', 'bd', 'editor', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<string, string> = {
  admin: '管理',
  boss: '老板',
  product: '产品',
  operator: '运营',
  bd: 'BD',
  editor: '剪辑',
  viewer: '浏览',
}

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: '可访问全部模块，管理用户与系统设置',
  boss: '查看全部业务数据，审批决策',
  product: '管理选品、产品、达人建联、脚本拆解',
  operator: '产品运营、TikTok同步、价格对账、脚本拆解',
  bd: '达人建联、商务合作、跟进洽谈',
  editor: '脚本拆解、内容创作、视频制作',
  viewer: '只读查看业务数据',
}

/** 各角色的默认首页 */
export const ROLE_DEFAULT_PAGES: Record<string, string> = {
  admin: '/dashboard',
  boss: '/dashboard/overview',
  product: '/dashboard/opportunities',
  operator: '/dashboard/workbench',
  bd: '/dashboard/influencers',
  editor: '/dashboard/scripts',
  viewer: '/dashboard/overview',
}

/** 各角色可访问的模块（用于展示） */
export const ROLE_MODULES: Record<string, string[]> = {
  admin: ['今日工作台', '选品更新池', '产品列表', '达人建联', '脚本拆解', '经营数据', 'TikTok 同步', '价格对账', '用户管理', '系统设置', '概览'],
  boss: ['概览', '经营数据', '产品列表', '达人建联', '脚本拆解'],
  product: ['今日工作台', '选品更新池', '产品列表', '达人建联', '脚本拆解', '经营数据'],
  operator: ['今日工作台', '选品更新池', '产品列表', '达人建联', '脚本拆解', '经营数据', 'TikTok 同步', '价格对账'],
  bd: ['今日工作台', '达人建联', '产品列表', '脚本拆解'],
  editor: ['今日工作台', '脚本拆解'],
  viewer: ['概览', '产品列表', '脚本拆解', '经营数据', '达人建联'],
}

/** 部门选项 */
export const DEPARTMENTS = [
  { value: '', label: '未设置' },
  { value: '产品部', label: '产品部' },
  { value: '运营部', label: '运营部' },
  { value: 'BD部', label: 'BD部' },
  { value: '剪辑部', label: '剪辑部' },
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
  boss: ['overview', 'performance', 'products', 'influencers', 'scripts', 'viral-videos'],
  product: ['workbench', 'opportunities', 'products', 'influencers', 'scripts', 'viral-videos', 'video-metrics', 'performance'],
  operator: ['workbench', 'opportunities', 'products', 'influencers', 'scripts', 'viral-videos', 'video-metrics', 'performance', 'tiktok-sync', 'price-check'],
  bd: ['workbench', 'influencers', 'products', 'scripts', 'viral-videos'],
  editor: ['workbench', 'scripts', 'viral-videos'],
  viewer: ['overview', 'products', 'scripts', 'viral-videos', 'video-metrics', 'performance', 'influencers'],
}

export function getNavItemsForRole(role?: string): { name: string; href: string; icon: string }[] {
  // 旧角色映射到新角色
  const mappedRole = mapOldRole(role)
  const keys = mappedRole ? ROLE_NAV_KEYS[mappedRole] || [] : []
  const set = new Set(keys)
  let items = NAV_ITEMS.filter((item) => set.has(item.key)).map((item) => ({
    name: mappedRole === 'viewer' && VIEWER_NAV_NAMES[item.key] ? VIEWER_NAV_NAMES[item.key] : item.name,
    href: item.href,
    icon: item.icon,
  }))

  // BD：优先展示达人建联
  if (mappedRole === 'bd') {
    items = items.sort((a, b) => {
      if (a.href === '/dashboard/influencers') return -1
      if (b.href === '/dashboard/influencers') return 1
      return 0
    })
  }

  return items
}

/** 旧角色映射到新角色 */
export function mapOldRole(role?: string): string | undefined {
  if (!role) return undefined
  // 新角色直接返回
  if (ROLES.includes(role as any)) return role
  // 旧角色映射
  const mapping: Record<string, string> = {
    lead: 'boss',
    product_operator: 'product',
    optimizer: 'operator',
    influencer_operator: 'bd',
  }
  return mapping[role] || role
}

/** 登录后默认跳转 */
export function getDefaultRedirectForRole(role?: string): string {
  const mappedRole = mapOldRole(role)
  if (mappedRole && ROLE_DEFAULT_PAGES[mappedRole]) {
    return ROLE_DEFAULT_PAGES[mappedRole]
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

/** 是否是老板/管理（业务决策人） */
export function isLead(role?: string): boolean {
  return role === 'admin' || role === 'boss'
}

/** 是否可访问产品列表 */
export function canAccessProducts(role?: string): boolean {
  const mapped = mapOldRole(role)
  return ['admin', 'boss', 'product', 'operator', 'bd', 'editor', 'viewer'].includes(mapped || '')
}

/** 是否可访问选品更新池 */
export function canAccessProductOpportunities(role?: string): boolean {
  const mapped = mapOldRole(role)
  return ['admin', 'boss', 'product', 'operator'].includes(mapped || '')
}

/** 是否可编辑产品 */
export function canEditProducts(role?: string): boolean {
  return !!role
}

/** 是否可访问 TikTok 同步 */
export function canAccessTiktokSync(role?: string): boolean {
  const mapped = mapOldRole(role)
  return ['admin', 'operator'].includes(mapped || '')
}

/** 是否可访问价格对账 */
export function canAccessPriceCheck(role?: string): boolean {
  const mapped = mapOldRole(role)
  return ['admin', 'boss', 'product', 'operator', 'viewer'].includes(mapped || '')
}

/** 是否可访问经营数据中心 */
export function canAccessPerformance(role?: string): boolean {
  const mapped = mapOldRole(role)
  return ['admin', 'boss', 'product', 'operator', 'viewer'].includes(mapped || '')
}

/** 是否可访问脚本拆解 */
export function canAccessScripts(role?: string): boolean {
  const mapped = mapOldRole(role)
  return ['admin', 'boss', 'product', 'operator', 'bd', 'editor', 'viewer'].includes(mapped || '')
}

/** 是否可访问达人建联 */
export function canAccessInfluencers(role?: string): boolean {
  const mapped = mapOldRole(role)
  return ['admin', 'boss', 'product', 'operator', 'bd', 'viewer'].includes(mapped || '')
}

/** 是否可管理达人建联 */
export function canManageInfluencers(role?: string): boolean {
  const mapped = mapOldRole(role)
  return ['admin', 'product', 'operator', 'bd'].includes(mapped || '')
}

// ---------- 脚本拆解页按钮权限 ----------

/** 是否可编辑脚本 */
export function canEditScripts(role?: string): boolean {
  const mapped = mapOldRole(role)
  return ['admin', 'boss', 'product', 'operator'].includes(mapped || '')
}

/** 是否可删除脚本 */
export function canDeleteScripts(role?: string): boolean {
  const mapped = mapOldRole(role)
  return ['admin', 'boss', 'product', 'operator'].includes(mapped || '')
}

/** 剪辑师：仅可标记已学习、开始练习 */
export function isEditorOnly(role?: string): boolean {
  const mapped = mapOldRole(role)
  return mapped === 'editor'
}

/** 脚本页只读 */
export function isScriptsReadOnly(role?: string): boolean {
  const mapped = mapOldRole(role)
  return mapped === 'viewer' || mapped === 'bd'
}

// ---------- 通用 ----------

/** 是否只读角色 viewer */
export function isViewerOnly(role?: string): boolean {
  const mapped = mapOldRole(role)
  return mapped === 'viewer'
}

/** 是否可访问某路径 */
export function canAccessPath(pathname: string, role?: string): boolean {
  if (!role) return false
  const mapped = mapOldRole(role) || role
  if (pathname === '/dashboard/users') return canAccessUsers(mapped)
  if (pathname === '/dashboard/settings') return canAccessSettings(mapped)
  if (pathname === '/dashboard/tiktok-sync') return canAccessTiktokSync(mapped)
  if (pathname === '/dashboard/products') return canAccessProducts(mapped)
  if (pathname.startsWith('/dashboard/opportunities')) return canAccessProductOpportunities(mapped)
  if (pathname === '/dashboard/price-check') return canAccessPriceCheck(mapped)
  if (pathname === '/dashboard/performance') return canAccessPerformance(mapped)
  if (pathname === '/dashboard/scripts') return canAccessScripts(mapped)
  if (pathname === '/dashboard/influencers') return canAccessInfluencers(mapped)
  if (pathname === '/dashboard/overview') return ['viewer', 'admin', 'boss'].includes(mapped)
  if (pathname === '/dashboard' || pathname === '/dashboard/account') return true
  return true
}

/** 获取角色可访问的模块列表 */
export function getRoleModules(role?: string): string[] {
  const mapped = mapOldRole(role)
  return mapped ? ROLE_MODULES[mapped] || [] : []
}
