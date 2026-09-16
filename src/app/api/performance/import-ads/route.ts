import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({
    error: 'Performance Ads 导入暂未启用，等待真实文件语义审计',
    code: 'PERFORMANCE_ADS_IMPORT_DEFERRED',
    canonicalPath: '/dashboard/performance',
  }, { status: 410 })
}
