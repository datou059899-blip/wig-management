import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  INVENTORY_SKU_CANDIDATE_DETECTION,
  INVENTORY_SKU_CANDIDATE_RESOLUTION,
  INVENTORY_SKU_CANDIDATE_STATUS,
  strictSkuKey,
} from '@/lib/inventoryPurchasing'
import {
  InventorySkuCandidateError,
  inspectProductSkuIdentity,
  resolveProductSkuIdentityInTransaction,
  type ProductSkuIdentityResolutionAction,
} from '@/lib/inventorySkuCandidates'
import {
  makeTikTokProductSkuPair,
  ORDER_PLATFORM,
  PRODUCT_EXTERNAL_IDENTIFIER_TYPE,
} from '@/lib/order-data-closure'

const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const

type IdentityFailure = {
  row: number
  status: string
  sku: string
  skuId: string | null
  tiktokProductId: string | null
}

type IdentityProduct = {
  id: string
  sku: string | null
  name: string
  isActive: boolean
}

type IdentityAlias = {
  productId: string
  aliasSku: string
}

type ExternalIdentifier = {
  identifierType: string
  identifierValue: string
  productId: string
}

export type OrderIdentityFailureGroup = {
  key: string
  status: string
  inputSku: string
  normalizedSku: string
  tiktokProductId: string | null
  tiktokSkuId: string | null
  occurrenceCount: number
  rows: number[]
  reason: string
  candidateEligible: boolean
  detectionType: string | null
  inactiveProductId: string | null
  inactiveProduct: { id: string; sku: string | null; name: string; isActive: boolean } | null
}

const FAILURE_REASON: Record<string, string> = {
  UNRESOLVED: '未找到可确认的 canonical SKU、Alias 或 TikTok exact identity',
  AMBIGUOUS: '同一身份存在多个可能归属，禁止自动处理',
  IDENTITY_CONFLICT: '商品身份与非商品分类证据冲突',
  HARD_IDENTITY_CONFLICT: 'Seller SKU / Alias 与 TikTok 身份指向不同 Product',
  AMOUNT_CONSTRAINT_FAILED: '订单金额不符合已批准的分类规则',
}

function externalOwnerIdsForOrderIdentity(
  externalIdentifiers: ExternalIdentifier[],
  tiktokProductId: string,
  tiktokSkuId: string,
) {
  const pairValue = makeTikTokProductSkuPair(tiktokProductId, tiktokSkuId)
  return new Set(externalIdentifiers.flatMap((identifier) => {
    const isPair = identifier.identifierType === PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_PRODUCT_SKU_PAIR
      && identifier.identifierValue === pairValue
    const isSkuId = identifier.identifierType === PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_SKU_ID
      && identifier.identifierValue === tiktokSkuId
    return isPair || isSkuId ? [identifier.productId] : []
  }))
}

export function groupOrderIdentityFailures(params: {
  failures: IdentityFailure[]
  products: IdentityProduct[]
  aliases: IdentityAlias[]
  externalIdentifiers: ExternalIdentifier[]
}) {
  const productsById = new Map(params.products.map((product) => [product.id, product]))
  const grouped = new Map<string, OrderIdentityFailureGroup>()

  params.failures.forEach((failure) => {
    const normalizedSku = strictSkuKey(failure.sku)
    const key = [failure.status, normalizedSku, failure.tiktokProductId || '', failure.skuId || ''].join('::')
    const existing = grouped.get(key)
    if (existing) {
      existing.occurrenceCount += 1
      existing.rows.push(failure.row)
      return
    }

    const group: OrderIdentityFailureGroup = {
      key,
      status: failure.status,
      inputSku: failure.sku,
      normalizedSku,
      tiktokProductId: failure.tiktokProductId,
      tiktokSkuId: failure.skuId,
      occurrenceCount: 1,
      rows: [failure.row],
      reason: FAILURE_REASON[failure.status] || '订单身份无法解析',
      candidateEligible: false,
      detectionType: null,
      inactiveProductId: null,
      inactiveProduct: null,
    }

    if (failure.status !== 'UNRESOLVED' || !normalizedSku || !failure.tiktokProductId || !failure.skuId) {
      if (failure.status === 'UNRESOLVED') {
        group.reason = '缺少 Seller SKU 或 TikTok Product ID + SKU ID exact pair，不能建立待处理身份'
      }
      grouped.set(key, group)
      return
    }

    const activeCanonical = params.products.filter((product) => product.isActive && strictSkuKey(product.sku) === normalizedSku)
    const inactiveCanonical = params.products.filter((product) => !product.isActive && strictSkuKey(product.sku) === normalizedSku)
    const activeAlias = params.aliases.flatMap((alias) => (
      strictSkuKey(alias.aliasSku) === normalizedSku && productsById.get(alias.productId)?.isActive
        ? [productsById.get(alias.productId)!]
        : []
    ))
    const inactiveAlias = params.aliases.flatMap((alias) => (
      strictSkuKey(alias.aliasSku) === normalizedSku && productsById.get(alias.productId)?.isActive === false
        ? [productsById.get(alias.productId)!]
        : []
    ))
    const activeOwnerIds = new Set([...activeCanonical, ...activeAlias].map((product) => product.id))
    const inactiveOwnerIds = new Set([...inactiveCanonical, ...inactiveAlias].map((product) => product.id))
    const externalOwnerIds = externalOwnerIdsForOrderIdentity(
      params.externalIdentifiers,
      failure.tiktokProductId,
      failure.skuId,
    )

    if (activeOwnerIds.size > 0 || inactiveOwnerIds.size > 1) {
      group.reason = 'SKU identity 已存在有效归属或存在多个历史归属，不能作为普通新 SKU 处理'
      grouped.set(key, group)
      return
    }

    if (inactiveOwnerIds.size === 1) {
      const inactiveProductId = Array.from(inactiveOwnerIds)[0]
      if (externalOwnerIds.size > 0 && (externalOwnerIds.size !== 1 || !externalOwnerIds.has(inactiveProductId))) {
        group.reason = '历史 SKU identity 与 TikTok exact identity 指向不同 Product'
        grouped.set(key, group)
        return
      }
      const inactiveProduct = productsById.get(inactiveProductId) || null
      group.candidateEligible = true
      group.detectionType = inactiveCanonical.some((product) => product.id === inactiveProductId)
        ? INVENTORY_SKU_CANDIDATE_DETECTION.INACTIVE_CANONICAL
        : INVENTORY_SKU_CANDIDATE_DETECTION.INACTIVE_ALIAS
      group.inactiveProductId = inactiveProductId
      group.inactiveProduct = inactiveProduct
      group.reason = '发现历史商品，请确认是否恢复原 Product'
      grouped.set(key, group)
      return
    }

    if (externalOwnerIds.size > 0) {
      group.reason = 'TikTok exact identity 已被现有 Product 占用，不能作为普通新 SKU 处理'
      grouped.set(key, group)
      return
    }

    group.candidateEligible = true
    group.detectionType = INVENTORY_SKU_CANDIDATE_DETECTION.UNKNOWN
    grouped.set(key, group)
  })

  return Array.from(grouped.values()).sort((a, b) => a.rows[0] - b.rows[0])
}

async function getExternalOwnerProductIds(
  tx: Prisma.TransactionClient,
  shopKey: string,
  tiktokProductId: string,
  tiktokSkuId: string,
) {
  const pairValue = makeTikTokProductSkuPair(tiktokProductId, tiktokSkuId)
  const identifiers = await tx.productExternalIdentifier.findMany({
    where: {
      platform: ORDER_PLATFORM,
      shopKey,
      OR: [
        { identifierType: PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_PRODUCT_SKU_PAIR, identifierValue: pairValue },
        { identifierType: PRODUCT_EXTERNAL_IDENTIFIER_TYPE.TIKTOK_SKU_ID, identifierValue: tiktokSkuId },
      ],
    },
    select: { productId: true },
  })
  return Array.from(new Set(identifiers.map((identifier) => identifier.productId)))
}

export async function createOrderSkuCandidate(input: {
  shopKey: string
  inputSku: string
  tiktokProductId: string
  tiktokSkuId: string
  sourceFileName: string
  occurrenceCount: number
  rows: number[]
}) {
  const shopKey = input.shopKey.trim()
  const inputSku = input.inputSku.trim()
  const normalizedSku = strictSkuKey(inputSku)
  const tiktokProductId = input.tiktokProductId.trim()
  const tiktokSkuId = input.tiktokSkuId.trim()
  const sourceFileName = input.sourceFileName.trim()
  const occurrenceCount = Math.max(1, Math.round(input.occurrenceCount))
  const rows = Array.from(new Set(input.rows.filter((row) => Number.isInteger(row) && row > 0))).sort((a, b) => a - b)
  if (!shopKey || !normalizedSku || !tiktokProductId || !tiktokSkuId || !sourceFileName || rows.length === 0) {
    throw new InventorySkuCandidateError('待处理 SKU evidence 不完整，不能创建记录', 400)
  }

  return prisma.$transaction(async (tx) => {
    const inspection = await inspectProductSkuIdentity(tx, normalizedSku)
    const externalOwnerIds = await getExternalOwnerProductIds(tx, shopKey, tiktokProductId, tiktokSkuId)
    let detectionType: string = INVENTORY_SKU_CANDIDATE_DETECTION.UNKNOWN
    let inactiveProductId: string | null = null

    if (inspection.kind === 'ACTIVE') {
      throw new InventorySkuCandidateError('该 SKU 已可由 Product 或 Alias 解析，请重新执行 checkOnly')
    }
    if (inspection.kind === 'CONFLICT') {
      throw new InventorySkuCandidateError('该 SKU 存在多个历史 Product 归属，不能创建普通待处理项')
    }
    if (inspection.kind === 'INACTIVE') {
      inactiveProductId = inspection.inactiveProductId
      detectionType = inspection.detectionType
      if (externalOwnerIds.length > 0 && (externalOwnerIds.length !== 1 || externalOwnerIds[0] !== inactiveProductId)) {
        throw new InventorySkuCandidateError('历史 SKU identity 与 TikTok exact identity 指向不同 Product')
      }
    } else if (externalOwnerIds.length > 0) {
      throw new InventorySkuCandidateError('TikTok exact identity 已被现有 Product 占用，不能创建普通待处理项')
    }

    const uniqueWhere = {
      platform_shopKey_normalizedSku_tiktokProductId_tiktokSkuId: {
        platform: ORDER_PLATFORM,
        shopKey,
        normalizedSku,
        tiktokProductId,
        tiktokSkuId,
      },
    }
    const candidate = await tx.orderSkuCandidate.upsert({
      where: uniqueWhere,
      create: {
        platform: ORDER_PLATFORM,
        shopKey,
        inputSku,
        normalizedSku,
        tiktokProductId,
        tiktokSkuId,
        sourceFileName,
        occurrenceCount,
        evidence: { rows, status: 'UNRESOLVED' },
        detectionType,
        inactiveProductId,
      },
      update: {
        sourceFileName,
        occurrenceCount,
        evidence: { rows, status: 'UNRESOLVED' },
      },
      include: {
        inactiveProduct: { select: { id: true, sku: true, name: true, isActive: true, businessStatus: true } },
        resolvedProduct: { select: { id: true, sku: true, name: true, isActive: true } },
      },
    })
    return candidate
  }, TRANSACTION_OPTIONS)
}

export async function resolveOrderSkuCandidate(input: {
  candidateId: string
  action: ProductSkuIdentityResolutionAction
  actor: string
  productName?: string
  targetProductId?: string
  confirmAlias?: boolean
}) {
  const actor = input.actor.trim()
  if (!actor) throw new InventorySkuCandidateError('无法确认当前操作人', 401)
  if (!(['CREATE', 'MAP', 'REACTIVATE'] as const).includes(input.action)) {
    throw new InventorySkuCandidateError('不支持的待处理 SKU 操作', 400)
  }

  return prisma.$transaction(async (tx) => {
    const candidate = await tx.orderSkuCandidate.findUnique({ where: { id: input.candidateId } })
    if (!candidate) throw new InventorySkuCandidateError('订单待处理 SKU 不存在', 404)
    if (candidate.status !== INVENTORY_SKU_CANDIDATE_STATUS.PENDING) {
      throw new InventorySkuCandidateError('该订单待处理 SKU 已被其他操作处理，请重新执行 checkOnly')
    }
    const additionalOwnerProductIds = await getExternalOwnerProductIds(
      tx,
      candidate.shopKey,
      candidate.tiktokProductId,
      candidate.tiktokSkuId,
    )
    const resolution = await resolveProductSkuIdentityInTransaction(tx, {
      action: input.action,
      inputSku: candidate.inputSku,
      normalizedSku: candidate.normalizedSku,
      detectionType: candidate.detectionType,
      inactiveProductId: candidate.inactiveProductId,
      targetProductId: input.targetProductId,
      productName: input.productName,
      confirmAlias: input.confirmAlias,
      aliasSource: 'order-sku-candidate',
      additionalOwnerProductIds,
    })
    const canonicalSku = resolution.product.sku?.trim() || ''
    if (!canonicalSku) throw new InventorySkuCandidateError('目标 Product 缺少 canonical SKU，不能完成处理')
    const updated = await tx.orderSkuCandidate.updateMany({
      where: { id: candidate.id, status: INVENTORY_SKU_CANDIDATE_STATUS.PENDING },
      data: {
        status: input.action === 'CREATE'
          ? INVENTORY_SKU_CANDIDATE_STATUS.CREATED
          : INVENTORY_SKU_CANDIDATE_STATUS.MAPPED,
        resolutionType: resolution.resolutionType,
        resolvedProductId: resolution.product.id,
        resolvedCanonicalSku: canonicalSku,
        resolvedBy: actor,
        resolvedAt: new Date(),
      },
    })
    if (updated.count !== 1) {
      throw new InventorySkuCandidateError('该订单待处理 SKU 已被其他操作处理，请刷新后重试')
    }
    return {
      candidateId: candidate.id,
      status: input.action === 'CREATE' ? 'CREATED' : 'MAPPED',
      resolutionType: resolution.resolutionType,
      resolvedProductId: resolution.product.id,
      resolvedCanonicalSku: canonicalSku,
      businessStatus: resolution.product.businessStatus,
    }
  }, TRANSACTION_OPTIONS)
}
