import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canAccessPage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { getInventorySummaryItems } from '@/lib/inventoryPurchasing'

export async function GET() {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canAccessPage(permissionContext, 'inventoryPurchasing')) {
    return NextResponse.json({ error: '未授权访问' }, { status: 401 })
  }

  const items = await getInventorySummaryItems()
  const currentTotalStock = items.reduce((sum, item) => sum + (item.currentTotalStock ?? 0), 0)
  const changedSkuCount = items.filter((item) => item.changeQty !== null && item.changeQty !== 0).length

  return NextResponse.json({
    summary: {
      skuCount: items.length,
      currentTotalStock,
      changedSkuCount,
      snapshotBackedSkuCount: items.filter((item) => item.source === 'snapshot').length,
    },
    items,
  })
}
