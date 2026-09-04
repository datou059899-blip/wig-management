import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  canAssignWorkTask,
  canCreateOwnWorkTask,
  canViewTeamWorkTasks,
  mapOldRole,
} from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const sp = request.nextUrl.searchParams
  const mine = (sp.get('mine') || '1').trim() !== '0'
  const status = (sp.get('status') || '').trim()
  const viewAs = (sp.get('viewAs') || '').trim() // 'owner' | 'creator' | ''

  const currentUserId = (session?.user as any)?.id
  const role = (session?.user as any)?.role as string | undefined
  const mappedRole = mapOldRole(role)

  if (!mappedRole || mappedRole === 'viewer') {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const where: any = {}

  if (mine) {
    if (!currentUserId) {
      return NextResponse.json({ error: '未找到用户 ID' }, { status: 400 })
    }
    
    const relatedToCurrentUser = [
      { creatorUserId: currentUserId },
      { ownerUserId: currentUserId },
      { assigneeUserId: currentUserId },
      { collaboratorUserIds: { has: currentUserId } },
    ]
    if (viewAs === 'owner') {
      where.AND = [{ ownerUserId: currentUserId }]
    } else if (viewAs === 'creator') {
      where.AND = [{ creatorUserId: currentUserId }]
    } else {
      where.OR = relatedToCurrentUser
    }
  } else if (!canViewTeamWorkTasks(role)) {
    return NextResponse.json({ error: '无权限查看团队任务' }, { status: 403 })
  }

  if (status) where.status = status

  const tasks = await prisma.workTask.findMany({
    where,
    include: {
      creator: { select: { id: true, name: true, email: true } },
      owner: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ isTodayMustDo: 'desc' }, { dueDate: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  })

  return NextResponse.json({ tasks })
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      console.log('[WorkTasks POST] 未登录')
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const role = (session.user as any)?.role as string | undefined
    const currentUserId = (session.user as any)?.id as string
    const currentUserName = (session.user as any)?.name as string | undefined
    
    console.log('[WorkTasks POST] ===== 创建任务开始 =====')
    console.log('[WorkTasks POST] 用户 ID:', currentUserId)
    console.log('[WorkTasks POST] 用户角色:', role)
    console.log('[WorkTasks POST] 用户名称:', currentUserName)
    
    if (!canCreateOwnWorkTask(role)) {
      console.log('[WorkTasks POST] 无权限，当前角色:', role)
      return NextResponse.json({ error: '无权限' }, { status: 403 })
    }

    const body = await request.json()
    console.log('[WorkTasks POST] ===== 收到的原始 body =====')
    console.log('[WorkTasks POST] 原始 body:', JSON.stringify(body, null, 2))
    console.log('[WorkTasks POST] body.title 类型:', typeof body.title, '值:', body.title)
    console.log('[WorkTasks POST] body.assigneeUserId 类型:', typeof body.assigneeUserId, '值:', body.assigneeUserId)
    console.log('[WorkTasks POST] body.ownerUserId 类型:', typeof body.ownerUserId, '值:', body.ownerUserId)
    console.log('[WorkTasks POST] body.dueDate 类型:', typeof body.dueDate, '值:', body.dueDate)

    const title = String(body.title || '').trim()
    const sourceModule = String(body.sourceModule || '自定义').trim()
    const priority = String(body.priority || '中').trim()
    
    // 使用 userId 而不是用户名
    const canAssign = canAssignWorkTask(role)
    const requestedAssigneeUserId = String(body.assigneeUserId || currentUserId || '').trim()
    const requestedOwnerUserId = body.ownerUserId != null ? String(body.ownerUserId).trim() : ''
    const assigneeUserId = canAssign ? requestedAssigneeUserId : currentUserId
    const ownerUserId = canAssign ? requestedOwnerUserId || currentUserId : currentUserId
    const relatedEntityId = String(body.relatedEntityId || '-').trim()
    const note = body.note != null ? String(body.note) : null
    const status = String(body.status || '待做').trim()

    // 创建人 ID：自动取当前登录用户
    const creatorUserId = currentUserId
    console.log('[WorkTasks POST] 创建人 ID:', creatorUserId)

    // 验证必填字段
    if (!title) {
      console.log('[WorkTasks POST] 缺少 title')
      return NextResponse.json({ error: '缺少 title' }, { status: 400 })
    }
    if (!assigneeUserId) {
      console.log('[WorkTasks POST] 缺少 assigneeUserId')
      return NextResponse.json({ error: '缺少执行人 ID' }, { status: 400 })
    }

    const dueDate = body.dueDate ? new Date(String(body.dueDate)) : null
    console.log('[WorkTasks POST] dueDate 原始值:', body.dueDate)
    
    const dueSafe = dueDate && !isNaN(dueDate.getTime()) ? dueDate : new Date()
    dueSafe.setHours(18, 0, 0, 0)
    console.log('[WorkTasks POST] dueDate 处理后:', dueSafe.toISOString())

    // 提醒时间
    let remindAt: Date | null = null
    if (body.remindAt) {
      const r = new Date(String(body.remindAt))
      if (!isNaN(r.getTime())) {
        remindAt = r
        console.log('[WorkTasks POST] remindAt:', remindAt.toISOString())
      }
    }

    // 是否今日必做
    const isTodayMustDo = body.isTodayMustDo === true

    // 任务类型和部门
    const requestedTaskType = String(body.taskType || 'personal').trim() as 'personal' | 'team'
    if (!canAssign) {
      if (requestedTaskType === 'team') {
        return NextResponse.json({ error: '无权限创建团队任务' }, { status: 403 })
      }
      if (requestedAssigneeUserId && requestedAssigneeUserId !== currentUserId) {
        return NextResponse.json({ error: '无权限指派他人任务' }, { status: 403 })
      }
      if (requestedOwnerUserId && requestedOwnerUserId !== currentUserId) {
        return NextResponse.json({ error: '无权限设置他人为负责人' }, { status: 403 })
      }
      if (Array.isArray(body.collaboratorUserIds) && body.collaboratorUserIds.some((id: unknown) => String(id) !== currentUserId)) {
        return NextResponse.json({ error: '无权限设置协作执行人' }, { status: 403 })
      }
    }
    const taskType = canAssign ? requestedTaskType : 'personal'
    const department = taskType === 'team' ? String(body.department || '').trim() : null
    
    // 协作执行人
    const collaboratorUserIds = canAssign ? body.collaboratorUserIds || [] : []

    // 完成要求
    const requireCompletionNote = body.requireCompletionNote === true
    const requireCompletionLink = body.requireCompletionLink === true
    const requireCompletionResult = body.requireCompletionResult === true

    const todayKey = toLocalDateKey(new Date())
    const taskKey = `manual:${todayKey}:${sourceModule}:${relatedEntityId}:${assigneeUserId}:${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}`

    console.log('[WorkTasks POST] 准备创建任务 taskKey:', taskKey)

    // 获取执行人和负责人的用户名（用于快照显示）
    const assigneeUser = await prisma.user.findUnique({
      where: { id: assigneeUserId },
      select: { id: true, name: true, email: true },
    })
    
    if (!assigneeUser) {
      console.log('[WorkTasks POST] 执行人用户不存在:', assigneeUserId)
      return NextResponse.json({ error: '执行人用户不存在' }, { status: 400 })
    }
    
    const ownerUser = ownerUserId 
      ? await prisma.user.findUnique({
          where: { id: ownerUserId },
          select: { id: true, name: true, email: true },
        })
      : null

    const assigneeName = assigneeUser?.name || assigneeUser?.email || '未知用户'
    const ownerName = ownerUser?.name || ownerUser?.email || currentUserName || ''
    const creatorName = currentUserName || ''

    const task = await prisma.workTask.create({
      data: {
        taskKey,
        title,
        sourceModule,
        taskType,
        priority,
        creatorUserId,
        creatorName,
        ownerUserId: ownerUserId || creatorUserId, // 负责人默认为创建人
        ownerName: ownerName || creatorName,
        assigneeUserId,
        assigneeName,
        dueDate: dueSafe,
        remindAt,
        isTodayMustDo,
        status,
        relatedEntityId: relatedEntityId || '-',
        note,
        department,
        collaboratorUserIds: collaboratorUserIds || [],
        requireCompletionNote,
        requireCompletionLink,
        requireCompletionResult,
        originalDueDate: status === '已延期' ? dueSafe : null,
        delayDays: status === '已延期' ? 1 : 0,
      },
    })

    console.log('[WorkTasks POST] 任务创建成功:', task.id)
    return NextResponse.json({ task })
  } catch (error) {
    console.error('[WorkTasks POST] 创建任务失败:', error)
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    return NextResponse.json({ error: '创建失败：' + errorMessage }, { status: 500 })
  }
}

function toLocalDateKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
