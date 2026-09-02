import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createProduct, ProductSkuConflictError } from '@/lib/products'
import { canCreateProductDirectly } from '@/lib/permissions'

// 获取产品列表（带毛利和预警信息）
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '100')
    const search = searchParams.get('search') || ''
    const sortBy = searchParams.get('sortBy') || 'updatedAt'
    const sortOrder = searchParams.get('sortOrder') || 'desc'
    const warningFilter = searchParams.get('warning') // stock, profit, missing

    // 获取配置
    const config = await prisma.config.findMany()
    const configMap = Object.fromEntries(config.map(c => [c.key, c.value]))
    const exchangeRate = parseFloat(configMap.exchange_rate || '7.2')
    const stockWarningThreshold = parseInt(configMap.stock_warning_threshold || '10')
    const profitMarginWarningThreshold = parseFloat(configMap.profit_margin_warning_threshold || '20')

    const where: any = {
      isActive: true, // 默认只显示启用的产品
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { sku: { contains: search } },
        { description: { contains: search } },
      ]
    }

    // 预警筛选
    if (warningFilter === 'stock') {
      where.warningStock = true
    } else if (warningFilter === 'profit') {
      where.warningProfit = true
    } else if (warningFilter === 'missing') {
      where.warningMissing = true
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
        include: {
          tiktokSync: true,
        },
      }),
      prisma.product.count({ where }),
    ])

    // 计算毛利和毛利率
    const productsWithCalculations = products.map(product => {
      // 采购成本折算为 USD
      const costUsd = product.costCny * exchangeRate

      // 实际用于计算毛利的成交价：
      // 优先使用手动维护的折扣价，其次回退到 TikTok 折扣价，最后回退到标价
      const effectivePrice =
        product.discountPriceUsd ??
        product.tiktokDiscountPriceUsd ??
        product.priceUsd

      // 毛利 = 成交价 - 采购成本 - 头程 - 尾程 - 达人佣金 - 广告费用
      const profit =
        effectivePrice -
        costUsd -
        (product.firstLegLogisticsCostUsd || 0) -
        (product.lastLegLogisticsCostUsd || 0) -
        (product.influencerCommissionUsd || 0) -
        (product.adCostUsd || 0)

      const profitBase = effectivePrice || 0
      const profitMargin = profitBase > 0 ? (profit / profitBase) * 100 : 0

      // 检查预警
      const warningStock = product.stock < stockWarningThreshold
      const warningProfit = profitMargin < profitMarginWarningThreshold
      const warningMissing = !product.image || !product.description || 
                            !product.costCny || !product.priceUsd

      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        image: product.image,
        color: product.color,
        length: product.length,
        style: product.style,
        productUrl: product.productUrl,
        description: product.description,
        notes: product.notes,
        priceUsd: product.priceUsd,
        costCny: product.costCny,
        stock: product.stock,
        updatedAt: product.updatedAt,
        costUsd,
        effectivePrice,
        profit,
        profitMargin,
        warningStock,
        warningProfit,
        warningMissing,
      }
    })

    return NextResponse.json({
      products: productsWithCalculations,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (error) {
    console.error('获取产品列表失败:', error)
    return NextResponse.json({ error: '获取产品列表失败' }, { status: 500 })
  }
}

// 创建产品（所有已登录用户可创建）
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    if (!canCreateProductDirectly((session.user as any)?.role)) {
      return NextResponse.json({ error: '无权限' }, { status: 403 })
    }

    const data = await request.json()

    const product = await createProduct(data)

    return NextResponse.json(product)
  } catch (error: any) {
    console.error('创建产品失败:', error)
    // 返回更详细的错误信息
    if (error instanceof ProductSkuConflictError || error.code === 'P2002') {
      return NextResponse.json({ error: 'SKU 已存在，请使用不同的 SKU' }, { status: 400 })
    }
    return NextResponse.json({ error: '创建产品失败: ' + (error.message || '未知错误') }, { status: 500 })
  }
}
