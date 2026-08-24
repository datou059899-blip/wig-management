import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { prisma } from '@/lib/prisma'

function isValidNonNegativeInteger(value: number) {
  return Number.isInteger(value) && value >= 0
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const permissionContext = getSessionPermissionContext(session)
    if (!canManagePage(permissionContext, 'productSales')) {
      return NextResponse.json({ error: '无权限操作销售库存' }, { status: 403 })
    }
    if (permissionContext?.role !== 'admin') {
      return NextResponse.json(
        { error: '手动修改库存为 legacy 特殊入口，仅管理员可用；正式库存请使用库存与订货中心。' },
        { status: 409 },
      )
    }

    const body = await request.json()
    const sku = String(body?.sku || '').trim()
    const mode = String(body?.mode || '').trim() as 'set' | 'increase' | 'decrease'
    const stockValue = Number(body?.stock)
    const quantityValue = Number(body?.quantity)

    if (!sku) {
      return NextResponse.json({ error: 'SKU 不能为空' }, { status: 400 })
    }

    if (mode !== 'set' && mode !== 'increase' && mode !== 'decrease') {
      return NextResponse.json({ error: '不支持的库存修改方式' }, { status: 400 })
    }

    const product = await prisma.product.findFirst({
      where: { sku },
      select: {
        id: true,
        sku: true,
        stock: true,
      },
    })

    if (!product?.sku) {
      return NextResponse.json({ error: '未找到对应的产品 SKU' }, { status: 404 })
    }

    let nextStock = product.stock || 0

    if (mode === 'set') {
      if (!isValidNonNegativeInteger(stockValue)) {
        return NextResponse.json({ error: '库存必须是大于等于 0 的整数' }, { status: 400 })
      }
      nextStock = stockValue
    } else {
      if (!isValidNonNegativeInteger(quantityValue)) {
        return NextResponse.json({ error: '调整数量必须是大于等于 0 的整数' }, { status: 400 })
      }

      if (mode === 'increase') {
        nextStock = (product.stock || 0) + quantityValue
      } else {
        nextStock = (product.stock || 0) - quantityValue
        if (nextStock < 0) {
          return NextResponse.json({ error: '库存不能小于 0' }, { status: 400 })
        }
      }
    }

    const snapshotDate = new Date()
    snapshotDate.setHours(0, 0, 0, 0)

    await prisma.$transaction([
      prisma.product.update({
        where: { id: product.id },
        data: {
          stock: nextStock,
        },
      }),
      prisma.productInventorySnapshot.upsert({
        where: {
          sku_date: {
            sku: product.sku,
            date: snapshotDate,
          },
        },
        create: {
          sku: product.sku,
          date: snapshotDate,
          totalQty: nextStock,
        },
        update: {
          totalQty: nextStock,
        },
      }),
    ])

    return NextResponse.json({ success: true, stock: nextStock })
  } catch (error) {
    console.error('手动修改库存失败:', error)
    return NextResponse.json({ error: '手动修改库存失败' }, { status: 500 })
  }
}
