import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const getAssigneeSnapshot = (session: any) =>
  (session?.user as any)?.name || (session?.user as any)?.email || ''

function toLocalDateKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysDiffFromNow(iso?: string | Date | null) {
  if (!iso) return null
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (!d || Number.isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function endOfTodayDueDate(now = new Date()) {
  const d = new Date(now)
  d.setHours(18, 0, 0, 0)
  return d
}

function nextDueDate(fromDue: Date) {
  const d = new Date(fromDue)
  d.setDate(d.getDate() + 1)
  d.setHours(18, 0, 0, 0)
  return d
}

function buildTaskKey(opts: { ruleKey: string; sourceModule: string; relatedEntityId: string; assigneeUserId: string; dayKey: string }) {
  return `auto:${opts.dayKey}:${opts.sourceModule}:${opts.ruleKey}:${opts.relatedEntityId}:${opts.assigneeUserId}`
}

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

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 })

  // 任务对所有人可见，但生成动作只依赖"当前已登录用户触发"
  const role = (session.user as any)?.role as string | undefined
  if (!role) return NextResponse.json({ error: '用户信息缺失' }, { status: 400 })

  const now = new Date()
  const dayKey = toLocalDateKey(now)
  const dueDate = endOfTodayDueDate(now)

  // 1) 延续任务：到期未完成的 -> 已延期 + dueDate 顺延
  const overdue = await prisma.workTask.findMany({
    where: { status: { in: ['待做', '进行中', '已延期'] }, dueDate: { lt: now } },
    take: 200,
  })

  for (const t of overdue) {
    const original = t.originalDueDate ?? t.dueDate
    const newDue = nextDueDate(t.dueDate)
    await prisma.workTask.update({
      where: { id: t.id },
      data: {
        status: '已延期',
        originalDueDate: original,
        delayDays: (t.delayDays || 0) + 1,
        dueDate: newDue,
      },
    })
  }

  // 2) 自动生成产品任务
  const products = await prisma.product.findMany({
    include: { tiktokSync: true },
  })

  // 预先拉取所有达人，用于"主推待建联/出片后复盘"
  const influencers = await prisma.influencer.findMany({
    take: 2000,
    orderBy: { updatedAt: 'desc' },
  })

  // 预先拉取脚本与拆解信息，用于"已有脚本/补分镜"自动补齐产品时间戳
  const skuList = products.map((p) => p.sku).filter((s): s is string => !!s)
  const scripts = await prisma.viralScript.findMany({
    where: { productSku: { in: skuList } },
    select: { id: true, productSku: true, title: true },
  })
  const scriptIds = scripts.map((s) => s.id)
  const scriptAnalyses = scriptIds.length
    ? await prisma.scriptUserAnalysis.findMany({
        where: { scriptId: { in: scriptIds } },
        select: { id: true, scriptId: true, userId: true, isLearned: true, isPracticing: true, submitStatus: true, storyboard: true },
      })
    : []

  // 用户信息：用于脚本任务指派人快照
  const scriptUserIdSet = new Set(scriptAnalyses.map((a) => a.userId))
  const scriptUsers = scriptUserIdSet.size
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(scriptUserIdSet) } },
        select: { id: true, name: true, email: true },
      })
    : []
  const userIdToAssignee = Object.fromEntries(scriptUsers.map((u) => [u.id, (u.name || u.email || '').trim()]))

  const createOrUpdateAutoTask = async (args: {
    ruleKey: string
    sourceModule: string
    relatedEntityId: string
    assigneeUserId: string
    assigneeName: string
    title: string
    priority: string
    note?: string | null
  }) => {
    if (!args.assigneeUserId) return
    const taskKey = buildTaskKey({
      ruleKey: args.ruleKey,
      sourceModule: args.sourceModule,
      relatedEntityId: args.relatedEntityId,
      assigneeUserId: args.assigneeUserId,
      dayKey,
    })

    const existing = await prisma.workTask.findUnique({ where: { taskKey }, select: { status: true } })
    if (existing?.status === '已完成') return

    await prisma.workTask.upsert({
      where: { taskKey },
      update: {
        title: args.title,
        priority: args.priority,
        note: args.note ?? null,
        assigneeUserId: args.assigneeUserId,
        assigneeName: args.assigneeName,
        dueDate,
        // 不覆盖状态，避免用户手动完成后被重置
      },
      create: {
        taskKey,
        title: args.title,
        sourceModule: args.sourceModule,
        priority: args.priority,
        assigneeUserId: args.assigneeUserId,
        assigneeName: args.assigneeName,
        dueDate,
        status: '待做',
        relatedEntityId: args.relatedEntityId,
        note: args.note ?? null,
      },
    })
  }

  // 产品时间戳自动补齐：脚本/分镜/建联/出片（只补齐缺失，不回滚）
  for (const p of products) {
    if (p.sku && !p.scriptReadyAt) {
      const hasScript = scripts.some((s) => s.productSku === p.sku)
      if (hasScript) {
        await prisma.product.update({ where: { id: p.id }, data: { scriptReadyAt: dueDate } })
      }
    }
    if (p.sku && !p.storyboardReadyAt) {
      const relevantScriptIds = scripts.filter((s) => s.productSku === p.sku).map((s) => s.id)
      const hasStoryboard = scriptAnalyses.some((a) => relevantScriptIds.includes(a.scriptId) && a.storyboard != null)
      if (hasStoryboard) {
        await prisma.product.update({ where: { id: p.id }, data: { storyboardReadyAt: dueDate } })
      }
    }
    if (p.sku && !p.outreachLinkedAt) {
      const related = influencers
        .map((inf) => ({
          inf,
          matches: parseJsonArray((inf as any).matchProducts),
        }))
        .filter((x) => x.matches.includes(p.name) || (p.sku ? x.matches.includes(p.sku) : false))

      const hasLinked = related.some((x) => x.inf.status && x.inf.status !== 'to_outreach')
      if (hasLinked) {
        await prisma.product.update({ where: { id: p.id }, data: { outreachLinkedAt: dueDate } })
      }
    }
    if (p.sku && !p.postedAt) {
      const related = influencers
        .map((inf) => ({
          inf,
          matches: parseJsonArray((inf as any).matchProducts),
        }))
        .filter((x) => x.matches.includes(p.name) || (p.sku ? x.matches.includes(p.sku) : false))

      const hasPosted = related.some((x) => x.inf.status === 'posted' || (x.inf as any).deliverables?.postedAt)
      if (hasPosted) {
        await prisma.product.update({ where: { id: p.id }, data: { postedAt: dueDate } })
      }
    }
  }

  // 再拉一遍，拿到补齐后的字段（用于任务生成）
  const productsLatest = await prisma.product.findMany()

  for (const p of productsLatest) {
    if (p.workflowStatus === '暂停' || p.workflowStatus === '淘汰') continue
    const assigneeName = (p.assignee || '运营').trim()
    // 需要获取用户 ID，这里简化处理，使用 assigneeName 作为查找条件
    const assigneeUser = await prisma.user.findFirst({
      where: { OR: [{ name: assigneeName }, { email: assigneeName }] },
      select: { id: true, name: true, email: true },
    })
    const assigneeUserId = assigneeUser?.id || ''
    const assigneeNameFinal = assigneeUser?.name || assigneeUser?.email || assigneeName

    // 已拿货 3 天未打样
    if (p.pickedUpAt && !p.sampleSentAt) {
      const d = daysDiffFromNow(p.pickedUpAt)
      if (d != null && d >= 3) {
        await createOrUpdateAutoTask({
          ruleKey: 'pickup_not_sample',
          sourceModule: '产品',
          relatedEntityId: p.id,
          assigneeUserId,
          assigneeName: assigneeNameFinal,
          title: `【产品】${p.name}：已拿货${d}天未打样`,
          priority: '高',
          note: '请安排样品流程并记录打样时间（更新产品推进字段）。',
        })
      }
    }

    // 已打样 2 天未确认主推
    if (p.sampleSentAt && !p.mainConfirmedAt) {
      const d = daysDiffFromNow(p.sampleSentAt)
      if (d != null && d >= 2) {
        await createOrUpdateAutoTask({
          ruleKey: 'sample_not_main_confirm',
          sourceModule: '产品',
          relatedEntityId: p.id,
          assigneeUserId,
          assigneeName: assigneeNameFinal,
          title: `【产品】${p.name}：已打样${d}天未确认主推`,
          priority: '高',
          note: '请在产品推进看板中确认主推，并同步给达人建联/脚本拆解负责人。',
        })
      }
    }

    // 已确认主推但未建联达人
    if (p.mainConfirmedAt && !p.outreachLinkedAt) {
      await createOrUpdateAutoTask({
        ruleKey: 'main_confirm_not_outreach',
        sourceModule: '产品',
        relatedEntityId: p.id,
        assigneeUserId,
        assigneeName: assigneeNameFinal,
        title: `【产品】${p.name}：已确认主推但未建联达人`,
        priority: '中',
        note: '请指定达人并发起建联；建联进度将反向补齐产品推进字段。',
      })

      // 联动：主推 -> 为匹配达人生成"开始建联"任务（to_outreach）
      const relatedInfluencers = influencers
        .map((inf) => ({
          inf,
          matches: parseJsonArray((inf as any).matchProducts),
        }))
        .filter((x) => x.matches.includes(p.name) || (p.sku ? x.matches.includes(p.sku) : false))
        .filter((x) => x.inf.status === 'to_outreach')

      for (const x of relatedInfluencers.slice(0, 5)) {
        const ownerName = (x.inf.owner || '运营').trim()
        const ownerUser = await prisma.user.findFirst({
          where: { OR: [{ name: ownerName }, { email: ownerName }] },
          select: { id: true, name: true, email: true },
        })
        const ownerUserId = ownerUser?.id || ''
        const ownerNameFinal = ownerUser?.name || ownerUser?.email || ownerName
        
        await createOrUpdateAutoTask({
          ruleKey: 'main_confirm_to_build_outreach',
          sourceModule: '达人建联',
          relatedEntityId: x.inf.id,
          assigneeUserId: ownerUserId,
          assigneeName: ownerNameFinal,
          title: `【达人建联】${x.inf.nickname}：产品${p.name}主推待建联`,
          priority: '高',
          note: `请发起首条建联：状态从「待建联」推进到「已发送/已寄样」并更新跟进记录。`,
        })
      }
    }

    // 已建联达人但未出片
    if (p.outreachLinkedAt && !p.postedAt) {
      await createOrUpdateAutoTask({
        ruleKey: 'outreach_not_posted',
        sourceModule: '产品',
        relatedEntityId: p.id,
        assigneeUserId,
        assigneeName: assigneeNameFinal,
        title: `【产品】${p.name}：已建联达人但未出片`,
        priority: '高',
        note: '请催出片并跟进达人发布时间，出片后可触发复盘任务。',
      })
    }

    // 已有脚本但未补分镜
    if (p.scriptReadyAt && !p.storyboardReadyAt) {
      await createOrUpdateAutoTask({
        ruleKey: 'script_not_storyboard',
        sourceModule: '产品',
        relatedEntityId: p.id,
        assigneeUserId,
        assigneeName: assigneeNameFinal,
        title: `【产品】${p.name}：已有脚本但未补分镜`,
        priority: '中',
        note: '请补齐分镜执行表并记录到产品推进字段（已有分镜/分镜时间）。',
      })
    }
  }

  // 3) 自动生成达人建联任务
  for (const inf of influencers) {
    const ownerName = (inf.owner || '运营').trim()
    const ownerUser = await prisma.user.findFirst({
      where: { OR: [{ name: ownerName }, { email: ownerName }] },
      select: { id: true, name: true, email: true },
    })
    const assigneeUserId = ownerUser?.id || ''
    const assigneeName = ownerUser?.name || ownerUser?.email || ownerName
    
    const last = inf.lastFollowUpAt || (inf as any).sample?.sentAt || (inf as any).deliverables?.postedAt || (inf as any).firstContactAt
    const d = daysDiffFromNow(last as any)

    if (inf.status === 'sent') {
      if (d != null && d >= 3) {
        await createOrUpdateAutoTask({
          ruleKey: 'sent_not_replied',
          sourceModule: '达人建联',
          relatedEntityId: inf.id,
          assigneeUserId,
          assigneeName,
          title: `【达人建联】${inf.nickname}：已发送超过 3 天未回复`,
          priority: '高',
          note: `当前建议：${inf.nextAction || '二次跟进'}。请更新跟进记录/回复状态。`,
        })
      }
    }

    if (inf.status === 'sample_sent') {
      const sd = daysDiffFromNow((inf as any).sample?.sentAt)
      if (sd != null && sd >= 5) {
        await createOrUpdateAutoTask({
          ruleKey: 'sample_sent_not_confirm',
          sourceModule: '达人建联',
          relatedEntityId: inf.id,
          assigneeUserId,
          assigneeName,
          title: `【达人建联】${inf.nickname}：已寄样超过 5 天未推进`,
          priority: '高',
          note: `当前建议：确认签收/意向并推进出片排期。`,
        })
      }
    }

    if (inf.status === 'cooperating') {
      const fd = daysDiffFromNow(inf.lastFollowUpAt)
      if (fd == null || fd >= 2) {
        await createOrUpdateAutoTask({
          ruleKey: 'cooperating_no_followup',
          sourceModule: '达人建联',
          relatedEntityId: inf.id,
          assigneeUserId,
          assigneeName,
          title: `【达人建联】${inf.nickname}：合作中超过 2 天无跟进`,
          priority: '中',
          note: `当前建议：推进脚本确认/寄样或排期，并更新下一步动作。`,
        })
      }
    }

    // 联动：出片后生成复盘任务（给达人负责人）
    const hasPosted = inf.status === 'posted' || (inf as any).deliverables?.postedAt
    if (hasPosted) {
      await createOrUpdateAutoTask({
        ruleKey: 'after_posted_review',
        sourceModule: '经营数据',
        relatedEntityId: inf.id,
        assigneeUserId,
        assigneeName,
        title: `【复盘】${inf.nickname}：出片后复盘合作`,
        priority: '中',
        note: '请在达人详情中补充复盘总结/评分，并同步下一步合作策略。',
      })
    }
  }

  // 4) 自动生成脚本拆解任务
  for (const a of scriptAnalyses) {
    const script = scripts.find((s) => s.id === a.scriptId)
    if (!script) continue
    const assignee = userIdToAssignee[a.userId] || '运营'
    const assigneeUser = await prisma.user.findFirst({
      where: { OR: [{ id: a.userId }, { name: assignee }, { email: assignee }] },
      select: { id: true, name: true, email: true },
    })
    const assigneeUserId = assigneeUser?.id || a.userId
    const assigneeName = assigneeUser?.name || assigneeUser?.email || assignee

    // 已学习未练习
    if (a.isLearned && !a.isPracticing) {
      await createOrUpdateAutoTask({
        ruleKey: 'learned_not_practicing',
        sourceModule: '脚本拆解',
        relatedEntityId: script.id,
        assigneeUserId,
        assigneeName,
        title: `【脚本】${script.title}：已学习待开始练习`,
        priority: '中',
        note: '请从"前 3 秒开头 + 节奏"开始做 2 个开头版本对比，并尽快进入练习状态。',
      })
    }

    // 已练习未提交
    if (a.isPracticing && String(a.submitStatus || '') === 'draft') {
      await createOrUpdateAutoTask({
        ruleKey: 'practicing_not_submitted',
        sourceModule: '脚本拆解',
        relatedEntityId: script.id,
        assigneeUserId,
        assigneeName,
        title: `【脚本】${script.title}：练习完成待提交`,
        priority: '高',
        note: '请提交练习成片链接，完成当日闭环。',
      })
    }

    // 负责人点评未复盘（近似：review 状态但没有分镜/复盘记录）
    if (String(a.submitStatus || '') === 'review' && a.storyboard == null) {
      await createOrUpdateAutoTask({
        ruleKey: 'review_not_recap',
        sourceModule: '脚本拆解',
        relatedEntityId: script.id,
        assigneeUserId,
        assigneeName,
        title: `【脚本复盘】${script.title}：等待补齐复盘/分镜执行表`,
        priority: '中',
        note: '请将负责人点评落到"学习状态/复盘记录/分镜执行表"，并更新提交内容。',
      })
    }
  }

  return NextResponse.json({ ok: true })
}