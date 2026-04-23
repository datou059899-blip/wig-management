import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 获取单个产品
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const product = await prisma.product.findUnique({
      where: { id: params.id },
      include: { tiktokSync: true }
    })

    if (!product) {
      return NextResponse.json({ error: '产品不存在' }, { status: 404 })
    }

    return NextResponse.json({ product })
  } catch (error) {
    console.error('获取产品失败:', error)
    return NextResponse.json({ error: '获取产品失败' }, { status: 500 })
  }
}

// 更新产品（所有已登录用户可更新）
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const data = await request.json()

    // 如果 sku 为空字符串，设为 null 避免唯一约束冲突
    const sku = data.sku?.trim() || null

    const product = await prisma.product.update({
      where: { id: params.id },
      data: {
        name: data.name,
        sku: sku,
        image: data.image,
        color: data.color,
        length: data.length,
        style: data.style,
        productUrl: data.productUrl,
        description: data.description,
      }
    })

    return NextResponse.json({ product })
  } catch (error: any) {
    console.error('更新产品失败:', error)
    // 返回更详细的错误信息
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'SKU 已存在，请使用不同的 SKU' }, { status: 400 })
    }
    return NextResponse.json({ error: '更新产品失败: ' + (error.message || '未知错误') }, { status: 500 })
  }
}

// 软删除产品（下架，所有已登录用户可下架）
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    // 软删除：将 isActive 设为 false
    await prisma.product.update({
      where: { id: params.id },
      data: { isActive: false }
    })

    return NextResponse.json({ success: true, message: '产品已下架' })
  } catch (error) {
    console.error('删除产品失败:', error)
    return NextResponse.json({ error: '删除产品失败' }, { status: 500 })
  }
}
