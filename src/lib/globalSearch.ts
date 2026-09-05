import { prisma } from '@/lib/prisma'
import { canViewTeamWorkTasks } from '@/lib/permissions'
import { canAccessPage, type SessionPermissionContext } from '@/lib/pagePermissions'

export type GlobalSearchGroupLabel = '商品' | '采购' | '供应商' | '新品开发' | '达人' | '任务'

export type GlobalSearchResult = {
  id: string
  group: GlobalSearchGroupLabel
  title: string
  subtitle: string
  meta: string
  href: string
  score: number
}

export type GlobalSearchGroup = {
  label: GlobalSearchGroupLabel
  items: GlobalSearchResult[]
}

type ScoredResult = GlobalSearchResult & {
  sortText: string
  fieldPriority: number
}

const GROUP_ORDER: GlobalSearchGroupLabel[] = ['商品', '采购', '供应商', '新品开发', '达人', '任务']
const PER_GROUP_LIMIT = 5

function normalize(value: string | null | undefined) {
  return (value || '').trim()
}

function normalizeKey(value: string | null | undefined) {
  return normalize(value).toLowerCase()
}

function matchScore(value: string | null | undefined, query: string) {
  const text = normalizeKey(value)
  const q = normalizeKey(query)
  if (!text || !q) return 0
  if (text === q) return 300
  if (text.startsWith(q)) return 200
  if (text.includes(q)) return 100
  return 0
}

function compareResult(a: ScoredResult, b: ScoredResult) {
  if (b.score !== a.score) return b.score - a.score
  if (b.fieldPriority !== a.fieldPriority) return b.fieldPriority - a.fieldPriority
  return a.sortText.localeCompare(b.sortText, 'zh-CN')
}

function topResults(items: ScoredResult[], limit = PER_GROUP_LIMIT): GlobalSearchResult[] {
  return items
    .filter((item) => item.score > 0)
    .sort(compareResult)
    .slice(0, limit)
    .map(({ sortText: _sortText, fieldPriority: _fieldPriority, ...item }) => item)
}

function bestResult(current: ScoredResult | undefined, next: ScoredResult) {
  if (!current) return next
  return compareResult(current, next) <= 0 ? current : next
}

async function searchProducts(query: string) {
  const [products, aliases] = await Promise.all([
    prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { sku: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, sku: true, name: true },
      orderBy: [{ sku: 'asc' }, { name: 'asc' }],
      take: 15,
    }),
    prisma.productSkuAlias.findMany({
      where: {
        aliasSku: { contains: query, mode: 'insensitive' },
        product: { isActive: true },
      },
      select: {
        aliasSku: true,
        product: { select: { id: true, sku: true, name: true } },
      },
      orderBy: { aliasSku: 'asc' },
      take: 15,
    }),
  ])

  const byProductId = new Map<string, ScoredResult>()

  products.forEach((product) => {
    const skuScore = matchScore(product.sku, query)
    const nameScore = matchScore(product.name, query)
    const score = Math.max(skuScore, nameScore)
    const fieldPriority = skuScore === score ? 40 : 20
    const meta = skuScore === score ? '商品 · SKU' : '商品 · 名称'
    byProductId.set(product.id, bestResult(byProductId.get(product.id), {
      id: `product:${product.id}`,
      group: '商品',
      title: product.name,
      subtitle: product.sku || '无 SKU',
      meta,
      href: `/dashboard/products/${product.id}`,
      score,
      fieldPriority,
      sortText: `${product.sku || ''} ${product.name}`,
    }))
  })

  aliases.forEach((alias) => {
    const score = matchScore(alias.aliasSku, query)
    const product = alias.product
    byProductId.set(product.id, bestResult(byProductId.get(product.id), {
      id: `product-alias:${product.id}:${alias.aliasSku}`,
      group: '商品',
      title: product.name,
      subtitle: product.sku || '无 SKU',
      meta: `商品 · 通过 Alias ${alias.aliasSku} 命中`,
      href: `/dashboard/products/${product.id}`,
      score,
      fieldPriority: 30,
      sortText: `${product.sku || ''} ${product.name}`,
    }))
  })

  return topResults(Array.from(byProductId.values()))
}

async function searchPurchases(query: string) {
  const [orders, items] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { orderNo: { contains: query, mode: 'insensitive' } },
      select: {
        id: true,
        orderNo: true,
        status: true,
        supplierNameSnapshot: true,
        supplier: { select: { name: true } },
      },
      orderBy: [{ orderNo: 'asc' }],
      take: 10,
    }),
    prisma.purchaseOrderItem.findMany({
      where: {
        OR: [
          { skuSnapshot: { contains: query, mode: 'insensitive' } },
          { productNameSnapshot: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        skuSnapshot: true,
        productNameSnapshot: true,
        purchaseOrder: {
          select: {
            orderNo: true,
            status: true,
            supplierNameSnapshot: true,
            supplier: { select: { name: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 10,
    }),
  ])

  return topResults([
    ...orders.map((order): ScoredResult => ({
      id: `purchase-order:${order.id}`,
      group: '采购',
      title: order.orderNo,
      subtitle: `${order.supplier?.name || order.supplierNameSnapshot || '未填写'} · ${order.status}`,
      meta: '采购单',
      href: '/dashboard/inventory-purchasing',
      score: matchScore(order.orderNo, query),
      fieldPriority: 40,
      sortText: order.orderNo,
    })),
    ...items.map((item): ScoredResult => {
      const skuScore = matchScore(item.skuSnapshot, query)
      const nameScore = matchScore(item.productNameSnapshot, query)
      return {
        id: `purchase-item:${item.id}`,
        group: '采购',
        title: item.purchaseOrder.orderNo,
        subtitle: `${item.productNameSnapshot} · ${item.purchaseOrder.status}`,
        meta: skuScore >= nameScore ? '采购记录 · SKU Snapshot' : '采购记录 · 商品快照',
        href: '/dashboard/inventory-purchasing',
        score: Math.max(skuScore, nameScore),
        fieldPriority: skuScore >= nameScore ? 30 : 20,
        sortText: `${item.purchaseOrder.orderNo} ${item.productNameSnapshot}`,
      }
    }),
  ])
}

async function searchSuppliers(query: string) {
  const suppliers = await prisma.supplier.findMany({
    where: { name: { contains: query, mode: 'insensitive' } },
    select: { id: true, name: true, isActive: true },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    take: 10,
  })

  return topResults(suppliers.map((supplier): ScoredResult => ({
    id: `supplier:${supplier.id}`,
    group: '供应商',
    title: supplier.name,
    subtitle: supplier.isActive ? '启用' : '已停用',
    meta: '供应商 · 名称',
    href: '/dashboard/inventory-purchasing',
    score: matchScore(supplier.name, query),
    fieldPriority: 30,
    sortText: supplier.name,
  })))
}

async function searchOpportunities(query: string) {
  const opportunities = await prisma.productOpportunity.findMany({
    where: { name: { contains: query, mode: 'insensitive' } },
    select: { id: true, name: true, status: true, priority: true },
    orderBy: [{ status: 'asc' }, { priority: 'asc' }, { name: 'asc' }],
    take: 10,
  })

  return topResults(opportunities.map((opportunity): ScoredResult => ({
    id: `opportunity:${opportunity.id}`,
    group: '新品开发',
    title: opportunity.name,
    subtitle: `${opportunity.status} · ${opportunity.priority}`,
    meta: '新品开发 · 名称',
    href: '/dashboard/products/opportunities',
    score: matchScore(opportunity.name, query),
    fieldPriority: 30,
    sortText: opportunity.name,
  })))
}

async function searchInfluencers(query: string) {
  const influencers = await prisma.influencer.findMany({
    where: {
      OR: [
        { nickname: { contains: query, mode: 'insensitive' } },
        { instagram: { contains: query, mode: 'insensitive' } },
        { profileUrl: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: { id: true, nickname: true, platform: true, instagram: true, profileUrl: true, status: true },
    orderBy: [{ nickname: 'asc' }],
    take: 10,
  })

  return topResults(influencers.map((influencer): ScoredResult => {
    const nicknameScore = matchScore(influencer.nickname, query)
    const instagramScore = matchScore(influencer.instagram, query)
    return {
      id: `influencer:${influencer.id}`,
      group: '达人',
      title: influencer.nickname,
      subtitle: `${influencer.platform} · ${influencer.status}`,
      meta: instagramScore > nicknameScore ? '达人 · Instagram' : '达人 · 昵称',
      href: `/dashboard/influencers?influencerId=${encodeURIComponent(influencer.id)}`,
      score: Math.max(nicknameScore, instagramScore, matchScore(influencer.profileUrl ?? '', query)),
      fieldPriority: instagramScore > nicknameScore ? 20 : 30,
      sortText: influencer.nickname,
    }
  }))
}

async function searchWorkTasks(query: string, ctx: SessionPermissionContext, currentUserId: string | null) {
  const searchWhere = {
    OR: [
      { title: { contains: query, mode: 'insensitive' as const } },
      { taskKey: { contains: query, mode: 'insensitive' as const } },
      { relatedEntityId: { contains: query, mode: 'insensitive' as const } },
    ],
  }
  const visibilityWhere = canViewTeamWorkTasks(ctx.role)
    ? {}
    : currentUserId
      ? {
          OR: [
            { creatorUserId: currentUserId },
            { ownerUserId: currentUserId },
            { assigneeUserId: currentUserId },
            { collaboratorUserIds: { has: currentUserId } },
          ],
        }
      : { id: '__no_current_user__' }

  const tasks = await prisma.workTask.findMany({
    where: { AND: [searchWhere, visibilityWhere] },
    select: { id: true, taskKey: true, title: true, status: true, priority: true },
    orderBy: [{ isTodayMustDo: 'desc' }, { dueDate: 'asc' }, { title: 'asc' }],
    take: 10,
  })

  return topResults(tasks.map((task): ScoredResult => {
    const titleScore = matchScore(task.title, query)
    const keyScore = matchScore(task.taskKey, query)
    const score = Math.max(titleScore, keyScore, matchScore(task.id, query))
    return {
      id: `task:${task.id}`,
      group: '任务',
      title: task.title,
      subtitle: `${task.taskKey} · ${task.status}`,
      meta: keyScore >= titleScore ? '任务 · Task Key' : '任务 · 标题',
      href: '/dashboard/workbench',
      score,
      fieldPriority: keyScore >= titleScore ? 30 : 20,
      sortText: `${task.taskKey} ${task.title}`,
    }
  }))
}

export async function searchGlobal(query: string, ctx: SessionPermissionContext, currentUserId: string | null) {
  const q = query.trim().slice(0, 80)
  if (q.length < 2) return []

  const jobs: Array<Promise<GlobalSearchGroup>> = []

  if (canAccessPage(ctx, 'products')) {
    jobs.push(searchProducts(q).then((items) => ({ label: '商品', items })))
  }
  if (canAccessPage(ctx, 'inventoryPurchasing')) {
    jobs.push(searchPurchases(q).then((items) => ({ label: '采购', items })))
    jobs.push(searchSuppliers(q).then((items) => ({ label: '供应商', items })))
  }
  if (canAccessPage(ctx, 'productOpportunities')) {
    jobs.push(searchOpportunities(q).then((items) => ({ label: '新品开发', items })))
  }
  if (canAccessPage(ctx, 'influencers')) {
    jobs.push(searchInfluencers(q).then((items) => ({ label: '达人', items })))
  }
  if (canAccessPage(ctx, 'workbench')) {
    jobs.push(searchWorkTasks(q, ctx, currentUserId).then((items) => ({ label: '任务', items })))
  }

  const groups = await Promise.all(jobs)
  return groups
    .filter((group) => group.items.length > 0)
    .sort((a, b) => GROUP_ORDER.indexOf(a.label) - GROUP_ORDER.indexOf(b.label))
}
