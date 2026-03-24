import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const canManage = (role?: string) =>
  ['admin', 'lead', 'product_operator', 'operator', 'editor', 'influencer_operator'].includes(role || '')

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const id = String(params.id || '').trim()
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const task = await prisma.workTask.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      owner: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
  })

  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

  return NextResponse.json({ task })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const role = (session.user as any)?.role as string | undefined
  const currentUserId = (session.user as any)?.id as string
  const currentUserName = (session.user as any)?.name as string | undefined

  const id = String(params.id || '').trim()
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const existing = await prisma.workTask.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

  // 权限检查：管理员/负责人/创建人可以编辑，执行人只能更新自己的任务
  const isManager = canManage(role) && ((existing as any).ownerUserId === currentUserId || (existing as any).creatorUserId === currentUserId)
  const isAssignee = (existing as any).assigneeUserId === currentUserId
  
  if (!isManager && !isAssignee) {
    return NextResponse.json({ error: '无权限' }, { status: 403 })
  }

  const body = await request.json()
  const patch: any = {}

  // 基础字段更新
  if (body.status != null) patch.status = String(body.status).trim()
  if (body.note !== undefined) patch.note = body.note == null ? null : String(body.note)
  if (body.dueDate !== undefined && body.dueDate !== null) {
    const d = new Date(String(body.dueDate))
    if (!isNaN(d.getTime())) patch.dueDate = d
  }

  // 只有管理员/负责人可以更新以下字段
  if (isManager) {
    if (body.priority != null) patch.priority = String(body.priority).trim()
    
    // 更新执行人 ID 和名称
    if (body.assigneeUserId != null) {
      const assigneeId = String(body.assigneeUserId).trim()
      patch.assigneeUserId = assigneeId
      // 获取用户名用于快照
      const assigneeUser = await prisma.user.findUnique({
        where: { id: assigneeId },
        select: { name: true, email: true },
      })
      patch.assigneeName = assigneeUser?.name || assigneeUser?.email || ''
    }
    
    // 更新负责人 ID 和名称
    if (body.ownerUserId != null) {
      const ownerId = body.ownerUserId ? String(body.ownerUserId).trim() : null
      if (ownerId) {
        const ownerUser = await prisma.user.findUnique({
          where: { id: ownerId },
          select: { name: true, email: true },
        })
        patch.ownerUserId = ownerId
        patch.ownerName = ownerUser?.name || ownerUser?.email || ''
      } else {
        patch.ownerUserId = null
        patch.ownerName = null
      }
    }
    
    if (body.isTodayMustDo != null) patch.isTodayMustDo = body.isTodayMustDo === true
    if (body.remindAt !== undefined) {
      if (body.remindAt == null) {
        patch.remindAt = null
      } else {
        const r = new Date(String(body.remindAt))
        if (!isNaN(r.getTime())) patch.remindAt = r
      }
    }
    // 完成要求字段
    if (body.requireCompletionNote != null) patch.requireCompletionNote = body.requireCompletionNote === true
    if (body.requireCompletionLink != null) patch.requireCompletionLink = body.requireCompletionLink === true
    if (body.requireCompletionResult != null) patch.requireCompletionResult = body.requireCompletionResult === true
  }

  // 完成时的处理：验证完成要求
  if (body.status === '已完成' && existing.status !== '已完成') {
    console.log('[PATCH] 完成任务，检查完成要求')
    console.log('[PATCH] existing.requireCompletionNote:', (existing as any).requireCompletionNote)
    console.log('[PATCH] existing.requireCompletionLink:', (existing as any).requireCompletionLink)
    console.log('[PATCH] existing.requireCompletionResult:', (existing as any).requireCompletionResult)
    console.log('[PATCH] body.completedNote:', body.completedNote)
    console.log('[PATCH] body.completedLink:', body.completedLink)
    console.log('[PATCH] body.completedResult:', body.completedResult)
    
    // 检查完成要求 - 使用 Number() 转换数据库的 Int 类型
    const reqNote = (existing as any).requireCompletionNote === 1 || (existing as any).requireCompletionNote === true
    const reqLink = (existing as any).requireCompletionLink === 1 || (existing as any).requireCompletionLink === true
    const reqResult = (existing as any).requireCompletionResult === 1 || (existing as any).requireCompletionResult === true
    
    if (reqNote && !body.completedNote) {
      console.log('[PATCH] 验证失败：缺少 completedNote')
      return NextResponse.json({ error: '完成后必须填写备注' }, { status: 400 })
    }
    if (reqLink && !body.completedLink) {
      console.log('[PATCH] 验证失败：缺少 completedLink')
      return NextResponse.json({ error: '完成后必须附链接' }, { status: 400 })
    }
    if (reqResult && !body.completedResult) {
      console.log('[PATCH] 验证失败：缺少 completedResult')
      return NextResponse.json({ error: '完成后必须填写结果说明' }, { status: 400 })
    }
    // 保存完成时的填写内容
    patch.completedNote = body.completedNote || null
    patch.completedLink = body.completedLink || null
    patch.completedResult = body.completedResult || null
    patch.completedAt = new Date()
    console.log('[PATCH] 验证通过，准备更新任务状态')
  }

  // 如果是执行人更新状态（非完成操作）
  if (isAssignee && !isManager && body.status && body.status !== '已完成') {
    // 执行人只能更新自己的状态
    patch.status = String(body.status).trim()
  }

  const updated = await prisma.workTask.update({
    where: { id },
    data: patch,
  })

  return NextResponse.json({ task: updated })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const role = (session.user as any)?.role as string | undefined
  const currentUserId = (session.user as any)?.id as string

  const id = String(params.id || '').trim()
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const existing = await prisma.workTask.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

  // 只有管理员/负责人/创建人可以删除
  const isManager = canManage(role) && ((existing as any).ownerUserId === currentUserId || (existing as any).creatorUserId === currentUserId)
  
  if (!isManager) {
    return NextResponse.json({ error: '无权限删除任务' }, { status: 403 })
  }

  await prisma.workTask.delete({ where: { id } })

  return NextResponse.json({ success: true })
}