import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
  breadcrumbs?: ReactNode
}

export function PageHeader({ title, description, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {/* 面包屑导航（可选） */}
      {breadcrumbs && (
        <div className="mb-3">
          {breadcrumbs}
        </div>
      )}
      
      {/* 标题区 */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1.5 text-sm text-gray-500 max-w-2xl">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 mt-3 md:mt-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
