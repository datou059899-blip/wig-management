import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value.trim() : String(value).trim()
}

function fillIfEmpty(currentValue: string | null | undefined, nextValue: unknown) {
  const normalizedNextValue = normalizeCell(nextValue)
  if (!normalizedNextValue || normalizeCell(currentValue)) {
    return undefined
  }
  return normalizedNextValue
}

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

    const uniqueSkus = Array.from(new Set(items.map((item: any) => normalizeCell(item.sku)).filter(Boolean)))
    const existingProducts = uniqueSkus.length > 0
      ? await prisma.product.findMany({
          where: { sku: { in: uniqueSkus } },
          select: {
            id: true,
            sku: true,
            name: true,
            image: true,
            color: true,
            length: true,
            style: true,
          },
        })
      : []
    const existingProductBySku = new Map(existingProducts.map((product) => [product.sku, product]))

    // 由于 TiktokSync.sku 关联 Product.sku（外键），需要确保 Product 先存在
    // 同 SKU 已存在时，只补空字段，不覆盖正式库已维护的 name/image/color/length/style
    const ops = items.flatMap((item: any) => {
      const sku = normalizeCell(item.sku)
      if (!sku) return []

      const priceUsd = typeof item.priceUsd === 'number' ? item.priceUsd : Number(item.priceUsd) || 0
      const stock = typeof item.stock === 'number' ? item.stock : Number(item.stock) || 0
      const title = normalizeCell(item.title)
      const existingProduct = existingProductBySku.get(sku)

      const productOperation = existingProduct
        ? prisma.product.update({
            where: { id: existingProduct.id },
            data: {
              stock,
              tiktokPriceUsd: priceUsd,
              ...(fillIfEmpty(existingProduct.name, title) ? { name: fillIfEmpty(existingProduct.name, title) } : {}),
              ...(fillIfEmpty(existingProduct.image, item.image || item.imageUrl || item.mainImage) ? { image: fillIfEmpty(existingProduct.image, item.image || item.imageUrl || item.mainImage) } : {}),
              ...(fillIfEmpty(existingProduct.color, item.color) ? { color: fillIfEmpty(existingProduct.color, item.color) } : {}),
              ...(fillIfEmpty(existingProduct.length, item.length) ? { length: fillIfEmpty(existingProduct.length, item.length) } : {}),
              ...(fillIfEmpty(existingProduct.style, item.style) ? { style: fillIfEmpty(existingProduct.style, item.style) } : {}),
            },
          })
        : prisma.product.create({
            data: {
              sku,
              name: title || sku,
              image: normalizeCell(item.image || item.imageUrl || item.mainImage) || null,
              color: normalizeCell(item.color) || null,
              length: normalizeCell(item.length) || null,
              style: normalizeCell(item.style) || null,
              priceUsd,
              stock,
              tiktokPriceUsd: priceUsd,
            },
          })

      return [
        productOperation,
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
