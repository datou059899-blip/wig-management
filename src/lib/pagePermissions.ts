// 页面权限配置
export const PAGE_PERMISSIONS = {
  // 核心工作台
  workbench: {
    id: 'workbench',
    name: '今日工作台',
    path: '/dashboard/workbench',
    icon: 'LayoutDashboard',
    category: '工作台',
  },
  overview: {
    id: 'overview',
    name: '概览',
    path: '/dashboard/overview',
    icon: 'BarChart3',
    category: '数据',
  },
  
  // 产品相关
  products: {
    id: 'products',
    name: '产品列表',
    path: '/dashboard/products',
    icon: 'Package',
    category: '产品',
  },
  productOpportunities: {
    id: 'productOpportunities',
    name: '选品更新池',
    path: '/dashboard/products/opportunities',
    icon: 'Lightbulb',
    category: '产品',
  },
  
  // 达人相关
  influencers: {
    id: 'influencers',
    name: '达人建联',
    path: '/dashboard/influencers',
    icon: 'Users',
    category: '达人',
  },
  
  // 脚本相关
  scripts: {
    id: 'scripts',
    name: '脚本拆解',
    path: '/dashboard/scripts',
    icon: 'FileText',
    category: '内容',
  },
  
  // 视频相关
  viralVideos: {
    id: 'viralVideos',
    name: '热门视频拆解',
    path: '/dashboard/viral-videos',
    icon: 'Video',
    category: '内容',
  },
  videoMetrics: {
    id: 'videoMetrics',
    name: '视频数据分析',
    path: '/dashboard/video-metrics',
    icon: 'LineChart',
    category: '数据',
  },
  
  // 数据相关
  performance: {
    id: 'performance',
    name: '经营数据',
    path: '/dashboard/performance',
    icon: 'TrendingUp',
    category: '数据',
  },
  
  // 同步相关
  tiktokSync: {
    id: 'tiktokSync',
    name: 'TikTok 同步',
    path: '/dashboard/tiktok-sync',
    icon: 'RefreshCw',
    category: '工具',
  },
  priceCheck: {
    id: 'priceCheck',
    name: '价格对账',
    path: '/dashboard/price-check',
    icon: 'DollarSign',
    category: '工具',
  },
  
  // 系统管理
  users: {
    id: 'users',
    name: '用户管理',
    path: '/dashboard/users',
    icon: 'UserCog',
    category: '系统',
  },
  settings: {
    id: 'settings',
    name: '系统设置',
    path: '/dashboard/settings',
    icon: 'Settings',
    category: '系统',
  },
} as const;

export type PagePermissionKey = keyof typeof PAGE_PERMISSIONS;

// 角色默认权限映射
export const ROLE_DEFAULT_PAGES: Record<string, PagePermissionKey[]> = {
  admin: Object.keys(PAGE_PERMISSIONS) as PagePermissionKey[],
  operator: [
    'workbench',
    'products',
    'productOpportunities',
    'influencers',
    'scripts',
    'viralVideos',
    'videoMetrics',
    'performance',
    'tiktokSync',
    'priceCheck',
  ],
  viewer: [
    'workbench',
    'products',
    'performance',
    'overview',
  ],
};

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

// 获取有权限的菜单项
export function getAllowedMenuItems(
  userRole: string,
  permissionMode: string,
  allowedPages: string
) {
  const allowed = getUserAllowedPages(userRole, permissionMode, allowedPages);
  
  return allowed
    .map(pageId => PAGE_PERMISSIONS[pageId])
    .filter(Boolean);
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
