import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const canAccess = (role?: string) => {
  const allowed = ['admin', 'boss', 'product', 'operator', 'bd', 'viewer']
  return allowed.includes(role || '')
}

const canManage = (role?: string) => {
  const allowed = ['admin', 'product', 'operator', 'bd']
  return allowed.includes(role || '')
}

// 安全解析 Prisma Json 字段：Prisma 返回的 Json 字段已经是数组/对象
const parseJsonArray = (value: unknown): string[] => {
  // 如果已经是数组，直接返回字符串映射
  if (Array.isArray(value)) {
    return value.map((x) => String(x)).filter(Boolean)
  }
  // 如果是字符串（旧数据兼容），尝试解析
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean)
    } catch {
      // 解析失败，按逗号分割
      return value.split(/[,/;\n]/).map(s => s.trim()).filter(Boolean)
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

    console.log('[GET /api/influencers] 开始查询, take=', take)

    // 先尝试简单查询（不带关联）
    let items: any[]
    try {
      items = await prisma.influencer.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take,
      })
      console.log('[GET /api/influencers] 基础查询成功, 条数:', items.length)
    } catch (queryError: any) {
      console.error('[GET /api/influencers] 基础查询失败:', queryError?.message, queryError?.code)
      throw new Error(`基础查询失败: ${queryError?.message}`)
    }

    // 如果有数据，再查询寄样记录
    // 先给每个 item 添加默认的 sampleShipments 空数组，防止后续处理出错
    let itemsWithShipments: any[] = items.map(item => ({ ...item, sampleShipments: [] }))
    if (items.length > 0) {
      try {
        const itemsWithRelations = await prisma.influencer.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          take,
          include: {
            sampleShipments: {
              orderBy: { sampleRound: 'asc' },
              include: { items: true },
            },
          },
        })
        itemsWithShipments = itemsWithRelations
        console.log('[GET /api/influencers] 关联查询成功')
      } catch (includeError: any) {
        console.error('[GET /api/influencers] 关联查询失败:', includeError?.message, includeError?.code)
        // 关联查询失败，使用已设置好默认 sampleShipments 的基础数据继续
      }
    }

    console.log('[GET /api/influencers] 开始映射数据, 条数:', itemsWithShipments.length)

    const mapped = itemsWithShipments
      .map((x, index) => {
        try {
          // 计算寄样记录摘要
          const shipments = x.sampleShipments || []
          const totalShipments = shipments.length
          const lastShipment = totalShipments > 0 ? shipments[totalShipments - 1] : null
          const lastShipmentDate = lastShipment?.sampleDate
          const lastShipmentStatus = lastShipment?.status

          // 逐个字段处理，便于定位错误
          const result: any = { id: x.id }
          
          try { result.nickname = x.nickname } catch (e) { console.error(`[map] nickname 字段错误, id=${x.id}:`, e) }
          try { result.platform = x.platform } catch (e) { console.error(`[map] platform 字段错误, id=${x.id}:`, e) }
          try { result.profileUrl = x.profileUrl || '' } catch (e) { console.error(`[map] profileUrl 字段错误, id=${x.id}:`, e) }
          try { result.country = x.country || '' } catch (e) { console.error(`[map] country 字段错误, id=${x.id}:`, e) }
          try { result.followers = x.followers } catch (e) { console.error(`[map] followers 字段错误, id=${x.id}:`, e) }
          try { result.contentTypes = parseJsonArray(x.contentTypes) } catch (e) { console.error(`[map] contentTypes 字段错误, id=${x.id}:`, e); result.contentTypes = [] }
          try { result.productLines = parseJsonArray(x.productLines) } catch (e) { console.error(`[map] productLines 字段错误, id=${x.id}:`, e); result.productLines = [] }
          try { result.matchProducts = parseJsonArray(x.matchProducts) } catch (e) { console.error(`[map] matchProducts 字段错误, id=${x.id}:`, e); result.matchProducts = [] }
          try { result.status = x.status } catch (e) { console.error(`[map] status 字段错误, id=${x.id}:`, e) }
          try { result.cooperationLevel = (x as any).cooperationLevel || 'normal' } catch (e) { console.error(`[map] cooperationLevel 字段错误, id=${x.id}:`, e) }
          try { result.owner = x.owner } catch (e) { console.error(`[map] owner 字段错误, id=${x.id}:`, e) }
          try { result.potential = x.potential } catch (e) { console.error(`[map] potential 字段错误, id=${x.id}:`, e) }
          try { result.email = x.email || '' } catch (e) { console.error(`[map] email 字段错误, id=${x.id}:`, e) }
          try { result.whatsapp = x.whatsapp || '' } catch (e) { console.error(`[map] whatsapp 字段错误, id=${x.id}:`, e) }
          try { result.phone = x.phone || '' } catch (e) { console.error(`[map] phone 字段错误, id=${x.id}:`, e) }
          try { result.instagram = (x as any).instagram || '' } catch (e) { console.error(`[map] instagram 字段错误, id=${x.id}:`, e) }
          try { result.otherContact = (x as any).otherContact || '' } catch (e) { console.error(`[map] otherContact 字段错误, id=${x.id}:`, e) }
          try { result.language = x.language || '' } catch (e) { console.error(`[map] language 字段错误, id=${x.id}:`, e) }
          try { result.tags = parseJsonArray(x.tags) } catch (e) { console.error(`[map] tags 字段错误, id=${x.id}:`, e); result.tags = [] }
          try { result.deepRequirements = (x as any).deepRequirements || '' } catch (e) { console.error(`[map] deepRequirements 字段错误, id=${x.id}:`, e) }
          try { result.deepKeyProducts = parseJsonArray((x as any).deepKeyProducts) } catch (e) { console.error(`[map] deepKeyProducts 字段错误, id=${x.id}:`, e); result.deepKeyProducts = [] }
          try { result.deepFrequency = (x as any).deepFrequency || '' } catch (e) { console.error(`[map] deepFrequency 字段错误, id=${x.id}:`, e) }
          try { result.deepNotes = (x as any).deepNotes || '' } catch (e) { console.error(`[map] deepNotes 字段错误, id=${x.id}:`, e) }
          try { result.lastFollowUpAt = x.lastFollowUpAt ? x.lastFollowUpAt.toISOString() : undefined } catch (e) { console.error(`[map] lastFollowUpAt 字段错误, id=${x.id}:`, e) }
          try { result.lastFollowUpNote = x.lastFollowUpNote || '' } catch (e) { console.error(`[map] lastFollowUpNote 字段错误, id=${x.id}:`, e) }
          try { result.firstContactAt = x.firstContactAt ? x.firstContactAt.toISOString() : undefined } catch (e) { console.error(`[map] firstContactAt 字段错误, id=${x.id}:`, e) }
          try { result.nextFollowUpAt = x.nextFollowUpAt ? x.nextFollowUpAt.toISOString() : undefined } catch (e) { console.error(`[map] nextFollowUpAt 字段错误, id=${x.id}:`, e) }
          try { result.nextAction = x.nextAction || '' } catch (e) { console.error(`[map] nextAction 字段错误, id=${x.id}:`, e) }
          try { result.timeline = Array.isArray(x.timeline) ? x.timeline : [] } catch (e) { console.error(`[map] timeline 字段错误, id=${x.id}:`, e); result.timeline = [] }
          try { result.quote = x.quote || undefined } catch (e) { console.error(`[map] quote 字段错误, id=${x.id}:`, e) }
          try { result.sample = x.sample || undefined } catch (e) { console.error(`[map] sample 字段错误, id=${x.id}:`, e) }
          try { result.deliverables = x.deliverables || undefined } catch (e) { console.error(`[map] deliverables 字段错误, id=${x.id}:`, e) }
          try { result.review = x.review || undefined } catch (e) { console.error(`[map] review 字段错误, id=${x.id}:`, e) }
          try { result.updatedAt = x.updatedAt.toISOString() } catch (e) { console.error(`[map] updatedAt 字段错误, id=${x.id}:`, e) }
          
          // 寄样记录摘要
          result.sampleShipmentSummary = {
            totalCount: totalShipments,
            lastDate: lastShipmentDate ? lastShipmentDate.toISOString() : undefined,
            lastStatus: lastShipmentStatus,
          }

          return result
        } catch (mapError: any) {
          console.error(`[GET /api/influencers] 映射第 ${index} 条数据失败, id=${x?.id}:`, mapError?.message)
          // 返回最小化的数据，避免整个接口挂掉
          return {
            id: x?.id || `error_${index}`,
            nickname: x?.nickname || '数据错误',
            platform: x?.platform || 'Unknown',
            status: x?.status || 'unknown',
            owner: x?.owner || 'unknown',
            followers: 0,
            contentTypes: [],
            productLines: [],
            matchProducts: [],
            tags: [],
            deepKeyProducts: [],
            timeline: [],
          }
        }
      })
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

    console.log('[GET /api/influencers] 映射完成, 返回条数:', mapped.length)
    return NextResponse.json({ items: mapped })
  } catch (e: any) {
    console.error('[GET /api/influencers] 整体错误:', e?.message, e?.stack)
    return NextResponse.json({ 
      error: '获取达人列表失败', 
      detail: e?.message,
      code: e?.code,
    }, { status: 500 })
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

    // 辅助函数：确保是数组
    const ensureArray = (value: unknown): string[] => {
      if (Array.isArray(value)) return value.map(String)
      if (typeof value === 'string' && value.trim()) {
        try {
          const parsed = JSON.parse(value)
          if (Array.isArray(parsed)) return parsed.map(String)
        } catch {
          return value.split(/[,/;\n]/).map(s => s.trim()).filter(Boolean)
        }
      }
      return []
    }

    const created = await prisma.influencer.create({
      data: {
        nickname,
        platform: String(body.platform || 'TikTok'),
        profileUrl: body.profileUrl ? String(body.profileUrl) : null,
        country: body.country ? String(body.country) : null,
        followers: Number(body.followers || 0) || 0,
        contentTypes: ensureArray(body.contentTypes) as any,
        productLines: ensureArray(body.productLines) as any,
        matchProducts: ensureArray(body.matchProducts) as any,
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
        tags: ensureArray(body.tags) as any,
        nextAction: body.nextAction ? String(body.nextAction) : null,
        timeline: Array.isArray(body.timeline) ? body.timeline : [],
        quote: body.quote || null,
        sample: body.sample || null,
        deepRequirements: body.deepRequirements ? String(body.deepRequirements) : null,
        deepKeyProducts: ensureArray(body.deepKeyProducts) as any,
        deepFrequency: body.deepFrequency ? String(body.deepFrequency) : null,
        deepNotes: body.deepNotes ? String(body.deepNotes) : null,
      },
    })

    return NextResponse.json({ id: created.id })
  } catch (e: any) {
    console.error('创建达人失败:', e)
    // 返回详细错误信息
    const errorMessage = e?.message || '创建达人失败'
    const errorCode = e?.code
    
    // Prisma 错误处理
    if (errorCode === 'P2002') {
      return NextResponse.json({ error: '该达人已存在（昵称或链接重复）' }, { status: 400 })
    }
    if (errorCode === 'P2003') {
      return NextResponse.json({ error: '关联数据不存在' }, { status: 400 })
    }
    if (errorCode?.startsWith('P')) {
      return NextResponse.json({ error: `数据库错误: ${errorCode}` }, { status: 500 })
    }
    
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
