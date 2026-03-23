import type { ReactNode } from 'react'

type EmptyStateProps = {
  icon?: string
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="text-5xl mb-4">{icon}</div>
      <div className="empty-state-title">{title}</div>
      {description && (
        <div className="empty-state-description">{description}</div>
      )}
      {action && (
        <div className="mt-2">{action}</div>
      )}
    </div>
  )
}

// 常用空状态预设
export const EmptyStatePresets = {
  // 任务相关
  noTasks: (action?: ReactNode) => (
    <EmptyState
      icon="📋"
      title="暂无任务"
      description="当前没有待处理的任务，完成相关操作后会自动生成"
      action={action}
    />
  ),
  
  // 数据相关
  noData: (action?: ReactNode) => (
    <EmptyState
      icon="📊"
      title="暂无数据"
      description="导入数据后将自动显示统计信息"
      action={action}
    />
  ),
  
  // 导入数据提示
  needImport: (title: string, action?: ReactNode) => (
    <EmptyState
      icon="📥"
      title={`请先${title}`}
      description="导入数据后即可查看相关统计和分析"
      action={action}
    />
  ),
  
  // 列表为空
  noItems: (itemName: string, action?: ReactNode) => (
    <EmptyState
      icon="📦"
      title={`暂无${itemName}`}
      description={`添加${itemName}后将显示在列表中`}
      action={action}
    />
  ),
  
  // 搜索无结果
  noSearchResults: (action?: ReactNode) => (
    <EmptyState
      icon="🔍"
      title="未找到匹配结果"
      description="尝试调整搜索条件或筛选参数"
      action={action}
    />
  ),
  
  // 脚本相关
  noScripts: (action?: ReactNode) => (
    <EmptyState
      icon="✂️"
      title="暂无脚本"
      description="创建脚本后可进行拆解和练习"
      action={action}
    />
  ),
  
  // 达人相关
  noInfluencers: (action?: ReactNode) => (
    <EmptyState
      icon="🤝"
      title="暂无达人"
      description="添加达人信息后开始建联合作"
      action={action}
    />
  ),
  
  // 产品相关
  noProducts: (action?: ReactNode) => (
    <EmptyState
      icon="📦"
      title="暂无产品"
      description="添加产品后可进行运营跟进"
      action={action}
    />
  ),
  
  // 选品机会
  noOpportunities: (action?: ReactNode) => (
    <EmptyState
      icon="🎯"
      title="暂无选品机会"
      description="从 TikTok 同步或手动添加选品机会"
      action={action}
    />
  ),
  
  // 经营数据
  noPerformanceData: (action?: ReactNode) => (
    <EmptyState
      icon="📈"
      title="暂无经营数据"
      description="请先导入订单和广告数据"
      action={action}
    />
  ),
}
