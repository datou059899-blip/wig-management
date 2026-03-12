import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const canEdit = (role?: string) => role === 'admin' || role === 'operator' || role === 'editor'

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const id = context.params.id
    const script = await prisma.viralScript.findUnique({
      where: { id },
      include: {
        breakdowns: { orderBy: { version: 'desc' }, take: 20, include: { editedBy: true } },
      },
    })

    if (!script) return NextResponse.json({ error: '不存在' }, { status: 404 })
    return NextResponse.json({ script })
  } catch (error) {
    console.error('获取脚本详情失败:', error)
    return NextResponse.json({ error: '获取脚本详情失败' }, { status: 500 })
  }
}

// 更新脚本信息（不改拆解内容）
export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const role = (session.user as any)?.role as string | undefined
    if (!canEdit(role)) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const id = context.params.id
    const body = await request.json()

    const updated = await prisma.viralScript.update({
      where: { id },
      data: {
        title: body.title ? String(body.title) : undefined,
        platform: body.platform !== undefined ? (body.platform ? String(body.platform) : null) : undefined,
        sourceUrl: body.sourceUrl !== undefined ? (body.sourceUrl ? String(body.sourceUrl) : null) : undefined,
        productSku: body.productSku !== undefined ? (body.productSku ? String(body.productSku) : null) : undefined,
        status: body.status ? String(body.status) : undefined,
        tags: body.tags !== undefined ? (body.tags ? JSON.stringify(body.tags) : null) : undefined,
      },
    })

    return NextResponse.json({ script: updated })
  } catch (error) {
    console.error('更新脚本失败:', error)
    return NextResponse.json({ error: '更新脚本失败' }, { status: 500 })
  }
}

// 保存拆解：默认覆盖最新版本；如传 createNewVersion=true 则生成新版本
export async function PUT(request: NextRequest, context: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const role = (session.user as any)?.role as string | undefined
    if (!canEdit(role)) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const editedById = (session.user as any)?.id as string | undefined
    const id = context.params.id
    const body = await request.json()
    const content = String(body.content || '')
    const createNewVersion = Boolean(body.createNewVersion)

    const latest = await prisma.scriptBreakdown.findFirst({
      where: { scriptId: id },
      orderBy: { version: 'desc' },
      select: { id: true, version: true },
    })

    let breakdown
    if (!latest) {
      breakdown = await prisma.scriptBreakdown.create({
        data: {
          scriptId: id,
          version: 1,
          content,
          editedById: editedById || null,
        },
      })
    } else if (createNewVersion) {
      breakdown = await prisma.scriptBreakdown.create({
        data: {
          scriptId: id,
          version: latest.version + 1,
          content,
          editedById: editedById || null,
        },
      })
    } else {
      breakdown = await prisma.scriptBreakdown.update({
        where: { id: latest.id },
        data: {
          content,
          editedById: editedById || null,
        },
      })
    }

    // 触发脚本 updatedAt 变化，方便列表“实时”刷新
    await prisma.viralScript.update({
      where: { id },
      data: { updatedAt: new Date() },
    })

    return NextResponse.json({ success: true, breakdown })
  } catch (error) {
    console.error('保存拆解失败:', error)
    return NextResponse.json({ error: '保存拆解失败' }, { status: 500 })
  }
}

