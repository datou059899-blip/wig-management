type PagePermissionDefinition = {
  id: string
  name: string
  path: string
  icon: string
  category: string
  adminDefault: boolean
  sidebarVisible: boolean
}

// 页面权限配置
export const PAGE_PERMISSIONS = {
  // 核心工作台
  workbench: {
    id: 'workbench',
    name: '今日工作台',
    path: '/dashboard/workbench',
    icon: 'LayoutDashboard',
    category: '工作台',
    adminDefault: true,
    sidebarVisible: true,
  },
  overview: {
    id: 'overview',
    name: '概览',
    path: '/dashboard/overview',
    icon: 'BarChart3',
    category: '数据',
    adminDefault: true,
    sidebarVisible: true,
  },
  
  // 产品相关
  products: {
    id: 'products',
    name: '产品库',
    path: '/dashboard/products',
    icon: 'Package',
    category: '产品',
    adminDefault: true,
    sidebarVisible: true,
  },
  productOpportunities: {
    id: 'productOpportunities',
    name: '选品更新池',
    path: '/dashboard/products/opportunities',
    icon: 'Lightbulb',
    category: '产品',
    adminDefault: true,
    sidebarVisible: true,
  },
  productSales: {
    id: 'productSales',
    name: '销售库存',
    path: '/dashboard/product-sales',
    icon: 'Package',
    category: '产品',
    adminDefault: true,
    sidebarVisible: true,
  },
  materials: {
    id: 'materials',
    name: '耗材管理',
    path: '/dashboard/materials',
    icon: 'Boxes',
    category: '产品',
    adminDefault: true,
    sidebarVisible: true,
  },
  
  // 达人相关
  influencers: {
    id: 'influencers',
    name: '达人建联',
    path: '/dashboard/influencers',
    icon: 'Users',
    category: '达人',
    adminDefault: true,
    sidebarVisible: true,
  },
  
  // 脚本相关
  scripts: {
    id: 'scripts',
    name: '脚本拆解',
    path: '/dashboard/scripts',
    icon: 'FileText',
    category: '内容',
    adminDefault: true,
    sidebarVisible: true,
  },
  
  // 视频相关
  viralVideos: {
    id: 'viralVideos',
    name: '热门视频拆解',
    path: '/dashboard/viral-videos',
    icon: 'Video',
    category: '内容',
    adminDefault: true,
    sidebarVisible: true,
  },
  videoMetrics: {
    id: 'videoMetrics',
    name: '视频数据分析',
    path: '/dashboard/video-metrics',
    icon: 'LineChart',
    category: '数据',
    adminDefault: true,
    sidebarVisible: true,
  },
  
  // 数据相关
  performance: {
    id: 'performance',
    name: '经营数据',
    path: '/dashboard/performance',
    icon: 'TrendingUp',
    category: '数据',
    adminDefault: true,
    sidebarVisible: true,
  },
  
  // 同步相关
  tiktokSync: {
    id: 'tiktokSync',
    name: 'TikTok 同步',
    path: '/dashboard/tiktok-sync',
    icon: 'RefreshCw',
    category: '工具',
    adminDefault: true,
    sidebarVisible: true,
  },
  priceCheck: {
    id: 'priceCheck',
    name: '价格对账',
    path: '/dashboard/price-check',
    icon: 'DollarSign',
    category: '工具',
    adminDefault: true,
    sidebarVisible: true,
  },
  
  // 系统管理
  users: {
    id: 'users',
    name: '用户管理',
    path: '/dashboard/users',
    icon: 'UserCog',
    category: '系统',
    adminDefault: true,
    sidebarVisible: true,
  },
  settings: {
    id: 'settings',
    name: '系统设置',
    path: '/dashboard/settings',
    icon: 'Settings',
    category: '系统',
    adminDefault: true,
    sidebarVisible: true,
  },
} as const satisfies Record<string, PagePermissionDefinition>;

export type PagePermissionKey = keyof typeof PAGE_PERMISSIONS;
export type PagePermissionItem = (typeof PAGE_PERMISSIONS)[PagePermissionKey];
export type SessionPermissionContext = {
  role: string
  permissionMode: string
  allowedPages: string
}

export const PAGE_PERMISSION_OPTIONS = Object.values(PAGE_PERMISSIONS);

export const PAGE_PERMISSION_GROUPS = PAGE_PERMISSION_OPTIONS.reduce<Record<string, PagePermissionItem[]>>(
  (groups, page) => {
    if (!groups[page.category]) {
      groups[page.category] = [];
    }
    groups[page.category].push(page);
    return groups;
  },
  {}
);

export const PATH_TO_PAGE_ID: Record<string, PagePermissionKey> = {
  ...Object.fromEntries(
    PAGE_PERMISSION_OPTIONS.map((page) => [page.path, page.id as PagePermissionKey])
  ),
  '/dashboard/account': 'workbench',
};

// 角色默认权限映射
export const ROLE_DEFAULT_PAGES: Record<string, PagePermissionKey[]> = {
  admin: PAGE_PERMISSION_OPTIONS
    .filter((page) => page.adminDefault)
    .map((page) => page.id as PagePermissionKey),
  boss: ['overview', 'performance', 'productSales', 'materials', 'products', 'influencers', 'scripts', 'viralVideos', 'videoMetrics'],
  product: ['workbench', 'products', 'productOpportunities', 'productSales', 'materials', 'influencers', 'scripts', 'viralVideos', 'videoMetrics', 'performance'],
  operator: ['workbench', 'products', 'productOpportunities', 'productSales', 'materials', 'influencers', 'scripts', 'viralVideos', 'videoMetrics', 'performance', 'tiktokSync', 'priceCheck'],
  bd: ['workbench', 'influencers', 'products', 'scripts', 'viralVideos'],
  editor: ['workbench', 'scripts', 'viralVideos'],
  viewer: ['overview', 'products', 'productSales', 'materials', 'performance', 'scripts', 'viralVideos', 'videoMetrics', 'influencers'],
};

// 旧角色映射到新角色
export function mapOldRole(role?: string): string | undefined {
  if (!role) return undefined
  // 新角色直接返回
  if (ROLE_DEFAULT_PAGES[role]) return role
  // 旧角色映射
  const mapping: Record<string, string> = {
    lead: 'boss',
    product_operator: 'product',
    optimizer: 'operator',
    influencer_operator: 'bd',
  }
  return mapping[role] || role
}

// 获取用户有权限访问的页面列表
export function getUserAllowedPages(
  userRole: string,
  permissionMode: string,
  allowedPages: string
): PagePermissionKey[] {
  // 如果是自定义权限模式
  if (permissionMode === 'custom' && allowedPages) {
    return allowedPages.split(',').filter(Boolean) as PagePermissionKey[];
  }
  
  // 否则使用角色默认权限
  return ROLE_DEFAULT_PAGES[userRole] || ROLE_DEFAULT_PAGES.viewer;
}

// 检查用户是否有权限访问某个页面
export function hasPagePermission(
  userRole: string,
  permissionMode: string,
  allowedPages: string,
  pageId: PagePermissionKey
): boolean {
  const allowed = getUserAllowedPages(userRole, permissionMode, allowedPages);
  return allowed.includes(pageId);
}

export function getSessionPermissionContext(
  session: { user?: Record<string, unknown> | null } | null | undefined
): SessionPermissionContext | null {
  const user = session?.user as Record<string, unknown> | null | undefined
  if (!user) return null

  const rawRole = typeof user.role === 'string' ? user.role : ''
  const role = mapOldRole(rawRole) || rawRole
  const permissionMode = typeof user.permissionMode === 'string' && user.permissionMode
    ? user.permissionMode
    : 'role'
  const allowedPages = typeof user.allowedPages === 'string' ? user.allowedPages : ''

  if (!role) return null

  return {
    role,
    permissionMode,
    allowedPages,
  }
}

export function canAccessPage(
  ctx: SessionPermissionContext | null | undefined,
  pageId: PagePermissionKey
): boolean {
  if (!ctx?.role) return false
  if (ctx.role === 'admin') return true

  return hasPagePermission(ctx.role, ctx.permissionMode || 'role', ctx.allowedPages || '', pageId)
}

export function canManagePage(
  ctx: SessionPermissionContext | null | undefined,
  pageId: PagePermissionKey
): boolean {
  return canAccessPage(ctx, pageId)
}

// 获取有权限的菜单项
export function getAllowedMenuItems(
  userRole: string,
  permissionMode: string,
  allowedPages: string
) {
  const allowed = getUserAllowedPages(userRole, permissionMode, allowedPages);
  
  return allowed
    .map(pageId => PAGE_PERMISSIONS[pageId])
    .filter((page): page is PagePermissionItem => Boolean(page && page.sidebarVisible));
}

// 按分类分组菜单
export function getGroupedMenuItems(
  userRole: string,
  permissionMode: string,
  allowedPages: string
) {
  const items = getAllowedMenuItems(userRole, permissionMode, allowedPages);
  
  const grouped: Record<string, typeof items> = {};
  items.forEach(item => {
    if (!grouped[item.category]) {
      grouped[item.category] = [];
    }
    grouped[item.category].push(item);
  });
  
  return grouped;
}

// 验证默认首页是否有效
export function validateDefaultHomePage(
  defaultHomePage: string,
  userRole: string,
  permissionMode: string,
  allowedPages: string
): string {
  const allowed = getUserAllowedPages(userRole, permissionMode, allowedPages);
  
  // 找到匹配的页面
  const matchedPage = Object.values(PAGE_PERMISSIONS).find(
    page => page.path === defaultHomePage
  );
  
  // 如果默认首页有权限，返回原值
  if (matchedPage && allowed.includes(matchedPage.id as PagePermissionKey)) {
    return defaultHomePage;
  }
  
  // 否则返回第一个有权限的页面
  if (allowed.length > 0) {
    return PAGE_PERMISSIONS[allowed[0]].path;
  }
  
  // 保底返回工作台
  return '/dashboard/workbench';
}

export function findPageIdByPath(pathname: string): PagePermissionKey | undefined {
  let pageId = PATH_TO_PAGE_ID[pathname];

  if (!pageId) {
    for (const [path, id] of Object.entries(PATH_TO_PAGE_ID)) {
      if (pathname.startsWith(path)) {
        pageId = id;
        break;
      }
    }
  }

  return pageId as PagePermissionKey | undefined;
}
