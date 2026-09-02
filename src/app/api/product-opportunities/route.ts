import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canManageProductOpportunities } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

const DEVELOPMENT_LINK_STATUSES = ['NEW_PRODUCT', 'DIFFERENT_CRAFT', 'SKU_PENDING']

const LINK_STATUS_LABELS: Record<string, string> = {
  NEW_PRODUCT: '新品待建档',
  DIFFERENT_CRAFT: '同名不同工艺',
  SKU_PENDING: '待确认SKU',
}

// 获取选品更新池列表
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') || 'all'
    const priority = searchParams.get('priority') || 'all'
    const supplier = searchParams.get('supplier') || 'all'
    const search = searchParams.get('search') || ''

    const where: any = {}
    
    if (status && status !== 'all') {
      where.status = status
    }
    
    if (priority && priority !== 'all') {
      where.priority = priority
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { category: { contains: search } },
        { styleType: { contains: search } },
        { sourceNote: { contains: search } },
      ]
    }

    const rawOpportunities = await prisma.productOpportunity.findMany({
      where,
      orderBy: [
        { status: 'asc' },
        { priority: 'asc' },
        { createdAt: 'desc' },
      ],
    })
    const linkedProductIds = rawOpportunities.map(item => item.productId).filter(Boolean) as string[]
    const linkedProducts = linkedProductIds.length
      ? await prisma.product.findMany({
        where: { id: { in: linkedProductIds } },
        select: { id: true, sku: true, name: true },
      })
      : []
    const linkedProductMap = new Map(linkedProducts.map(product => [product.id, product]))
    const opportunities = rawOpportunities.map(item => ({
      ...item,
      product: item.productId ? linkedProductMap.get(item.productId) || null : null,
    }))

    const purchaseWhere: any = {
      productId: null,
      linkStatus: { in: DEVELOPMENT_LINK_STATUSES },
    }

    if (status && status !== 'all' && DEVELOPMENT_LINK_STATUSES.includes(status)) {
      purchaseWhere.linkStatus = status
    }

    if (search) {
      purchaseWhere.OR = [
        { productNameSnapshot: { contains: search } },
        { note: { contains: search } },
        { purchaseOrder: { is: { orderNo: { contains: search } } } },
        { purchaseOrder: { is: { supplierNameSnapshot: { contains: search } } } },
        { purchaseOrder: { is: { supplier: { is: { name: { contains: search } } } } } },
      ]
    }

    if (supplier && supplier !== 'all') {
      purchaseWhere.purchaseOrder = {
        is: {
          OR: [
            { supplierNameSnapshot: supplier },
            { supplier: { is: { name: supplier } } },
          ],
        },
      }
    }

    const [purchaseDevelopmentItems, allPurchaseDevelopmentItems] = await Promise.all([
      prisma.purchaseOrderItem.findMany({
        where: purchaseWhere,
        include: {
          productOpportunity: true,
          purchaseOrder: {
            select: {
              id: true,
              orderNo: true,
              status: true,
              expectedArrivalDate: true,
              supplierId: true,
              supplierNameSnapshot: true,
              supplier: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.purchaseOrderItem.findMany({
        where: {
          productId: null,
          linkStatus: { in: DEVELOPMENT_LINK_STATUSES },
        },
        include: {
          purchaseOrder: {
            select: {
              supplierNameSnapshot: true,
              supplier: { select: { name: true } },
            },
          },
        },
      }),
    ])

    // 统计各状态数量
    const statusCounts = await prisma.productOpportunity.groupBy({
      by: ['status'],
      _count: { id: true },
    })

    const purchaseStatusCounts = DEVELOPMENT_LINK_STATUSES.reduce<Record<string, number>>((acc, item) => {
      acc[item] = 0
      return acc
    }, {})
    const supplierSet = new Set<string>()
    allPurchaseDevelopmentItems.forEach((item) => {
      if (item.linkStatus && item.linkStatus in purchaseStatusCounts) {
        purchaseStatusCounts[item.linkStatus] += 1
      }
      const supplierName = item.purchaseOrder.supplier?.name || item.purchaseOrder.supplierNameSnapshot
      if (supplierName) supplierSet.add(supplierName)
    })

    const mappedPurchaseDevelopmentItems = purchaseDevelopmentItems.map((item) => {
      const supplierName = item.purchaseOrder.supplier?.name || item.purchaseOrder.supplierNameSnapshot || '未填写'
      return {
        id: item.id,
        productNameSnapshot: item.productNameSnapshot,
        linkStatus: item.linkStatus,
        linkStatusLabel: item.linkStatus ? LINK_STATUS_LABELS[item.linkStatus] || item.linkStatus : '未标记',
        supplierName,
        supplierId: item.purchaseOrder.supplier?.id || item.purchaseOrder.supplierId || null,
        orderedQty: item.orderedQty,
        receivedQty: item.receivedQty,
        openQty: Math.max(item.orderedQty - item.receivedQty, 0),
        unitCostRmb: item.unitCostRmb,
        expectedArrivalDate: item.purchaseOrder.expectedArrivalDate?.toISOString() || null,
        orderNo: item.purchaseOrder.orderNo,
        purchaseOrderId: item.purchaseOrder.id,
        purchaseOrderStatus: item.purchaseOrder.status,
        productStatus: '未关联',
        opportunityId: item.productOpportunity?.id || null,
        opportunityExists: Boolean(item.productOpportunity),
        opportunity: item.productOpportunity ? {
          id: item.productOpportunity.id,
          name: item.productOpportunity.name,
          category: item.productOpportunity.category,
          styleType: item.productOpportunity.styleType,
          heatLevel: item.productOpportunity.heatLevel,
          sourceNote: item.productOpportunity.sourceNote,
          existingSimilar: item.productOpportunity.existingSimilar,
          diffPoints: item.productOpportunity.diffPoints,
          suggestedAction: item.productOpportunity.suggestedAction,
          priority: item.productOpportunity.priority,
          assignee: item.productOpportunity.assignee,
          notes: item.productOpportunity.notes,
          status: item.productOpportunity.status,
          productId: item.productOpportunity.productId,
          purchaseOrderItemId: item.productOpportunity.purchaseOrderItemId,
          createdAt: item.productOpportunity.createdAt.toISOString(),
          updatedAt: item.productOpportunity.updatedAt.toISOString(),
        } : null,
      }
    })

    return NextResponse.json({
      opportunities,
      statusCounts: Object.fromEntries(statusCounts.map(s => [s.status, s._count.id])),
      purchaseDevelopmentItems: mappedPurchaseDevelopmentItems,
      purchaseDevelopmentStats: {
        NEW_PRODUCT: purchaseStatusCounts.NEW_PRODUCT || 0,
        DIFFERENT_CRAFT: purchaseStatusCounts.DIFFERENT_CRAFT || 0,
        SKU_PENDING: purchaseStatusCounts.SKU_PENDING || 0,
        total: allPurchaseDevelopmentItems.length,
      },
      supplierOptions: Array.from(supplierSet).sort((a, b) => a.localeCompare(b)),
    })
  } catch (error) {
    console.error('获取选品更新池失败:', error)
    return NextResponse.json({ error: '获取选品更新池失败' }, { status: 500 })
  }
}

// 创建选品机会
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userRole = (session.user as any).role
    if (!canManageProductOpportunities(userRole)) {
      return NextResponse.json({ error: '无权限' }, { status: 403 })
    }

    const data = await request.json()
    const purchaseOrderItemId = typeof data.purchaseOrderItemId === 'string' && data.purchaseOrderItemId.trim()
      ? data.purchaseOrderItemId.trim()
      : null

    if (purchaseOrderItemId) {
      const purchaseOrderItem = await prisma.purchaseOrderItem.findUnique({
        where: { id: purchaseOrderItemId },
        select: {
          id: true,
          productId: true,
          linkStatus: true,
          productOpportunity: { select: { id: true } },
        },
      })

      if (!purchaseOrderItem) {
        return NextResponse.json({ error: '采购明细不存在，无法创建开发档案' }, { status: 400 })
      }

      if (purchaseOrderItem.productId) {
        return NextResponse.json({ error: '该采购明细已关联 Product，不能创建新品开发档案' }, { status: 400 })
      }

      if (!purchaseOrderItem.linkStatus || !DEVELOPMENT_LINK_STATUSES.includes(purchaseOrderItem.linkStatus)) {
        return NextResponse.json({ error: '该采购明细不属于新品开发池，不能创建开发档案' }, { status: 400 })
      }

      if (purchaseOrderItem.productOpportunity) {
        return NextResponse.json({ error: '该采购明细已经存在开发档案，请直接编辑' }, { status: 409 })
      }
    }

    const opportunity = await prisma.productOpportunity.create({
      data: {
        name: data.name,
        category: data.category || null,
        styleType: data.styleType || null,
        heatLevel: data.heatLevel || '中',
        sourceNote: data.sourceNote || null,
        existingSimilar: data.existingSimilar || null,
        diffPoints: data.diffPoints || null,
        suggestedAction: data.suggestedAction || '观察',
        priority: data.priority || '中',
        assignee: data.assignee || null,
        notes: data.notes || null,
        status: data.status || '可观察',
        productId: data.productId || null,
        purchaseOrderItemId,
      },
    })

    return NextResponse.json(opportunity)
  } catch (error: any) {
    console.error('创建选品机会失败:', error)
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: '该采购明细已经存在开发档案，请直接编辑' }, { status: 409 })
    }
    return NextResponse.json({ error: '创建选品机会失败' }, { status: 500 })
  }
}

// 更新选品机会
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userRole = (session.user as any).role
    if (!canManageProductOpportunities(userRole)) {
      return NextResponse.json({ error: '无权限' }, { status: 403 })
    }

    const data = await request.json()
    const { id, ...fields } = data

    if (!id) {
      return NextResponse.json({ error: '缺少 ID' }, { status: 400 })
    }

    const allowedFields = [
      'name',
      'category',
      'styleType',
      'heatLevel',
      'sourceNote',
      'existingSimilar',
      'diffPoints',
      'suggestedAction',
      'priority',
      'assignee',
      'notes',
      'status',
      'productId',
    ]

    const updateData: any = {}
    for (const key of allowedFields) {
      if (key in fields) {
        updateData[key] = fields[key as keyof typeof fields]
      }
    }

    const opportunity = await prisma.productOpportunity.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(opportunity)
  } catch (error) {
    console.error('更新选品机会失败:', error)
    return NextResponse.json({ error: '更新选品机会失败' }, { status: 500 })
  }
}

// 删除选品机会
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const userRole = (session.user as any).role
    if (!canManageProductOpportunities(userRole)) {
      return NextResponse.json({ error: '无权限' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: '缺少 ID' }, { status: 400 })
    }

    await prisma.productOpportunity.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除选品机会失败:', error)
    return NextResponse.json({ error: '删除选品机会失败' }, { status: 500 })
  }
}
