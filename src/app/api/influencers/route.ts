import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const canAccess = (role?: string) =>
  role === 'admin' || role === 'lead' || role === 'operator' || role === 'influencer_operator'

const canManage = (role?: string) =>
  role === 'admin' || role === 'lead' || role === 'operator' || role === 'influencer_operator'

const parseJsonArray = (value: unknown) => {
  if (Array.isArray(value)) return value.map((x) => String(x))
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map((x) => String(x))
    } catch {
      // ignore
    }
  }
  return []
}

const parseJsonArrayStr = (value: unknown) => {
  const arr = parseJsonArray(value)
  return JSON.stringify(arr)
}

const mockSeed = [
  {
    id: 'inf_1',
    nickname: 'LunaHairLab',
    platform: 'TikTok',
    profileUrl: 'https://tiktok.com/@lunahairlab',
    country: 'US',
    followers: 186000,
    contentTypes: ['测评', '开箱', '教程'],
    productLines: ['蕾丝假发', '日常通勤'],
    matchProducts: ['HD Lace Bob', 'Glueless Curly 24"'],
    status: 'to_outreach',
    owner: 'Yuyuhan',
    potential: 'A',
    email: 'luna@example.com',
    lastFollowUpAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    lastFollowUpNote: '准备首条 DM 话术 + 产品匹配点',
    nextAction: '发送首条消息',
    timeline: [
      {
        id: 't1',
        at: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
        by: '运营',
        note: '完成达人筛选与产品匹配，准备建联。',
        nextAction: '发送首条消息',
      },
    ],
    quote: { currency: 'USD', note: '先询价，争取置换合作' },
  },
  {
    id: 'inf_2',
    nickname: 'WigDailyTips',
    platform: 'Instagram',
    profileUrl: 'https://instagram.com/wigdailytips',
    country: 'CA',
    followers: 42000,
    contentTypes: ['Reels', 'Before/After'],
    productLines: ['初学者佩戴', '发际线教程'],
    matchProducts: ['Beginner Glueless', 'Natural Hairline'],
    status: 'sent',
    owner: 'Yuyuhan',
    potential: 'B',
    whatsapp: '+1 000 000 0000',
    lastFollowUpAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    lastFollowUpNote: '已发送合作邀请，等待回复',
    nextAction: '二次跟进',
    timeline: [
      {
        id: 't1',
        at: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
        by: '运营',
        note: '发送首条合作私信（置换+佣金）。',
        nextAction: '等待回复 / 48h 跟进',
      },
    ],
  },
  {
    id: 'inf_3',
    nickname: 'GlamWigReview',
    platform: 'YouTube',
    profileUrl: 'https://youtube.com/@glamwigreview',
    country: 'UK',
    followers: 9800,
    contentTypes: ['长测评', '对比评测'],
    productLines: ['高客单', '高品质蕾丝'],
    matchProducts: ['HD Lace 13x6', 'Remy Straight 26"'],
    status: 'cooperating',
    owner: 'Alice',
    potential: 'A',
    email: 'glam@example.com',
    lastFollowUpAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    lastFollowUpNote: '对方报价 $350 + 佣金 10%，需要确认预算',
    nextAction: '安排寄样',
    timeline: [
      {
        id: 't1',
        at: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
        by: '运营',
        note: '对方回复愿意合作，索要报价与寄样流程。',
      },
      {
        id: 't2',
        at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
        by: '运营',
        note: '收到报价：$350 + 10% 佣金，交期 7 天。',
        nextAction: '确认报价',
      },
    ],
    quote: { currency: 'USD', amount: 350, note: '含 1 条长测评 + 1 条 Shorts' },
  },
]

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const role = (session.user as any)?.role as string | undefined
    if (!canAccess(role)) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const sp = request.nextUrl.searchParams
    const search = (sp.get('search') || '').trim().toLowerCase()
    const status = (sp.get('status') || '').trim()
    const owner = (sp.get('owner') || '').trim()
    const take = Math.min(Math.max(Number(sp.get('take') || 500), 1), 1000)

    const where: any = {}
    if (status) where.status = status
    if (owner) where.owner = owner

    const items = await prisma.influencer.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take,
    })

    const mapped = items
      .map((x) => ({
        id: x.id,
        nickname: x.nickname,
        platform: x.platform,
        profileUrl: x.profileUrl || '',
        country: x.country || '',
        followers: x.followers,
        contentTypes: parseJsonArray(x.contentTypes),
        productLines: parseJsonArray(x.productLines),
        matchProducts: parseJsonArray(x.matchProducts),
        status: x.status,
        cooperationLevel: (x as any).cooperationLevel || 'normal',
        owner: x.owner,
        potential: x.potential,
        email: x.email || '',
        whatsapp: x.whatsapp || '',
        phone: x.phone || '',
        instagram: (x as any).instagram || '',
        otherContact: (x as any).otherContact || '',
        language: x.language || '',
        tags: parseJsonArray(x.tags),
        deepRequirements: (x as any).deepRequirements || '',
        deepKeyProducts: parseJsonArray((x as any).deepKeyProducts),
        deepFrequency: (x as any).deepFrequency || '',
        deepNotes: (x as any).deepNotes || '',
        lastFollowUpAt: x.lastFollowUpAt ? x.lastFollowUpAt.toISOString() : undefined,
        lastFollowUpNote: x.lastFollowUpNote || '',
        firstContactAt: x.firstContactAt ? x.firstContactAt.toISOString() : undefined,
        nextFollowUpAt: x.nextFollowUpAt ? x.nextFollowUpAt.toISOString() : undefined,
        nextAction: x.nextAction || '',
        timeline: Array.isArray(x.timeline) ? x.timeline : [],
        quote: x.quote || undefined,
        sample: x.sample || undefined,
        deliverables: x.deliverables || undefined,
        review: x.review || undefined,
        updatedAt: x.updatedAt.toISOString(),
      }))
      .filter((x) => {
        if (!search) return true
        const hay = [
          x.nickname,
          x.email,
          x.profileUrl,
          x.owner,
          x.country,
          x.platform,
          (x.matchProducts || []).join(' '),
          (x.productLines || []).join(' '),
          (x.contentTypes || []).join(' '),
        ]
          .join(' ')
          .toLowerCase()
        return hay.includes(search)
      })

    return NextResponse.json({ items: mapped })
  } catch (e) {
    console.error('获取达人列表失败:', e)
    return NextResponse.json({ error: '获取达人列表失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const role = (session.user as any)?.role as string | undefined
    if (!canManage(role)) return NextResponse.json({ error: '无权限' }, { status: 403 })

    const body = await request.json()
    if (body?.__seed) {
      // 开发期便捷：重置为默认测试数据（写入数据库，所有账号一致）
      await prisma.$transaction([
        prisma.influencer.deleteMany({}),
        prisma.influencer.createMany({
          data: mockSeed.map((x) => ({
            id: x.id,
            nickname: x.nickname,
            platform: x.platform,
            profileUrl: x.profileUrl || null,
            country: x.country || null,
            followers: x.followers || 0,
            contentTypes: JSON.stringify(x.contentTypes || []),
            productLines: JSON.stringify(x.productLines || []),
            matchProducts: JSON.stringify(x.matchProducts || []),
            status: x.status,
            cooperationLevel: (x as any).cooperationLevel || 'normal',
            owner: x.owner,
            potential: x.potential,
            email: (x as any).email || null,
            whatsapp: (x as any).whatsapp || null,
            phone: (x as any).phone || null,
            instagram: (x as any).instagram || null,
            otherContact: (x as any).otherContact || null,
            language: (x as any).language || null,
            tags: JSON.stringify((x as any).tags || []),
            deepRequirements: (x as any).deepRequirements || null,
            deepKeyProducts: JSON.stringify((x as any).deepKeyProducts || []),
            deepFrequency: (x as any).deepFrequency || null,
            deepNotes: (x as any).deepNotes || null,
            lastFollowUpAt: (x as any).lastFollowUpAt ? new Date((x as any).lastFollowUpAt) : null,
            lastFollowUpNote: (x as any).lastFollowUpNote || null,
            firstContactAt: (x as any).firstContactAt ? new Date((x as any).firstContactAt) : null,
            nextFollowUpAt: (x as any).nextFollowUpAt ? new Date((x as any).nextFollowUpAt) : null,
            nextAction: (x as any).nextAction || null,
            timeline: Array.isArray((x as any).timeline) ? (x as any).timeline : [],
            quote: (x as any).quote || null,
            sample: (x as any).sample || null,
            deliverables: (x as any).deliverables || null,
            review: (x as any).review || null,
          })),
        }),
      ])
      return NextResponse.json({ success: true })
    }
    const nickname = String(body.nickname || '').trim()
    if (!nickname) return NextResponse.json({ error: '昵称不能为空' }, { status: 400 })

    const created = await prisma.influencer.create({
      data: {
        nickname,
        platform: String(body.platform || 'TikTok'),
        profileUrl: body.profileUrl ? String(body.profileUrl) : null,
        country: body.country ? String(body.country) : null,
        followers: Number(body.followers || 0) || 0,
        contentTypes: parseJsonArrayStr(body.contentTypes),
        productLines: parseJsonArrayStr(body.productLines),
        matchProducts: parseJsonArrayStr(body.matchProducts),
        status: String(body.status || 'to_outreach'),
        cooperationLevel: String(body.cooperationLevel || 'normal'),
        owner: String(body.owner || (session.user as any)?.name || session.user?.email || '运营'),
        potential: String(body.potential || 'C'),
        email: body.email ? String(body.email) : null,
        whatsapp: body.whatsapp ? String(body.whatsapp) : null,
        phone: body.phone ? String(body.phone) : null,
        instagram: body.instagram ? String(body.instagram) : null,
        otherContact: body.otherContact ? String(body.otherContact) : null,
        language: body.language ? String(body.language) : null,
        tags: JSON.stringify(parseJsonArray(body.tags)),
        nextAction: body.nextAction ? String(body.nextAction) : null,
        timeline: Array.isArray(body.timeline) ? body.timeline : [],
        deepRequirements: body.deepRequirements ? String(body.deepRequirements) : null,
        deepKeyProducts: parseJsonArrayStr(body.deepKeyProducts),
        deepFrequency: body.deepFrequency ? String(body.deepFrequency) : null,
        deepNotes: body.deepNotes ? String(body.deepNotes) : null,
      },
    })

    return NextResponse.json({ id: created.id })
  } catch (e) {
    console.error('创建达人失败:', e)
    return NextResponse.json({ error: '创建达人失败' }, { status: 500 })
  }
}

