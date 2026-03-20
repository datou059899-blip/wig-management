import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const canManage = (role?: string) => role === 'admin' || role === 'operator' || role === 'editor'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const userId = (session.user as any)?.id as string | undefined
    if (!userId) return NextResponse.json({ error: '用户信息缺失' }, { status: 400 })

    const sp = request.nextUrl.searchParams
    const mine = (sp.get('mine') || '1').trim() !== '0'
    const date = (sp.get('date') || 'today').trim()
    const status = (sp.get('status') || '').trim()

    const where: any = {}
    if (mine) where.assigneeId = userId
    if (status) where.status = status
    if (date !== 'all') {
      const start = new Date()
      if (date === 'today') {
        start.setHours(0, 0, 0, 0)
      } else {
        const d = new Date(date)
        if (!isNaN(d.getTime())) {
          d.setHours(0, 0, 0, 0)
          start.setTime(d.getTime())
        } else {
          start.setHours(0, 0, 0, 0)
        }
      }
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      where.createdAt = { gte: start, lt: end }
    }

    const tasks = await prisma.trainingTask.findMany({
      where,
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        script: { select: { id: true, title: true, platform: true, productSku: true } },
        owner: { select: { id: true, name: true, email: true, role: true } },
        assignee: { select: { id: true, name: true, email: true, role: true } },
      },
    })

    return NextResponse.json({ tasks })
  } catch (error) {
    console.error('获取任务失败:', error)
    return NextResponse.json({ error: '获取任务失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const role = (session.user as any)?.role as string | undefined
    if (!canManage(role)) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const creatorId = (session.user as any)?.id as string | undefined
    const body = await request.json()

    const assigneeId = String(body.assigneeId || creatorId || '').trim()
    const title = String(body.title || '').trim()
    if (!assigneeId) return NextResponse.json({ error: '缺少指派对象' }, { status: 400 })
    if (!title) return NextResponse.json({ error: '任务标题不能为空' }, { status: 400 })

    const dueAt = body.dueAt ? new Date(String(body.dueAt)) : null
    const dueAtSafe = dueAt && !isNaN(dueAt.getTime()) ? dueAt : null

    const task = await prisma.trainingTask.create({
      data: {
        title,
        focus: body.focus ? String(body.focus) : null,
        requirement: body.requirement ? String(body.requirement) : null,
        dueAt: dueAtSafe,
        status: body.status ? String(body.status) : 'todo',
        scriptId: body.scriptId ? String(body.scriptId) : null,
        assigneeId,
        ownerId: body.ownerId ? String(body.ownerId) : null,
        createdById: creatorId || null,
      },
      include: {
        script: { select: { id: true, title: true, platform: true, productSku: true } },
        owner: { select: { id: true, name: true, email: true, role: true } },
        assignee: { select: { id: true, name: true, email: true, role: true } },
      },
    })

    return NextResponse.json({ task })
  } catch (error) {
    console.error('创建任务失败:', error)
    return NextResponse.json({ error: '创建任务失败' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const role = (session.user as any)?.role as string | undefined
    if (!canManage(role)) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const userId = (session.user as any)?.id as string | undefined
    const body = await request.json()
    const id = String(body.id || '').trim()
    if (!id) return NextResponse.json({ error: '缺少任务ID' }, { status: 400 })

    // 权限：可以更新自己任务；或 admin/operator/editor 管理
    const existing = await prisma.trainingTask.findUnique({
      where: { id },
      select: { id: true, assigneeId: true },
    })
    if (!existing) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
    if (existing.assigneeId !== userId && role !== 'admin' && role !== 'operator' && role !== 'editor') {
      return NextResponse.json({ error: '无权限' }, { status: 403 })
    }

    const updated = await prisma.trainingTask.update({
      where: { id },
      data: {
        status: body.status !== undefined ? String(body.status) : undefined,
        focus: body.focus !== undefined ? (body.focus ? String(body.focus) : null) : undefined,
        requirement:
          body.requirement !== undefined ? (body.requirement ? String(body.requirement) : null) : undefined,
        dueAt: body.dueAt !== undefined ? (body.dueAt ? new Date(String(body.dueAt)) : null) : undefined,
        ownerId: body.ownerId !== undefined ? (body.ownerId ? String(body.ownerId) : null) : undefined,
      },
      include: {
        script: { select: { id: true, title: true, platform: true, productSku: true } },
        owner: { select: { id: true, name: true, email: true, role: true } },
        assignee: { select: { id: true, name: true, email: true, role: true } },
      },
    })

    return NextResponse.json({ task: updated })
  } catch (error) {
    console.error('更新任务失败:', error)
    return NextResponse.json({ error: '更新任务失败' }, { status: 500 })
  }
}

