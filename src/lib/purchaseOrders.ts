import { randomUUID } from 'crypto'
import { Prisma, PurchaseOrderStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const ACTIVE_OPEN_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.ORDERED,
  PurchaseOrderStatus.PRODUCING,
  PurchaseOrderStatus.IN_TRANSIT,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
]

const IN_TRANSIT_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.IN_TRANSIT,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
]

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: '草稿',
  ORDERED: '已下单',
  PRODUCING: '生产中',
  IN_TRANSIT: '运输中',
  PARTIALLY_RECEIVED: '部分到货',
  RECEIVED: '已到货',
  CANCELLED: '已取消',
}

const ALLOWED_STATUS_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  DRAFT: [PurchaseOrderStatus.ORDERED, PurchaseOrderStatus.CANCELLED],
  ORDERED: [PurchaseOrderStatus.PRODUCING, PurchaseOrderStatus.IN_TRANSIT, PurchaseOrderStatus.CANCELLED],
  PRODUCING: [PurchaseOrderStatus.IN_TRANSIT, PurchaseOrderStatus.CANCELLED],
  IN_TRANSIT: [PurchaseOrderStatus.PARTIALLY_RECEIVED, PurchaseOrderStatus.RECEIVED, PurchaseOrderStatus.CANCELLED],
  PARTIALLY_RECEIVED: [PurchaseOrderStatus.RECEIVED, PurchaseOrderStatus.CANCELLED],
  RECEIVED: [],
  CANCELLED: [],
}

type PurchaseItemInput = {
  id?: string | null
  productId?: string | null
  productNameSnapshot?: string
  orderedQty?: number
  receivedQty?: number
  unitCostRmb?: number | null
  note?: string | null
}

type PurchaseOrderInput = {
  supplierId?: string | null
  status?: PurchaseOrderStatus
  paidAmountRmb?: number | null
  orderedAt?: string | null
  expectedArrivalDate?: string | null
  note?: string | null
  items?: PurchaseItemInput[]
}

const purchaseOrderInclude = {
  supplier: { select: { id: true, name: true, isActive: true } },
  items: {
    include: {
      product: { select: { id: true, sku: true, name: true, isActive: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.PurchaseOrderInclude

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function nullableString(value: unknown) {
  const trimmed = trimString(value)
  return trimmed || null
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue < 0) throw new Error('金额必须是大于等于0的数字')
  return numberValue
}

function nonNegativeAmount(value: unknown, fieldName: string) {
  const numberValue = value === null || value === undefined || value === '' ? 0 : Number(value)
  if (!Number.isFinite(numberValue) || numberValue < 0) throw new Error(`${fieldName}必须是大于等于0的数字`)
  return numberValue
}

function nonNegativeInt(value: unknown, fieldName: string) {
  const numberValue = value === null || value === undefined || value === '' ? 0 : Number(value)
  if (!Number.isSafeInteger(numberValue) || numberValue < 0) {
    throw new Error(`${fieldName}必须是大于等于0的整数`)
  }
  return numberValue
}

function parseNullableDate(value: unknown, fieldName: string) {
  const trimmed = nullableString(value)
  if (!trimmed) return null
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) throw new Error(`${fieldName}格式无效`)
  return date
}

function parseStatus(value: unknown) {
  const status = trimString(value) as PurchaseOrderStatus
  if (!status) return PurchaseOrderStatus.DRAFT
  if (!Object.values(PurchaseOrderStatus).includes(status)) throw new Error('采购状态无效')
  return status
}

function assertStatusTransition(current: PurchaseOrderStatus, next: PurchaseOrderStatus) {
  if (current === next) return
  if (!ALLOWED_STATUS_TRANSITIONS[current].includes(next)) {
    throw new Error(`采购状态不能从${STATUS_LABELS[current]}变更为${STATUS_LABELS[next]}`)
  }
}

function assertItemsAllowStatus(status: PurchaseOrderStatus, items: PurchaseItemInput[]) {
  if (status === PurchaseOrderStatus.DRAFT || status === PurchaseOrderStatus.CANCELLED) return
  if (!items.length) {
    throw new Error('进入正式采购状态前必须至少有一条采购明细')
  }
  if (items.some((item) => nonNegativeInt(item.orderedQty, '订货数量') <= 0)) {
    throw new Error('正式采购状态下每条采购明细的订货数量都必须大于0')
  }
}

function assertStatusMatchesReceivedQty(
  status: PurchaseOrderStatus,
  items: Array<{ orderedQty: number; receivedQty: number }>,
) {
  if (status === PurchaseOrderStatus.RECEIVED) {
    if (!items.length || items.some((item) => item.orderedQty <= 0 || item.receivedQty !== item.orderedQty)) {
      throw new Error('已到货状态要求所有明细已到数量等于订货数量')
    }
  }
  if (status === PurchaseOrderStatus.PARTIALLY_RECEIVED) {
    const hasReceived = items.some((item) => item.receivedQty > 0)
    const hasOpen = items.some((item) => item.receivedQty < item.orderedQty)
    if (!hasReceived || !hasOpen) {
      throw new Error('部分到货状态要求至少一条明细已到货，且仍存在未到货数量')
    }
  }
}

function assertPaidAmountWithinOrderAmount(paidAmountRmb: number, orderAmountRmb: number) {
  if (paidAmountRmb > orderAmountRmb) {
    throw new Error('已付款金额不能大于订单金额')
  }
}

function assertPaymentCanBeRecorded(paidAmountRmb: number, missingUnitCostItemCount: number, orderAmountRmb: number) {
  if (paidAmountRmb > 0 && missingUnitCostItemCount > 0) {
    throw new Error('请先补全所有商品单价，再登记付款金额')
  }
  if (missingUnitCostItemCount === 0) {
    assertPaidAmountWithinOrderAmount(paidAmountRmb, orderAmountRmb)
  }
}

async function resolveSupplierSnapshot(supplierId: string | null) {
  if (!supplierId) return { supplierId: null, supplierNameSnapshot: null }
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true, isActive: true },
  })
  if (!supplier || !supplier.isActive) throw new Error('供应商不存在或已停用')
  return { supplierId: supplier.id, supplierNameSnapshot: supplier.name }
}

async function buildItemCreateData(items: PurchaseItemInput[]) {
  return Promise.all(items.map(async (item) => {
    const productId = nullableString(item.productId)
    const orderedQty = nonNegativeInt(item.orderedQty, '订货数量')
    const receivedQty = nonNegativeInt(item.receivedQty, '已到货数量')
    if (receivedQty > orderedQty) throw new Error('已到货数量不能大于订货数量')

    if (productId) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, sku: true, name: true, isActive: true },
      })
      if (!product || !product.isActive) throw new Error('关联商品不存在或已停用')
      return {
        productId: product.id,
        skuSnapshot: product.sku || null,
        productNameSnapshot: product.name,
        orderedQty,
        receivedQty,
        unitCostRmb: optionalNumber(item.unitCostRmb),
        note: nullableString(item.note),
      }
    }

    const productNameSnapshot = trimString(item.productNameSnapshot)
    if (!productNameSnapshot) throw new Error('未关联商品时必须填写产品/款式名称')
    return {
      productId: null,
      skuSnapshot: null,
      productNameSnapshot,
      orderedQty,
      receivedQty,
      unitCostRmb: optionalNumber(item.unitCostRmb),
      note: nullableString(item.note),
    }
  }))
}

function summarizeOrder(order: Prisma.PurchaseOrderGetPayload<{ include: typeof purchaseOrderInclude }>) {
  const orderedQty = order.items.reduce((sum, item) => sum + item.orderedQty, 0)
  const receivedQty = order.items.reduce((sum, item) => sum + item.receivedQty, 0)
  const openQty = Math.max(orderedQty - receivedQty, 0)
  const missingUnitCostItemCount = order.items.filter((item) => item.orderedQty > 0 && item.unitCostRmb === null).length
  const calculablePurchaseAmountRmb = order.items.reduce((sum, item) => sum + item.orderedQty * (item.unitCostRmb || 0), 0)
  const amountComplete = missingUnitCostItemCount === 0
  const remainingPaymentRmb = amountComplete ? Math.max(calculablePurchaseAmountRmb - order.paidAmountRmb, 0) : null
  const paymentStatus = !amountComplete
    ? 'AMOUNT_INCOMPLETE'
    : order.paidAmountRmb <= 0
      ? 'UNPAID'
      : order.paidAmountRmb < calculablePurchaseAmountRmb
        ? 'PARTIALLY_PAID'
        : 'PAID'

  return {
    ...order,
    statusLabel: STATUS_LABELS[order.status],
    orderedQty,
    receivedQty,
    openQty,
    orderAmountRmb: calculablePurchaseAmountRmb,
    calculablePurchaseAmountRmb,
    remainingPaymentRmb,
    paymentStatus,
    missingUnitCostItemCount,
    amountComplete,
    openPurchaseQty: ACTIVE_OPEN_STATUSES.includes(order.status) ? openQty : 0,
    inTransitQty: IN_TRANSIT_STATUSES.includes(order.status) ? openQty : 0,
  }
}

export function getPurchaseOrderStatusLabels() {
  return STATUS_LABELS
}

export async function listPurchaseOrders() {
  const orders = await prisma.purchaseOrder.findMany({
    include: purchaseOrderInclude,
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  })
  const items = orders.map(summarizeOrder)
  const summary = items.reduce(
    (acc, order) => {
      acc.openPurchaseQty += order.openPurchaseQty
      acc.inTransitQty += order.inTransitQty
      acc.orderAmountRmb += order.orderAmountRmb
      acc.calculablePurchaseAmountRmb += order.calculablePurchaseAmountRmb
      acc.paidAmountRmb += order.paidAmountRmb
      acc.remainingPaymentRmb += order.remainingPaymentRmb || 0
      acc.missingUnitCostItemCount += order.missingUnitCostItemCount
      if (order.supplierId) acc.supplierIds.add(order.supplierId)
      return acc
    },
    { openPurchaseQty: 0, inTransitQty: 0, orderAmountRmb: 0, calculablePurchaseAmountRmb: 0, paidAmountRmb: 0, remainingPaymentRmb: 0, missingUnitCostItemCount: 0, supplierIds: new Set<string>() },
  )

  return {
    summary: {
      orderCount: items.length,
      openPurchaseQty: summary.openPurchaseQty,
      inTransitQty: summary.inTransitQty,
      orderAmountRmb: summary.orderAmountRmb,
      calculablePurchaseAmountRmb: summary.calculablePurchaseAmountRmb,
      paidAmountRmb: summary.paidAmountRmb,
      remainingPaymentRmb: summary.missingUnitCostItemCount === 0 ? summary.remainingPaymentRmb : null,
      missingUnitCostItemCount: summary.missingUnitCostItemCount,
      amountComplete: summary.missingUnitCostItemCount === 0,
      supplierCount: summary.supplierIds.size,
    },
    orders: items,
    statusLabels: STATUS_LABELS,
  }
}

export async function getPurchaseOrder(id: string) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: purchaseOrderInclude,
  })
  if (!order) {
    const error = new Error('采购单不存在')
    error.name = 'NotFound'
    throw error
  }
  return summarizeOrder(order)
}

export async function createPurchaseOrder(input: PurchaseOrderInput) {
  const status = parseStatus(input.status)
  const rawItems = input.items || []
  assertItemsAllowStatus(status, rawItems)
  const supplierSnapshot = await resolveSupplierSnapshot(nullableString(input.supplierId))
  const itemData = await buildItemCreateData(rawItems)
  assertStatusMatchesReceivedQty(status, itemData)
  const paidAmountRmb = nonNegativeAmount(input.paidAmountRmb, '已付款金额')
  const orderAmountRmb = itemData.reduce((sum, item) => sum + item.orderedQty * (item.unitCostRmb || 0), 0)
  const missingUnitCostItemCount = itemData.filter((item) => item.orderedQty > 0 && item.unitCostRmb === null).length
  assertPaymentCanBeRecorded(paidAmountRmb, missingUnitCostItemCount, orderAmountRmb)
  const orderNo = buildManualOrderNo()

  const order = await prisma.purchaseOrder.create({
    data: {
      orderNo,
      ...supplierSnapshot,
      status,
      paidAmountRmb,
      orderedAt: parseNullableDate(input.orderedAt, '下单时间'),
      expectedArrivalDate: parseNullableDate(input.expectedArrivalDate, '预计到货时间'),
      note: nullableString(input.note),
      items: itemData.length ? { create: itemData } : undefined,
    },
    include: purchaseOrderInclude,
  })
  return summarizeOrder(order)
}

export async function updatePurchaseOrder(id: string, input: PurchaseOrderInput) {
  const current = await getPurchaseOrder(id)
  const nextStatus = input.status ? parseStatus(input.status) : current.status
  if (
    (current.status === PurchaseOrderStatus.RECEIVED || current.status === PurchaseOrderStatus.CANCELLED)
    && (input.supplierId !== undefined || input.paidAmountRmb !== undefined || input.orderedAt !== undefined || input.expectedArrivalDate !== undefined || input.items !== undefined || nextStatus !== current.status)
  ) {
    throw new Error('已到货或已取消采购单只能保留历史记录，不能修改核心字段')
  }
  assertStatusTransition(current.status, nextStatus)
  const currentSupplierId = current.supplierId || null
  const requestedSupplierId = input.supplierId !== undefined ? nullableString(input.supplierId) : currentSupplierId
  if (IN_TRANSIT_STATUSES.includes(current.status) && requestedSupplierId !== currentSupplierId) {
    throw new Error('在途或部分到货采购单不能随意更换供应商')
  }
  const rawItems = input.items || current.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productNameSnapshot: item.productNameSnapshot,
    orderedQty: item.orderedQty,
    receivedQty: item.receivedQty,
    unitCostRmb: item.unitCostRmb,
    note: item.note,
  }))
  assertItemsAllowStatus(nextStatus, rawItems)
  const supplierSnapshot = requestedSupplierId !== currentSupplierId
    ? await resolveSupplierSnapshot(nullableString(input.supplierId))
    : { supplierId: current.supplierId, supplierNameSnapshot: current.supplierNameSnapshot }
  const itemPlan = input.items ? await buildItemUpdatePlan(current, input.items) : null
  const nextItemsForAmount = itemPlan
    ? [...itemPlan.updates.map((item) => item.data), ...itemPlan.creates]
    : rawItems
  assertStatusMatchesReceivedQty(nextStatus, itemPlan ? itemPlan.statusItems : rawItems.map((item) => ({
    orderedQty: nonNegativeInt(item.orderedQty, '订货数量'),
    receivedQty: nonNegativeInt(item.receivedQty, '已到货数量'),
  })))
  const paidAmountRmb = input.paidAmountRmb !== undefined
    ? nonNegativeAmount(input.paidAmountRmb, '已付款金额')
    : current.paidAmountRmb
  const orderAmountRmb = nextItemsForAmount.reduce((sum, item) => sum + nonNegativeInt(item.orderedQty, '订货数量') * (optionalNumber(item.unitCostRmb) || 0), 0)
  const missingUnitCostItemCount = nextItemsForAmount.filter((item) => nonNegativeInt(item.orderedQty, '订货数量') > 0 && optionalNumber(item.unitCostRmb) === null).length
  assertPaymentCanBeRecorded(paidAmountRmb, missingUnitCostItemCount, orderAmountRmb)

  const order = await prisma.$transaction(async (tx) => {
    if (itemPlan) {
      if (itemPlan.deleteIds.length) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id, id: { in: itemPlan.deleteIds } } })
      }
      await Promise.all(itemPlan.updates.map((item) => tx.purchaseOrderItem.update({
        where: { id: item.id },
        data: item.data,
      })))
      await Promise.all(itemPlan.creates.map((item) => tx.purchaseOrderItem.create({
        data: {
          purchaseOrderId: id,
          ...item,
        },
      })))
    }
    return tx.purchaseOrder.update({
      where: { id },
      data: {
        ...supplierSnapshot,
        status: nextStatus,
        paidAmountRmb,
        orderedAt: input.orderedAt !== undefined ? parseNullableDate(input.orderedAt, '下单时间') : current.orderedAt,
        expectedArrivalDate: input.expectedArrivalDate !== undefined ? parseNullableDate(input.expectedArrivalDate, '预计到货时间') : current.expectedArrivalDate,
        note: input.note !== undefined ? nullableString(input.note) : current.note,
      },
      include: purchaseOrderInclude,
    })
  })
  return summarizeOrder(order)
}

export async function linkPurchaseOrderItemProduct(itemId: string, productId: string) {
  const safeItemId = trimString(itemId)
  const safeProductId = trimString(productId)
  if (!safeItemId || !safeProductId) throw new Error('采购明细和商品不能为空')

  const [item, product] = await Promise.all([
    prisma.purchaseOrderItem.findUnique({
      where: { id: safeItemId },
      select: {
        id: true,
        purchaseOrderId: true,
        productId: true,
      },
    }),
    prisma.product.findUnique({
      where: { id: safeProductId },
      select: { id: true, sku: true, name: true, isActive: true },
    }),
  ])

  if (!item) {
    const error = new Error('采购明细不存在')
    error.name = 'NotFound'
    throw error
  }
  if (item.productId) throw new Error('采购明细已关联商品')
  if (!product || !product.isActive) throw new Error('关联商品不存在或已停用')

  await prisma.purchaseOrderItem.update({
    where: { id: safeItemId },
    data: { productId: product.id },
  })

  return getPurchaseOrder(item.purchaseOrderId)
}

type PurchaseOrderWithItems = Awaited<ReturnType<typeof getPurchaseOrder>>

type ItemWriteData = {
  productId: string | null
  skuSnapshot: string | null
  productNameSnapshot: string
  orderedQty: number
  receivedQty: number
  unitCostRmb: number | null
  note: string | null
}

async function buildItemUpdatePlan(current: PurchaseOrderWithItems, items: PurchaseItemInput[]) {
  const existingById = new Map(current.items.map((item) => [item.id, item]))
  const seenIds = new Set<string>()
  const creates: ItemWriteData[] = []
  const updates: Array<{ id: string; data: ItemWriteData }> = []
  const statusItems: Array<{ orderedQty: number; receivedQty: number }> = []

  for (const item of items) {
    const itemId = nullableString(item.id)
    const existing = itemId ? existingById.get(itemId) : null
    if (itemId && !existing) throw new Error('采购明细不存在或不属于该采购单')
    if (itemId) seenIds.add(itemId)

    const orderedQty = nonNegativeInt(item.orderedQty, '订货数量')
    const receivedQty = nonNegativeInt(item.receivedQty, '已到货数量')
    if (receivedQty > orderedQty) throw new Error('已到货数量不能大于订货数量')
    statusItems.push({ orderedQty, receivedQty })

    if (!existing) {
      creates.push(await buildSingleItemData(item, orderedQty, receivedQty))
      continue
    }

    const nextProductId = nullableString(item.productId)
    const currentProductId = existing.productId || null
    const isInTransitLocked = IN_TRANSIT_STATUSES.includes(current.status)
    if (isInTransitLocked && nextProductId !== currentProductId) {
      throw new Error('在途或部分到货采购单不能更换已有明细的关联商品')
    }
    if (isInTransitLocked && existing.receivedQty > 0) {
      const nextName = nextProductId ? existing.productNameSnapshot : trimString(item.productNameSnapshot)
      if (nextName && nextName !== existing.productNameSnapshot) {
        throw new Error('已到货明细不能更换产品/款式名称')
      }
    }

    const data = nextProductId === currentProductId
      ? buildExistingItemData(existing, item, orderedQty, receivedQty)
      : await buildSingleItemData(item, orderedQty, receivedQty)
    updates.push({ id: existing.id, data })
  }

  const deleteIds = current.items.filter((item) => !seenIds.has(item.id)).map((item) => item.id)
  if (deleteIds.length && current.status !== PurchaseOrderStatus.DRAFT) {
    throw new Error('只有草稿采购单允许删除明细')
  }

  return { creates, updates, deleteIds, statusItems }
}

function buildExistingItemData(
  existing: PurchaseOrderWithItems['items'][number],
  item: PurchaseItemInput,
  orderedQty: number,
  receivedQty: number,
): ItemWriteData {
  if (existing.productId) {
    return {
      productId: existing.productId,
      skuSnapshot: existing.skuSnapshot,
      productNameSnapshot: existing.productNameSnapshot,
      orderedQty,
      receivedQty,
      unitCostRmb: optionalNumber(item.unitCostRmb),
      note: nullableString(item.note),
    }
  }

  const productNameSnapshot = trimString(item.productNameSnapshot) || existing.productNameSnapshot
  if (!productNameSnapshot) throw new Error('未关联商品时必须填写产品/款式名称')
  return {
    productId: null,
    skuSnapshot: existing.skuSnapshot,
    productNameSnapshot,
    orderedQty,
    receivedQty,
    unitCostRmb: optionalNumber(item.unitCostRmb),
    note: nullableString(item.note),
  }
}

async function buildSingleItemData(item: PurchaseItemInput, orderedQty: number, receivedQty: number): Promise<ItemWriteData> {
  const productId = nullableString(item.productId)
  if (productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, sku: true, name: true, isActive: true },
    })
    if (!product || !product.isActive) throw new Error('关联商品不存在或已停用')
    return {
      productId: product.id,
      skuSnapshot: product.sku || null,
      productNameSnapshot: product.name,
      orderedQty,
      receivedQty,
      unitCostRmb: optionalNumber(item.unitCostRmb),
      note: nullableString(item.note),
    }
  }

  const productNameSnapshot = trimString(item.productNameSnapshot)
  if (!productNameSnapshot) throw new Error('未关联商品时必须填写产品/款式名称')
  return {
    productId: null,
    skuSnapshot: null,
    productNameSnapshot,
    orderedQty,
    receivedQty,
    unitCostRmb: optionalNumber(item.unitCostRmb),
    note: nullableString(item.note),
  }
}

function buildManualOrderNo() {
  return `PO-MANUAL-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${randomUUID().slice(0, 8).toUpperCase()}`
}
