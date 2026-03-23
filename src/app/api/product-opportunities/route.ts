import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 获取选品更新池列表
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') || 'all'
    const priority = searchParams.get('priority') || 'all'
    const search = searchParams.get('search') || ''

    const where: any = {}
    
    if (status && status !== 'all') {
      where.status = status
    }
    
    if (priority && priority !== 'all') {
      where.priority = priority
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { category: { contains: search } },
        { styleType: { contains: search } },
        { sourceNote: { contains: search } },
      ]
    }

    const opportunities = await prisma.productOpportunity.findMany({
      where,
      orderBy: [
        { status: 'asc' },
        { priority: 'asc' },
        { createdAt: 'desc' },
      ],
    })

    // 统计各状态数量
    const statusCounts = await prisma.productOpportunity.groupBy({
      by: ['status'],
      _count: { id: true },
    })

    return NextResponse.json({
      opportunities,
      statusCounts: Object.fromEntries(statusCounts.map(s => [s.status, s._count.id])),
    })
  } catch (error) {
    console.error('获取选品更新池失败:', error)
    return NextResponse.json({ error: '获取选品更新池失败' }, { status: 500 })
  }
}

// 创建选品机会
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

    const opportunity = await prisma.productOpportunity.create({
      data: {
        name: data.name,
        category: data.category || null,
        styleType: data.styleType || null,
        heatLevel: data.heatLevel || '中',
        sourceNote: data.sourceNote || null,
        existingSimilar: data.existingSimilar || null,
        diffPoints: data.diffPoints || null,
        suggestedAction: data.suggestedAction || '观察',
        priority: data.priority || '中',
        assignee: data.assignee || null,
        notes: data.notes || null,
        status: data.status || '可观察',
        productId: data.productId || null,
      },
    })

    return NextResponse.json(opportunity)
  } catch (error) {
    console.error('创建选品机会失败:', error)
    return NextResponse.json({ error: '创建选品机会失败' }, { status: 500 })
  }
}

// 更新选品机会
export async function PATCH(request: NextRequest) {
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
    const { id, ...fields } = data

    if (!id) {
      return NextResponse.json({ error: '缺少 ID' }, { status: 400 })
    }

    const allowedFields = [
      'name',
      'category',
      'styleType',
      'heatLevel',
      'sourceNote',
      'existingSimilar',
      'diffPoints',
      'suggestedAction',
      'priority',
      'assignee',
      'notes',
      'status',
      'productId',
    ]

    const updateData: any = {}
    for (const key of allowedFields) {
      if (key in fields) {
        updateData[key] = fields[key as keyof typeof fields]
      }
    }

    const opportunity = await prisma.productOpportunity.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(opportunity)
  } catch (error) {
    console.error('更新选品机会失败:', error)
    return NextResponse.json({ error: '更新选品机会失败' }, { status: 500 })
  }
}

// 删除选品机会
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userRole = (session.user as any).role
    if (userRole !== 'admin' && userRole !== 'operator') {
      return NextResponse.json({ error: '无权限' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: '缺少 ID' }, { status: 400 })
    }

    await prisma.productOpportunity.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除选品机会失败:', error)
    return NextResponse.json({ error: '删除选品机会失败' }, { status: 500 })
  }
}
