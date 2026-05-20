import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const user = session.user as any
    const userRole = user?.role as string | undefined
    if (!userRole || (userRole !== 'admin' && userRole !== 'operator' && userRole !== 'optimizer')) {
      return NextResponse.json({ error: '无权限修改库存' }, { status: 403 })
    }

    const body = await request.json()
    const sku = String(body?.sku || '').trim()
    const stockValue = Number(body?.stock)

    if (!sku) {
      return NextResponse.json({ error: 'SKU 不能为空' }, { status: 400 })
    }

    if (!Number.isInteger(stockValue) || stockValue < 0) {
      return NextResponse.json({ error: '库存必须是大于等于 0 的整数' }, { status: 400 })
    }

    const product = await prisma.product.findFirst({
      where: { sku },
      select: {
        id: true,
        sku: true,
      },
    })

    if (!product?.sku) {
      return NextResponse.json({ error: '未找到对应的产品 SKU' }, { status: 404 })
    }

    const snapshotDate = new Date()
    snapshotDate.setHours(0, 0, 0, 0)

    await prisma.$transaction([
      prisma.product.update({
        where: { id: product.id },
        data: {
          stock: stockValue,
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
          totalQty: stockValue,
        },
        update: {
          totalQty: stockValue,
        },
      }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('手动修改库存失败:', error)
    return NextResponse.json({ error: '手动修改库存失败' }, { status: 500 })
  }
}
