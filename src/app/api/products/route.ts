import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 获取产品列表（带毛利和预警信息）
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const search = searchParams.get('search') || ''
    const sortBy = searchParams.get('sortBy') || 'createdAt'
    const sortOrder = searchParams.get('sortOrder') || 'desc'
    const warningFilter = searchParams.get('warning') // stock, profit, missing

    // 获取配置
    const config = await prisma.config.findMany()
    const configMap = Object.fromEntries(config.map(c => [c.key, c.value]))
    const exchangeRate = parseFloat(configMap.exchange_rate || '7.2')
    const stockWarningThreshold = parseInt(configMap.stock_warning_threshold || '10')
    const profitMarginWarningThreshold = parseFloat(configMap.profit_margin_warning_threshold || '20')

    const where: any = {}
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
      const costUsd = product.costCny * exchangeRate
      const profit = product.priceUsd - costUsd
      const profitMargin = product.priceUsd > 0 ? (profit / product.priceUsd) * 100 : 0

      // 检查预警
      const warningStock = product.stock < stockWarningThreshold
      const warningProfit = profitMargin < profitMarginWarningThreshold
      const warningMissing = !product.image || !product.description || 
                            !product.costCny || !product.priceUsd

      return {
        ...product,
        costUsd,
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

// 创建产品
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

    const product = await prisma.product.create({
      data: {
        name: data.name,
        sku: data.sku,
        skuId: data.skuId,
        image: data.image,
        images: data.images,
        description: data.description,
        material: data.material,
        length: data.length,
        color: data.color,
        style: data.style,
        costCny: data.costCny || 0,
        priceUsd: data.priceUsd || 0,
        tiktokPriceUsd: data.tiktokPriceUsd,
        tiktokDiscountPriceUsd: data.tiktokDiscountPriceUsd,
        stock: data.stock || 0,
        scene: data.scene,
        materialUrl: data.materialUrl,
        tags: data.tags,
        notes: data.notes,
      },
    })

    return NextResponse.json(product)
  } catch (error) {
    console.error('创建产品失败:', error)
    return NextResponse.json({ error: '创建产品失败' }, { status: 500 })
  }
}
