import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const canEdit = (role?: string) => role === 'admin' || role === 'operator' || role === 'editor'

// 列表：支持 search / status / updatedAfter（用于轮询增量）
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const search = (searchParams.get('search') || '').trim()
    const status = (searchParams.get('status') || 'active').trim()
    const updatedAfter = searchParams.get('updatedAfter')

    const where: any = {}
    if (status) where.status = status
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { productSku: { contains: search } },
        { platform: { contains: search } },
      ]
    }
    if (updatedAfter) {
      const d = new Date(updatedAfter)
      if (!isNaN(d.getTime())) where.updatedAt = { gt: d }
    }

    const scripts = await prisma.viralScript.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        breakdowns: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, version: true, updatedAt: true, editedById: true },
        },
      },
    })

    return NextResponse.json({ scripts })
  } catch (error) {
    console.error('获取脚本列表失败:', error)
    return NextResponse.json({ error: '获取脚本列表失败' }, { status: 500 })
  }
}

// 创建脚本（会同时创建 v1 拆解）
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const role = (session.user as any)?.role as string | undefined
    if (!canEdit(role)) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const body = await request.json()
    const title = String(body.title || '').trim()
    if (!title) return NextResponse.json({ error: '标题不能为空' }, { status: 400 })

    const createdById = (session.user as any)?.id as string | undefined

    const script = await prisma.viralScript.create({
      data: {
        title,
        platform: body.platform ? String(body.platform) : null,
        sourceUrl: body.sourceUrl ? String(body.sourceUrl) : null,
        productSku: body.productSku ? String(body.productSku) : null,
        tags: body.tags ? JSON.stringify(body.tags) : null,
        status: 'active',
        createdById: createdById || null,
        breakdowns: {
          create: {
            version: 1,
            content: body.content ? String(body.content) : '',
            editedById: createdById || null,
          },
        },
      },
      include: {
        breakdowns: { orderBy: { version: 'desc' }, take: 1 },
      },
    })

    return NextResponse.json({ script })
  } catch (error) {
    console.error('创建脚本失败:', error)
    return NextResponse.json({ error: '创建脚本失败' }, { status: 500 })
  }
}

