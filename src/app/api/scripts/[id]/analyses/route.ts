import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const canAccess = (role?: string) =>
  role === 'admin' ||
  role === 'operator' ||
  role === 'editor' ||
  role === 'optimizer' ||
  role === 'viewer' ||
  role === 'influencer_operator'

const canEditStandard = (role?: string) => role === 'admin' || role === 'operator'

const shape = (x: any) => ({
  id: x.id,
  scriptId: x.scriptId,
  userId: x.userId,
  userName: x.user?.name || x.user?.email || '',
  positionAnalysis: x.positionAnalysis || '',
  hookAnalysis: x.hookAnalysis || '',
  rhythmAnalysis: x.rhythmAnalysis || '',
  shotAnalysis: x.shotAnalysis || '',
  subtitleAnalysis: x.subtitleAnalysis || '',
  whyItWorked: x.whyItWorked || '',
  whatToWatch: x.whatToWatch || '',
  commonMistakes: x.commonMistakes || '',
  todayExecution: x.todayExecution || '',
  isLearned: Boolean(x.isLearned),
  isPracticing: Boolean(x.isPracticing),
  submitStatus: x.submitStatus || 'draft',
  storyboard: x.storyboard ?? null,
  updatedAt: x.updatedAt ? new Date(x.updatedAt).toISOString() : new Date().toISOString(),
})

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
    const role = (session.user as any)?.role as string | undefined
    if (!canAccess(role)) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const scriptId = context.params.id
    const userId = (session.user as any)?.id as string | undefined

    const [standard, mine, team] = await Promise.all([
      prisma.scriptStandardAnalysis.findUnique({ where: { scriptId } }),
      userId
        ? prisma.scriptUserAnalysis.findUnique({
            where: { scriptId_userId: { scriptId, userId } },
            include: { user: { select: { id: true, name: true, email: true } } },
          })
        : null,
      prisma.scriptUserAnalysis.findMany({
        where: userId ? { scriptId, NOT: { userId } } : { scriptId },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ])

    return NextResponse.json({
      standard: standard
        ? {
            id: standard.id,
            scriptId: standard.scriptId,
            positionAnalysis: standard.positionAnalysis || '',
            hookAnalysis: standard.hookAnalysis || '',
            rhythmAnalysis: standard.rhythmAnalysis || '',
            shotAnalysis: standard.shotAnalysis || '',
            subtitleAnalysis: standard.subtitleAnalysis || '',
            whyItWorked: standard.whyItWorked || '',
            whatToWatch: standard.whatToWatch || '',
            commonMistakes: standard.commonMistakes || '',
            todayExecution: standard.todayExecution || '',
            updatedAt: standard.updatedAt.toISOString(),
          }
        : null,
      mine: mine ? shape(mine) : null,
      team: (team || []).map(shape),
    })
  } catch (e) {
    console.error('获取拆解失败:', e)
    return NextResponse.json({ error: '获取拆解失败' }, { status: 500 })
  }
}

export async function POST(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
    const role = (session.user as any)?.role as string | undefined
    if (!canAccess(role)) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const scriptId = context.params.id
    const userId = (session.user as any)?.id as string | undefined
    if (!userId) return NextResponse.json({ error: '缺少用户信息' }, { status: 400 })

    const created = await prisma.scriptUserAnalysis.upsert({
      where: { scriptId_userId: { scriptId, userId } },
      update: {},
      create: {
        scriptId,
        userId,
        submitStatus: 'draft',
        storyboard: '[]',
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    })

    return NextResponse.json({ mine: shape(created) })
  } catch (e) {
    console.error('创建我的拆解失败:', e)
    return NextResponse.json({ error: '创建我的拆解失败' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })
    const role = (session.user as any)?.role as string | undefined
    if (!canAccess(role)) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const scriptId = context.params.id
    const userId = (session.user as any)?.id as string | undefined
    const body = await request.json()
    const kind = String(body.kind || 'mine')

    const pick = (k: string) => (body[k] !== undefined ? String(body[k] || '') : undefined)
    const bool = (k: string) => (body[k] !== undefined ? Boolean(body[k]) : undefined)

    if (kind === 'standard') {
      if (!canEditStandard(role)) return NextResponse.json({ error: '无权限' }, { status: 403 })
      const updated = await prisma.scriptStandardAnalysis.upsert({
        where: { scriptId },
        update: {
          positionAnalysis: pick('positionAnalysis'),
          hookAnalysis: pick('hookAnalysis'),
          rhythmAnalysis: pick('rhythmAnalysis'),
          shotAnalysis: pick('shotAnalysis'),
          subtitleAnalysis: pick('subtitleAnalysis'),
          whyItWorked: pick('whyItWorked'),
          whatToWatch: pick('whatToWatch'),
          commonMistakes: pick('commonMistakes'),
          todayExecution: pick('todayExecution'),
        },
        create: {
          scriptId,
          positionAnalysis: String(body.positionAnalysis || ''),
          hookAnalysis: String(body.hookAnalysis || ''),
          rhythmAnalysis: String(body.rhythmAnalysis || ''),
          shotAnalysis: String(body.shotAnalysis || ''),
          subtitleAnalysis: String(body.subtitleAnalysis || ''),
          whyItWorked: String(body.whyItWorked || ''),
          whatToWatch: String(body.whatToWatch || ''),
          commonMistakes: String(body.commonMistakes || ''),
          todayExecution: String(body.todayExecution || ''),
        },
      })
      return NextResponse.json({
        standard: {
          id: updated.id,
          scriptId: updated.scriptId,
          positionAnalysis: updated.positionAnalysis || '',
          hookAnalysis: updated.hookAnalysis || '',
          rhythmAnalysis: updated.rhythmAnalysis || '',
          shotAnalysis: updated.shotAnalysis || '',
          subtitleAnalysis: updated.subtitleAnalysis || '',
          whyItWorked: updated.whyItWorked || '',
          whatToWatch: updated.whatToWatch || '',
          commonMistakes: updated.commonMistakes || '',
          todayExecution: updated.todayExecution || '',
          updatedAt: updated.updatedAt.toISOString(),
        },
      })
    }

    // mine
    if (!userId) return NextResponse.json({ error: '缺少用户信息' }, { status: 400 })
    const updated = await prisma.scriptUserAnalysis.upsert({
      where: { scriptId_userId: { scriptId, userId } },
      update: {
        positionAnalysis: pick('positionAnalysis'),
        hookAnalysis: pick('hookAnalysis'),
        rhythmAnalysis: pick('rhythmAnalysis'),
        shotAnalysis: pick('shotAnalysis'),
        subtitleAnalysis: pick('subtitleAnalysis'),
        whyItWorked: pick('whyItWorked'),
        whatToWatch: pick('whatToWatch'),
        commonMistakes: pick('commonMistakes'),
        todayExecution: pick('todayExecution'),
        isLearned: bool('isLearned'),
        isPracticing: bool('isPracticing'),
        submitStatus: body.submitStatus !== undefined ? String(body.submitStatus || 'draft') : undefined,
        storyboard: body.storyboard !== undefined ? body.storyboard : undefined,
      },
      create: {
        scriptId,
        userId,
        positionAnalysis: String(body.positionAnalysis || ''),
        hookAnalysis: String(body.hookAnalysis || ''),
        rhythmAnalysis: String(body.rhythmAnalysis || ''),
        shotAnalysis: String(body.shotAnalysis || ''),
        subtitleAnalysis: String(body.subtitleAnalysis || ''),
        whyItWorked: String(body.whyItWorked || ''),
        whatToWatch: String(body.whatToWatch || ''),
        commonMistakes: String(body.commonMistakes || ''),
        todayExecution: String(body.todayExecution || ''),
        isLearned: Boolean(body.isLearned),
        isPracticing: Boolean(body.isPracticing),
        submitStatus: String(body.submitStatus || 'draft'),
        storyboard: body.storyboard ?? '[]',
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    })

    return NextResponse.json({ mine: shape(updated) })
  } catch (e) {
    console.error('保存拆解失败:', e)
    return NextResponse.json({ error: '保存拆解失败' }, { status: 500 })
  }
}

