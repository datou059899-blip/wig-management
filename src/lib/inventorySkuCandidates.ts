import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createProduct } from '@/lib/products'
import { getCurrentInventoryByProduct } from '@/lib/productInventorySnapshots'
import {
  getLatestEffectiveStockBySku,
  INVENTORY_BATCH_STATUS,
  INVENTORY_SKU_CANDIDATE_DETECTION,
  INVENTORY_SKU_CANDIDATE_RESOLUTION,
  INVENTORY_SKU_CANDIDATE_STATUS,
  jsonRows,
  strictSkuKey,
  type InventoryPreviewMatchedRow,
  type InventoryPreviewUnmatchedRow,
} from '@/lib/inventoryPurchasing'

const RESOLVE_TRANSACTION_MAX_WAIT_MS = 10_000
const RESOLVE_TRANSACTION_TIMEOUT_MS = 30_000

type TransactionClient = Prisma.TransactionClient

export type IdentityProduct = {
  id: string
  name: string
  sku: string | null
  isActive: boolean
  businessStatus: string
  aliases: Array<{ aliasSku: string }>
}

type ResolveAction = 'CREATE' | 'MAP' | 'REACTIVATE' | 'IGNORE'
export type ProductSkuIdentityResolutionAction = Exclude<ResolveAction, 'IGNORE'>

export type ResolveInventorySkuCandidateInput = {
  batchId: string
  candidateId: string
  action: ResolveAction
  actor: string
  productName?: string
  targetProductId?: string
  confirmAlias?: boolean
  note?: string
}

export class InventorySkuCandidateError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message)
    this.name = 'InventorySkuCandidateError'
  }
}

function identityOwners(products: IdentityProduct[], normalizedSku: string) {
  const key = strictSkuKey(normalizedSku)
  const activeCanonical = products.filter((product) => product.isActive && strictSkuKey(product.sku) === key)
  const activeAlias = products.filter((product) => product.isActive && product.aliases.some((alias) => strictSkuKey(alias.aliasSku) === key))
  const inactiveCanonical = products.filter((product) => !product.isActive && strictSkuKey(product.sku) === key)
  const inactiveAlias = products.filter((product) => !product.isActive && product.aliases.some((alias) => strictSkuKey(alias.aliasSku) === key))
  return { activeCanonical, activeAlias, inactiveCanonical, inactiveAlias }
}

function allIdentityOwnerIds(owners: ReturnType<typeof identityOwners>) {
  return new Set([
    ...owners.activeCanonical,
    ...owners.activeAlias,
    ...owners.inactiveCanonical,
    ...owners.inactiveAlias,
  ].map((product) => product.id))
}

export async function loadIdentityProducts(client: TransactionClient | typeof prisma): Promise<IdentityProduct[]> {
  return client.product.findMany({
    select: {
      id: true,
      name: true,
      sku: true,
      isActive: true,
      businessStatus: true,
      aliases: { select: { aliasSku: true } },
    },
  })
}

export async function inspectProductSkuIdentity(
  client: TransactionClient | typeof prisma,
  normalizedSku: string,
) {
  const products = await loadIdentityProducts(client)
  const owners = identityOwners(products, normalizedSku)
  const activeOwnerIds = new Set([...owners.activeCanonical, ...owners.activeAlias].map((product) => product.id))
  const inactiveOwnerIds = new Set([...owners.inactiveCanonical, ...owners.inactiveAlias].map((product) => product.id))

  if (activeOwnerIds.size > 0) {
    return { kind: 'ACTIVE' as const, products, owners, ownerProductIds: activeOwnerIds }
  }
  if (inactiveOwnerIds.size > 1) {
    return { kind: 'CONFLICT' as const, products, owners, ownerProductIds: inactiveOwnerIds }
  }
  if (inactiveOwnerIds.size === 1) {
    const inactiveProductId = Array.from(inactiveOwnerIds)[0]
    const detectionType = owners.inactiveCanonical.some((product) => product.id === inactiveProductId)
      ? INVENTORY_SKU_CANDIDATE_DETECTION.INACTIVE_CANONICAL
      : INVENTORY_SKU_CANDIDATE_DETECTION.INACTIVE_ALIAS
    return {
      kind: 'INACTIVE' as const,
      products,
      owners,
      inactiveProductId,
      inactiveProduct: products.find((product) => product.id === inactiveProductId) || null,
      detectionType,
      ownerProductIds: inactiveOwnerIds,
    }
  }
  return {
    kind: 'UNKNOWN' as const,
    products,
    owners,
    detectionType: INVENTORY_SKU_CANDIDATE_DETECTION.UNKNOWN,
    ownerProductIds: new Set<string>(),
  }
}

export async function resolveProductSkuIdentityInTransaction(
  tx: TransactionClient,
  input: {
    action: ProductSkuIdentityResolutionAction
    inputSku: string
    normalizedSku: string
    detectionType: string
    inactiveProductId?: string | null
    targetProductId?: string
    productName?: string
    confirmAlias?: boolean
    aliasSource: string
    additionalOwnerProductIds?: string[]
  },
) {
  const products = await loadIdentityProducts(tx)
  const owners = identityOwners(products, input.normalizedSku)
  const skuOwnerIds = allIdentityOwnerIds(owners)
  const additionalOwnerIds = new Set((input.additionalOwnerProductIds || []).filter(Boolean))
  const decisiveOwnerIds = new Set([...Array.from(skuOwnerIds), ...Array.from(additionalOwnerIds)])

  if (input.action === 'CREATE') {
    if (input.detectionType !== INVENTORY_SKU_CANDIDATE_DETECTION.UNKNOWN) {
      throw new InventorySkuCandidateError('发现历史 Product，禁止创建重复商品')
    }
    if (decisiveOwnerIds.size > 0) {
      throw new InventorySkuCandidateError('该 SKU identity 已被 Product、Alias 或订单外部身份占用，请刷新后处理')
    }
    const productName = String(input.productName || '').trim()
    if (!productName) throw new InventorySkuCandidateError('请输入正式商品名称', 400)
    const createdProduct = await createProduct({
      name: productName,
      sku: input.inputSku,
      isActive: true,
      businessStatus: 'ACTIVE',
      stock: 0,
    }, tx)
    return {
      product: { ...createdProduct, aliases: [] } as IdentityProduct,
      resolutionType: INVENTORY_SKU_CANDIDATE_RESOLUTION.CREATE,
    }
  }

  if (input.action === 'REACTIVATE') {
    if (![INVENTORY_SKU_CANDIDATE_DETECTION.INACTIVE_CANONICAL, INVENTORY_SKU_CANDIDATE_DETECTION.INACTIVE_ALIAS].includes(input.detectionType as any)) {
      throw new InventorySkuCandidateError('该候选没有精确命中的历史 Product')
    }
    const inactiveProduct = products.find((item) => item.id === input.inactiveProductId)
    if (!inactiveProduct || inactiveProduct.isActive) {
      throw new InventorySkuCandidateError('历史 Product 状态已变化，请刷新后重试')
    }
    if (owners.activeCanonical.length > 0 || owners.activeAlias.length > 0) {
      throw new InventorySkuCandidateError('该 SKU identity 已被启用 Product 占用，禁止恢复')
    }
    const exactStillOwned = input.detectionType === INVENTORY_SKU_CANDIDATE_DETECTION.INACTIVE_CANONICAL
      ? owners.inactiveCanonical.some((item) => item.id === inactiveProduct.id)
      : owners.inactiveAlias.some((item) => item.id === inactiveProduct.id)
    if (!exactStillOwned || skuOwnerIds.size !== 1) {
      throw new InventorySkuCandidateError('历史 SKU identity 已变化，请刷新后重试')
    }
    if (additionalOwnerIds.size > 0 && (additionalOwnerIds.size !== 1 || !additionalOwnerIds.has(inactiveProduct.id))) {
      throw new InventorySkuCandidateError('订单外部身份属于其他 Product，禁止恢复')
    }
    if (!inactiveProduct.sku) {
      throw new InventorySkuCandidateError('历史 Product 缺少 canonical SKU，不能恢复')
    }
    const reactivated = await tx.product.updateMany({
      where: { id: inactiveProduct.id, isActive: false },
      data: { isActive: true },
    })
    if (reactivated.count !== 1) {
      throw new InventorySkuCandidateError('历史 Product 已被其他操作处理，请刷新后重试')
    }
    return {
      product: inactiveProduct,
      resolutionType: INVENTORY_SKU_CANDIDATE_RESOLUTION.REACTIVATE,
    }
  }

  const targetProductId = String(input.targetProductId || '').trim()
  const targetProduct = products.find((item) => item.id === targetProductId && item.isActive)
  if (!targetProduct) throw new InventorySkuCandidateError('目标 Product 不存在或已停用', 404)
  if (!targetProduct.sku) throw new InventorySkuCandidateError('目标 Product 缺少 canonical SKU，不能映射')
  if (owners.inactiveCanonical.length > 0 || owners.inactiveAlias.length > 0) {
    throw new InventorySkuCandidateError('该 SKU identity 属于历史 Product，禁止转移给其他 Product')
  }
  if (decisiveOwnerIds.size > 1 || (decisiveOwnerIds.size === 1 && !decisiveOwnerIds.has(targetProduct.id))) {
    throw new InventorySkuCandidateError('该 SKU identity 已被其他 Product、Alias 或订单外部身份占用')
  }
  if (skuOwnerIds.size === 0) {
    if (!input.confirmAlias) {
      throw new InventorySkuCandidateError('请明确确认将该 SKU 保存为目标 Product 的 Alias', 400)
    }
    await tx.productSkuAlias.create({
      data: {
        productId: targetProduct.id,
        aliasSku: input.inputSku,
        source: input.aliasSource,
      },
    })
  }
  return {
    product: targetProduct,
    resolutionType: INVENTORY_SKU_CANDIDATE_RESOLUTION.MAP,
  }
}

function findCandidateUnmatchedRow(
  rows: InventoryPreviewUnmatchedRow[],
  candidate: { rowNumber: number; normalizedSku: string },
) {
  const indexes = rows.flatMap((row, index) => (
    row.rowNumber === candidate.rowNumber && strictSkuKey(row.inputSku) === candidate.normalizedSku ? [index] : []
  ))
  if (indexes.length !== 1) {
    throw new InventorySkuCandidateError('候选与原始未匹配行不一致，请重新生成库存 PREVIEW')
  }
  return indexes[0]
}

async function moveCandidateToMatched(
  tx: TransactionClient,
  batch: { stockCapturedAt: Date; matchedRows: Prisma.JsonValue; unmatchedRows: Prisma.JsonValue },
  candidate: {
    rowNumber: number
    inputSku: string
    normalizedSku: string
    totalQty: number
    productNameSnapshot: string | null
  },
  product: { id: string; name: string; sku: string | null },
  resolution: 'sku_candidate_created' | 'sku_candidate_mapped' | 'sku_candidate_reactivated' | 'sku_candidate_refreshed',
) {
  const canonicalSku = product.sku?.trim() || ''
  if (!canonicalSku) {
    throw new InventorySkuCandidateError('目标 Product 缺少 canonical SKU，不能进入正式库存 PREVIEW')
  }

  const matchedRows = jsonRows<InventoryPreviewMatchedRow>(batch.matchedRows)
  const unmatchedRows = jsonRows<InventoryPreviewUnmatchedRow>(batch.unmatchedRows)
  const unmatchedIndex = findCandidateUnmatchedRow(unmatchedRows, candidate)
  if (matchedRows.some((row) => strictSkuKey(row.canonicalSku) === strictSkuKey(canonicalSku))) {
    throw new InventorySkuCandidateError(`本批次已存在 canonical SKU ${canonicalSku}，请先处理重复 SKU 冲突`)
  }

  const previousStockBySku = await getLatestEffectiveStockBySku([canonicalSku], batch.stockCapturedAt, tx)
  const previousTotalQty = previousStockBySku.get(canonicalSku) ?? null
  const matchedRow: InventoryPreviewMatchedRow = {
    rowNumber: candidate.rowNumber,
    inputSku: candidate.inputSku,
    canonicalSku,
    productId: product.id,
    productName: product.name,
    inputProductName: candidate.productNameSnapshot || undefined,
    totalQty: candidate.totalQty,
    previousTotalQty,
    diffQty: previousTotalQty === null ? null : candidate.totalQty - previousTotalQty,
    resolution,
  }
  const nextUnmatchedRows = unmatchedRows.filter((_, index) => index !== unmatchedIndex)
  const nextMatchedRows = [...matchedRows, matchedRow].sort((a, b) => a.rowNumber - b.rowNumber)

  return { canonicalSku, nextMatchedRows, nextUnmatchedRows }
}

async function updateResolvedCandidate(
  tx: TransactionClient,
  candidateId: string,
  data: {
    status: 'CREATED' | 'MAPPED'
    resolutionType: 'CREATE_NEW' | 'MAP_EXISTING' | 'REACTIVATE_INACTIVE' | 'REFRESH_EXACT_MATCH'
    resolvedProductId: string
    resolvedCanonicalSku: string
    resolvedBy: string
    resolvedAt: Date
  },
) {
  const result = await tx.inventorySkuCandidate.updateMany({
    where: { id: candidateId, status: INVENTORY_SKU_CANDIDATE_STATUS.PENDING },
    data,
  })
  if (result.count !== 1) {
    throw new InventorySkuCandidateError('该新 SKU 候选已被其他操作处理，请刷新后重试')
  }
}

export async function resolveInventorySkuCandidate(input: ResolveInventorySkuCandidateInput) {
  const actor = input.actor.trim()
  if (!actor) throw new InventorySkuCandidateError('无法确认当前操作人', 401)

  return prisma.$transaction(async (tx) => {
    const batch = await tx.inventoryImportBatch.findUnique({
      where: { id: input.batchId },
      select: { id: true, status: true, stockCapturedAt: true, matchedRows: true, unmatchedRows: true },
    })
    if (!batch) throw new InventorySkuCandidateError('导入批次不存在', 404)
    if (batch.status !== INVENTORY_BATCH_STATUS.PREVIEW) {
      throw new InventorySkuCandidateError('只有 PREVIEW 状态的批次可以处理新 SKU 候选')
    }

    const candidate = await tx.inventorySkuCandidate.findFirst({
      where: { id: input.candidateId, importBatchId: batch.id },
    })
    if (!candidate) throw new InventorySkuCandidateError('新 SKU 候选不存在', 404)
    if (candidate.status !== INVENTORY_SKU_CANDIDATE_STATUS.PENDING) {
      throw new InventorySkuCandidateError('该新 SKU 候选已被其他操作处理，请刷新后重试')
    }

    if (input.action === 'IGNORE') {
      const note = String(input.note || '').trim()
      if (!note) throw new InventorySkuCandidateError('忽略新 SKU 时必须填写原因', 400)
      const updated = await tx.inventorySkuCandidate.updateMany({
        where: { id: candidate.id, status: INVENTORY_SKU_CANDIDATE_STATUS.PENDING },
        data: {
          status: INVENTORY_SKU_CANDIDATE_STATUS.IGNORED,
          resolutionType: INVENTORY_SKU_CANDIDATE_RESOLUTION.IGNORE,
          note,
          resolvedBy: actor,
          resolvedAt: new Date(),
        },
      })
      if (updated.count !== 1) {
        throw new InventorySkuCandidateError('该新 SKU 候选已被其他操作处理，请刷新后重试')
      }
      return { action: input.action, candidateId: candidate.id }
    }

    if (String(input.action) === 'IGNORE') {
      throw new InventorySkuCandidateError('不支持的候选处理动作', 400)
    }
    const identityResolution = await resolveProductSkuIdentityInTransaction(tx, {
      action: input.action,
      inputSku: candidate.inputSku,
      normalizedSku: candidate.normalizedSku,
      detectionType: candidate.detectionType,
      inactiveProductId: candidate.inactiveProductId,
      targetProductId: input.targetProductId,
      productName: input.productName,
      confirmAlias: input.confirmAlias,
      aliasSource: 'inventory-sku-candidate',
    })
    const product = identityResolution.product
    const resolutionType = identityResolution.resolutionType
    const resolution = input.action === 'CREATE'
      ? 'sku_candidate_created'
      : input.action === 'REACTIVATE'
        ? 'sku_candidate_reactivated'
        : 'sku_candidate_mapped'

    const moved = await moveCandidateToMatched(tx, batch, candidate, product, resolution)
    await updateResolvedCandidate(tx, candidate.id, {
      status: input.action === 'CREATE' ? INVENTORY_SKU_CANDIDATE_STATUS.CREATED : INVENTORY_SKU_CANDIDATE_STATUS.MAPPED,
      resolutionType,
      resolvedProductId: product.id,
      resolvedCanonicalSku: moved.canonicalSku,
      resolvedBy: actor,
      resolvedAt: new Date(),
    })
    await tx.inventoryImportBatch.update({
      where: { id: batch.id, status: INVENTORY_BATCH_STATUS.PREVIEW },
      data: {
        matchedRows: moved.nextMatchedRows as unknown as Prisma.InputJsonValue,
        unmatchedRows: moved.nextUnmatchedRows as unknown as Prisma.InputJsonValue,
        matchedCount: moved.nextMatchedRows.length,
        unmatchedCount: moved.nextUnmatchedRows.length,
      },
    })

    return {
      action: input.action,
      candidateId: candidate.id,
      resolvedProductId: product.id,
      resolvedCanonicalSku: moved.canonicalSku,
      businessStatus: product.businessStatus,
    }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: RESOLVE_TRANSACTION_MAX_WAIT_MS,
    timeout: RESOLVE_TRANSACTION_TIMEOUT_MS,
  })
}

function candidateSummary(candidates: Array<{ status: string }>) {
  return {
    total: candidates.length,
    pending: candidates.filter((candidate) => candidate.status === INVENTORY_SKU_CANDIDATE_STATUS.PENDING).length,
    created: candidates.filter((candidate) => candidate.status === INVENTORY_SKU_CANDIDATE_STATUS.CREATED).length,
    mapped: candidates.filter((candidate) => candidate.status === INVENTORY_SKU_CANDIDATE_STATUS.MAPPED).length,
    ignored: candidates.filter((candidate) => candidate.status === INVENTORY_SKU_CANDIDATE_STATUS.IGNORED).length,
  }
}

export async function getInventorySkuCandidateViewData(batchId: string) {
  const candidates = await prisma.inventorySkuCandidate.findMany({
    where: { importBatchId: batchId },
    include: {
      inactiveProduct: {
        select: {
          id: true,
          name: true,
          sku: true,
          stock: true,
          businessStatus: true,
          isActive: true,
          aliases: { select: { aliasSku: true } },
        },
      },
      resolvedProduct: { select: { id: true, name: true, sku: true, isActive: true } },
    },
    orderBy: { rowNumber: 'asc' },
  })
  const inactiveProducts = Array.from(new Map(
    candidates.flatMap((candidate) => candidate.inactiveProduct ? [[candidate.inactiveProduct.id, candidate.inactiveProduct] as const] : []),
  ).values())
  const inventoryByProductId = await getCurrentInventoryByProduct(inactiveProducts)
  const normalizedSkus = Array.from(new Set(candidates.map((candidate) => candidate.normalizedSku)))
  const otherBatchGroups = normalizedSkus.length
    ? await prisma.inventorySkuCandidate.groupBy({
        by: ['normalizedSku', 'importBatchId'],
        where: {
          normalizedSku: { in: normalizedSkus },
          importBatchId: { not: batchId },
          importBatch: { status: INVENTORY_BATCH_STATUS.PREVIEW },
        },
      })
    : []
  const otherBatchCountBySku = new Map<string, number>()
  otherBatchGroups.forEach((group) => {
    otherBatchCountBySku.set(group.normalizedSku, (otherBatchCountBySku.get(group.normalizedSku) || 0) + 1)
  })

  return {
    candidates: candidates.map((candidate) => ({
      ...candidate,
      resolvedAt: candidate.resolvedAt?.toISOString() ?? null,
      createdAt: candidate.createdAt.toISOString(),
      updatedAt: candidate.updatedAt.toISOString(),
      inactiveProduct: candidate.inactiveProduct ? {
        id: candidate.inactiveProduct.id,
        name: candidate.inactiveProduct.name,
        sku: candidate.inactiveProduct.sku,
        businessStatus: candidate.inactiveProduct.businessStatus,
        isActive: candidate.inactiveProduct.isActive,
        currentInventory: inventoryByProductId.get(candidate.inactiveProduct.id)?.currentStock ?? 0,
      } : null,
      otherPreviewBatchCount: otherBatchCountBySku.get(candidate.normalizedSku) || 0,
    })),
    candidateSummary: candidateSummary(candidates),
  }
}

async function getRefreshMatches(client: TransactionClient | typeof prisma, batchId: string) {
  const [batch, candidates, products] = await Promise.all([
    client.inventoryImportBatch.findUnique({ where: { id: batchId }, select: { id: true, status: true, stockCapturedAt: true, matchedRows: true, unmatchedRows: true } }),
    client.inventorySkuCandidate.findMany({ where: { importBatchId: batchId, status: INVENTORY_SKU_CANDIDATE_STATUS.PENDING }, orderBy: { rowNumber: 'asc' } }),
    loadIdentityProducts(client),
  ])
  if (!batch) throw new InventorySkuCandidateError('导入批次不存在', 404)
  if (batch.status !== INVENTORY_BATCH_STATUS.PREVIEW) throw new InventorySkuCandidateError('只有 PREVIEW 状态的批次可以重新匹配')

  const matches = candidates.flatMap((candidate) => {
    const owners = identityOwners(products, candidate.normalizedSku)
    const ownerIds = new Set([...owners.activeCanonical, ...owners.activeAlias].map((product) => product.id))
    if (ownerIds.size !== 1) return []
    const product = owners.activeCanonical[0] || owners.activeAlias[0]
    if (!product?.sku) return []
    return [{ candidate, product }]
  })
  return { batch, matches }
}

export async function refreshInventorySkuCandidates(batchId: string, apply: boolean, actor: string) {
  if (!apply) {
    const preview = await getRefreshMatches(prisma, batchId)
    return {
      apply: false,
      matches: preview.matches.map(({ candidate, product }) => ({
        candidateId: candidate.id,
        inputSku: candidate.inputSku,
        productId: product.id,
        canonicalSku: product.sku,
        productName: product.name,
      })),
    }
  }

  return prisma.$transaction(async (tx) => {
    const { batch, matches } = await getRefreshMatches(tx, batchId)
    let currentBatch = batch
    const applied: string[] = []

    for (const { candidate, product } of matches) {
      const moved = await moveCandidateToMatched(tx, currentBatch, candidate, product, 'sku_candidate_refreshed')
      await updateResolvedCandidate(tx, candidate.id, {
        status: INVENTORY_SKU_CANDIDATE_STATUS.MAPPED,
        resolutionType: INVENTORY_SKU_CANDIDATE_RESOLUTION.REFRESH,
        resolvedProductId: product.id,
        resolvedCanonicalSku: moved.canonicalSku,
        resolvedBy: actor,
        resolvedAt: new Date(),
      })
      currentBatch = {
        ...currentBatch,
        matchedRows: moved.nextMatchedRows as unknown as Prisma.JsonValue,
        unmatchedRows: moved.nextUnmatchedRows as unknown as Prisma.JsonValue,
      }
      applied.push(candidate.id)
    }

    await tx.inventoryImportBatch.update({
      where: { id: batch.id, status: INVENTORY_BATCH_STATUS.PREVIEW },
      data: {
        matchedRows: currentBatch.matchedRows as Prisma.InputJsonValue,
        unmatchedRows: currentBatch.unmatchedRows as Prisma.InputJsonValue,
        matchedCount: jsonRows<InventoryPreviewMatchedRow>(currentBatch.matchedRows).length,
        unmatchedCount: jsonRows<InventoryPreviewUnmatchedRow>(currentBatch.unmatchedRows).length,
      },
    })
    return { apply: true, appliedCandidateIds: applied }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: RESOLVE_TRANSACTION_MAX_WAIT_MS,
    timeout: RESOLVE_TRANSACTION_TIMEOUT_MS,
  })
}
