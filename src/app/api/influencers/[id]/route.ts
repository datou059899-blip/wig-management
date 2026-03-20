import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const canManage = (role?: string) =>
  role === 'admin' || role === 'operator' || role === 'influencer_operator'

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const role = (session.user as any)?.role as string | undefined
    if (!canManage(role)) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const id = context.params.id
    const body = await request.json()

    const data: any = {}
    const str = (k: string) => (body[k] !== undefined ? (body[k] ? String(body[k]) : null) : undefined)
    const num = (k: string) => (body[k] !== undefined ? Number(body[k]) || 0 : undefined)
    const date = (k: string) => {
      if (body[k] === undefined) return undefined
      if (!body[k]) return null
      const d = new Date(String(body[k]))
      if (isNaN(d.getTime())) return null
      return d
    }

    if (body.nickname !== undefined) data.nickname = String(body.nickname || '').trim()
    if (body.platform !== undefined) data.platform = String(body.platform || 'TikTok')
    if (body.profileUrl !== undefined) data.profileUrl = str('profileUrl')
    if (body.country !== undefined) data.country = str('country')
    if (body.followers !== undefined) data.followers = num('followers')

    if (body.contentTypes !== undefined) data.contentTypes = JSON.stringify(Array.isArray(body.contentTypes) ? body.contentTypes : [])
    if (body.productLines !== undefined) data.productLines = JSON.stringify(Array.isArray(body.productLines) ? body.productLines : [])
    if (body.matchProducts !== undefined) data.matchProducts = JSON.stringify(Array.isArray(body.matchProducts) ? body.matchProducts : [])
    if (body.tags !== undefined) data.tags = JSON.stringify(Array.isArray(body.tags) ? body.tags : [])

    if (body.status !== undefined) data.status = String(body.status || 'to_outreach')
    if (body.owner !== undefined) data.owner = String(body.owner || '运营')
    if (body.potential !== undefined) data.potential = String(body.potential || 'C')

    if (body.email !== undefined) data.email = str('email')
    if (body.whatsapp !== undefined) data.whatsapp = str('whatsapp')
    if (body.phone !== undefined) data.phone = str('phone')
    if (body.instagram !== undefined) data.instagram = str('instagram')
    if (body.otherContact !== undefined) data.otherContact = str('otherContact')
    if (body.language !== undefined) data.language = str('language')

    if (body.cooperationLevel !== undefined)
      data.cooperationLevel = String(body.cooperationLevel || 'normal')
    if (body.deepRequirements !== undefined) data.deepRequirements = str('deepRequirements')
    if (body.deepKeyProducts !== undefined)
      data.deepKeyProducts = JSON.stringify(Array.isArray(body.deepKeyProducts) ? body.deepKeyProducts : [])
    if (body.deepFrequency !== undefined) data.deepFrequency = str('deepFrequency')
    if (body.deepNotes !== undefined) data.deepNotes = str('deepNotes')

    if (body.lastFollowUpAt !== undefined) data.lastFollowUpAt = date('lastFollowUpAt')
    if (body.lastFollowUpNote !== undefined) data.lastFollowUpNote = str('lastFollowUpNote')
    if (body.firstContactAt !== undefined) data.firstContactAt = date('firstContactAt')
    if (body.nextFollowUpAt !== undefined) data.nextFollowUpAt = date('nextFollowUpAt')
    if (body.nextAction !== undefined) data.nextAction = str('nextAction')

    if (body.timeline !== undefined) data.timeline = Array.isArray(body.timeline) ? body.timeline : []
    if (body.quote !== undefined) data.quote = body.quote || null
    if (body.sample !== undefined) data.sample = body.sample || null
    if (body.deliverables !== undefined) data.deliverables = body.deliverables || null
    if (body.review !== undefined) data.review = body.review || null

    if (data.nickname !== undefined && !data.nickname) {
      return NextResponse.json({ error: '昵称不能为空' }, { status: 400 })
    }

    await prisma.influencer.update({ where: { id }, data })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('更新达人失败:', e)
    return NextResponse.json({ error: '更新达人失败' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const role = (session.user as any)?.role as string | undefined
    if (!canManage(role)) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const id = context.params.id
    await prisma.influencer.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('删除达人失败:', e)
    return NextResponse.json({ error: '删除达人失败' }, { status: 500 })
  }
}

