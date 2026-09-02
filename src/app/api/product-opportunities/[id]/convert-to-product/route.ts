import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createProduct, ProductSkuConflictError } from '@/lib/products'
import { linkPurchaseOrderItemProductInTransaction } from '@/lib/purchaseOrders'
import { canConvertProductOpportunity } from '@/lib/permissions'

const DEVELOPMENT_LINK_STATUSES = ['NEW_PRODUCT', 'DIFFERENT_CRAFT', 'SKU_PENDING']

function unauthorized() {
  return NextResponse.json({ error: '无权限' }, { status: 403 })
}

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  const userRole = (session?.user as any)?.role
  if (!session || !canConvertProductOpportunity(userRole)) {
    return unauthorized()
  }

  const body = await request.json().catch(() => ({}))
  const mode = body.mode === 'link-existing' ? 'link-existing' : 'create-new'
  const productId = trimString(body.productId)
  const sku = trimString(body.sku)
  const name = trimString(body.name)

  if (mode === 'create-new' && (!sku || !name)) {
    return NextResponse.json({ error: '请填写正式 SKU 和正式商品名' }, { status: 400 })
  }
  if (mode === 'link-existing' && !productId) {
    return NextResponse.json({ error: '请选择要关联的正式商品' }, { status: 400 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const opportunity = await tx.productOpportunity.findUnique({
        where: { id: params.id },
        include: {
          purchaseOrderItem: {
            include: {
              purchaseOrder: {
                select: {
                  supplierId: true,
                  supplierNameSnapshot: true,
                },
              },
            },
          },
        },
      })

      if (!opportunity) throw new Error('开发档案不存在')
      if (opportunity.productId) throw new Error('该开发档案已转为正式商品')

      const purchaseItem = opportunity.purchaseOrderItem
      if (purchaseItem) {
        if (purchaseItem.productId) throw new Error('采购明细已关联正式商品')
        if (!purchaseItem.linkStatus || !DEVELOPMENT_LINK_STATUSES.includes(purchaseItem.linkStatus)) {
          throw new Error('采购明细当前状态不允许转为正式商品')
        }
      }

      let product
      if (mode === 'link-existing') {
        product = await tx.product.findUnique({
          where: { id: productId },
          select: { id: true, sku: true, name: true, isActive: true },
        })
        if (!product || !product.isActive) throw new Error('关联商品不存在或已停用')
      } else {
        product = await createProduct({
          sku,
          name,
          style: opportunity.styleType || undefined,
          defaultSupplierId: purchaseItem?.purchaseOrder.supplierId || null,
          costCny: purchaseItem?.unitCostRmb ?? 0,
          businessStatus: 'ACTIVE',
          isActive: true,
          stock: 0,
        }, tx)
      }

      const opportunityUpdate = await tx.productOpportunity.updateMany({
        where: {
          id: opportunity.id,
          productId: null,
        },
        data: {
          productId: product.id,
          status: '已完成',
        },
      })
      if (opportunityUpdate.count !== 1) {
        throw new Error('该开发档案已被其他操作处理，请刷新后重试')
      }

      if (purchaseItem) {
        await linkPurchaseOrderItemProductInTransaction(tx, {
          itemId: purchaseItem.id,
          productId: product.id,
          allowedLinkStatuses: DEVELOPMENT_LINK_STATUSES,
        })
      }

      return product
    })

    return NextResponse.json({ product: result })
  } catch (error) {
    if (error instanceof ProductSkuConflictError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'SKU 已存在，请使用不同的 SKU' }, { status: 400 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '转为正式商品失败' },
      { status: 400 },
    )
  }
}
