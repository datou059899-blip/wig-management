import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({
    error: 'Performance 独立订单导入已停用，请使用销售分析订单导入',
    code: 'PERFORMANCE_ORDER_IMPORT_RETIRED',
    canonicalPath: '/dashboard/product-sales',
  }, { status: 410 })
}
