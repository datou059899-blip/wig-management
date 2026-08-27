import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canAccessPage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { getProductBusinessItems } from '@/lib/inventoryPurchasingBusiness'

export async function GET() {
  const session = await getServerSession(authOptions)
  const permissionContext = getSessionPermissionContext(session)
  if (!canAccessPage(permissionContext, 'inventoryPurchasing')) {
    return NextResponse.json({ error: '未授权访问' }, { status: 403 })
  }

  const items = await getProductBusinessItems()
  const summary = items.reduce(
    (acc, item) => {
      acc.currentInventory += item.currentInventory
      acc.sales7d += item.sales7d
      acc.sales30d += item.sales30d
      if (item.inventoryCostRmb !== null) acc.inventoryCostRmb += item.inventoryCostRmb
      if (item.retailInventoryValueUsd !== null) acc.retailInventoryValueUsd += item.retailInventoryValueUsd
      if (item.costCny > 0) acc.costMaintainedCount += 1
      if (item.currentSellingPriceUsd !== null) acc.priceMaintainedCount += 1
      return acc
    },
    {
      productCount: items.length,
      currentInventory: 0,
      sales7d: 0,
      sales30d: 0,
      inventoryCostRmb: 0,
      retailInventoryValueUsd: 0,
      costMaintainedCount: 0,
      priceMaintainedCount: 0,
    },
  )

  return NextResponse.json({ summary, items })
}
