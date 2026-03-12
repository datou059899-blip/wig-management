import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 获取 TikTok 同步数据
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const syncs = await prisma.tiktokSync.findMany({
      orderBy: { syncedAt: 'desc' },
      include: {
        product: true,
      },
    })

    return NextResponse.json({ syncs })
  } catch (error) {
    console.error('获取 TikTok 同步数据失败:', error)
    return NextResponse.json({ error: '获取数据失败' }, { status: 500 })
  }
}

// 批量创建/更新 TikTok 同步数据
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userRole = (session.user as any).role
    if (userRole !== 'admin' && userRole !== 'operator') {
      return NextResponse.json({ error: '无权限' }, { status: 403 })
    }

    const data = await request.json()
    const items = data.items || []

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '无效的数据格式' }, { status: 400 })
    }

    // 由于 TiktokSync.sku 关联 Product.sku（外键），需要确保 Product 先存在
    // 用事务批量执行：先 upsert Product（最小信息），再 upsert TiktokSync
    const ops = items.flatMap((item: any) => {
      const sku = String(item.sku || '').trim()
      if (!sku) return []

      const priceUsd = typeof item.priceUsd === 'number' ? item.priceUsd : Number(item.priceUsd) || 0
      const stock = typeof item.stock === 'number' ? item.stock : Number(item.stock) || 0
      const title = item.title ? String(item.title) : ''

      return [
        prisma.product.upsert({
          where: { sku },
          create: {
            sku,
            name: title || sku,
            priceUsd,
            stock,
            tiktokPriceUsd: priceUsd,
          },
          update: {
            // 不覆盖运营侧已维护的核心字段（如 name/description 等），只同步库存/价格
            stock,
            tiktokPriceUsd: priceUsd,
          },
        }),
        prisma.tiktokSync.upsert({
          where: { sku },
          create: {
            sku,
            skuId: item.skuId,
            title: item.title,
            priceUsd,
            originalPriceUsd: item.originalPriceUsd,
            stock,
            status: item.status,
          },
          update: {
            skuId: item.skuId,
            title: item.title,
            priceUsd,
            originalPriceUsd: item.originalPriceUsd,
            stock,
            status: item.status,
            syncedAt: new Date(),
          },
        }),
      ]
    })

    const results = await prisma.$transaction(ops)
    const syncedCount = Math.floor(results.length / 2)

    return NextResponse.json({
      success: true,
      count: syncedCount,
    })
  } catch (error) {
    console.error('同步 TikTok 数据失败:', error)
    return NextResponse.json({ error: '同步失败' }, { status: 500 })
  }
}

// 清空 TikTok 同步数据
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userRole = (session.user as any).role
    if (userRole !== 'admin' && userRole !== 'operator') {
      return NextResponse.json({ error: '无权限' }, { status: 403 })
    }

    await prisma.tiktokSync.deleteMany()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('清空 TikTok 同步数据失败:', error)
    return NextResponse.json({ error: '清空失败' }, { status: 500 })
  }
}
