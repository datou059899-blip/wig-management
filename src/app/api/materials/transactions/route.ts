import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const TRANSACTION_TYPES = new Set(['consume', 'replenish', 'adjust', 'damage'])

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value.trim() : String(value).trim()
}

function parseQty(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return NaN
  return Number(parsed.toFixed(4))
}

function parseDateInput(value: string) {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return null

  const [, yearText, monthText, dayText] = matched
  const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText), 0, 0, 0, 0)
  return Number.isNaN(date.getTime()) ? null : date
}

function serializeTransaction(transaction: {
  id: string
  materialId: string
  materialName: string
  type: string
  quantity: number
  beforeQty: number
  afterQty: number
  transactionDate: Date
  reason: string | null
  note: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: transaction.id,
    materialId: transaction.materialId,
    materialName: transaction.materialName,
    type: transaction.type,
    quantity: transaction.quantity,
    beforeQty: transaction.beforeQty,
    afterQty: transaction.afterQty,
    transactionDate: transaction.transactionDate.toISOString(),
    reason: transaction.reason || '',
    note: transaction.note || '',
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
  }
}

async function requireSession() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { error: NextResponse.json({ error: '未登录' }, { status: 401 }) }
  }

  return { error: null }
}

async function requireOperator() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { error: NextResponse.json({ error: '未登录' }, { status: 401 }) }
  }

  const permissionContext = getSessionPermissionContext(session)
  if (!canManagePage(permissionContext, 'materials')) {
    return { error: NextResponse.json({ error: '无权限操作耗材管理' }, { status: 403 }) }
  }

  return { error: null }
}

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireSession()
    if (error) return error

    const { searchParams } = new URL(request.url)
    const materialId = normalizeCell(searchParams.get('materialId'))

    const transactions = await prisma.materialTransaction.findMany({
      where: materialId ? { materialId } : undefined,
      orderBy: [
        { transactionDate: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    return NextResponse.json({
      transactions: transactions.map(serializeTransaction),
    })
  } catch (error) {
    console.error('获取耗材变更记录失败:', error)
    return NextResponse.json({ error: '获取耗材变更记录失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const body = await request.json()
    const materialId = normalizeCell(body?.materialId)
    const type = normalizeCell(body?.type)
    const quantityInput = parseQty(body?.quantity)
    const transactionDateText = normalizeCell(body?.transactionDate)
    const reason = normalizeCell(body?.reason)
    const note = normalizeCell(body?.note)

    if (!materialId) {
      return NextResponse.json({ error: '缺少耗材 ID' }, { status: 400 })
    }

    if (!TRANSACTION_TYPES.has(type)) {
      return NextResponse.json({ error: '变更类型无效' }, { status: 400 })
    }

    if (!transactionDateText) {
      return NextResponse.json({ error: '变更日期不能为空' }, { status: 400 })
    }

    const transactionDate = parseDateInput(transactionDateText)
    if (!transactionDate) {
      return NextResponse.json({ error: '变更日期格式必须为 YYYY-MM-DD' }, { status: 400 })
    }

    if (!Number.isFinite(quantityInput)) {
      return NextResponse.json({ error: '数量必须是有效数字' }, { status: 400 })
    }

    if ((type === 'consume' || type === 'damage' || type === 'replenish') && quantityInput <= 0) {
      return NextResponse.json({ error: '数量必须大于 0' }, { status: 400 })
    }

    if (type === 'adjust' && quantityInput < 0) {
      return NextResponse.json({ error: '调整后数量不能小于 0' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const material = await tx.materialItem.findUnique({
        where: { id: materialId },
      })

      if (!material || !material.isActive) {
        throw new Error('耗材不存在或已停用')
      }

      const beforeQty = material.currentQty
      let afterQty = beforeQty
      let recordedQuantity = quantityInput

      if (type === 'consume' || type === 'damage') {
        afterQty = Number((beforeQty - quantityInput).toFixed(4))
        if (afterQty < 0) {
          throw new Error('当前库存不足，不能扣减为负数')
        }
      } else if (type === 'replenish') {
        afterQty = Number((beforeQty + quantityInput).toFixed(4))
      } else if (type === 'adjust') {
        afterQty = Number(quantityInput.toFixed(4))
        recordedQuantity = Number((afterQty - beforeQty).toFixed(4))
      }

      const updatedMaterial = await tx.materialItem.update({
        where: { id: material.id },
        data: {
          currentQty: afterQty,
        },
      })

      const transaction = await tx.materialTransaction.create({
        data: {
          materialId: material.id,
          materialName: material.name,
          type,
          quantity: recordedQuantity,
          beforeQty,
          afterQty,
          transactionDate,
          reason: reason || null,
          note: note || null,
        },
      })

      return {
        material: updatedMaterial,
        transaction,
      }
    })

    return NextResponse.json({
      material: {
        id: result.material.id,
        name: result.material.name,
        unit: result.material.unit || '',
        initialQty: result.material.initialQty,
        currentQty: result.material.currentQty,
        warningQty: result.material.warningQty,
        note: result.material.note || '',
        isActive: result.material.isActive,
        createdAt: result.material.createdAt.toISOString(),
        updatedAt: result.material.updatedAt.toISOString(),
      },
      transaction: serializeTransaction(result.transaction),
    })
  } catch (error) {
    console.error('保存耗材变更记录失败:', error)
    const message = error instanceof Error ? error.message : '保存耗材变更记录失败'
    const status = message === '耗材不存在或已停用'
      ? 404
      : (
          message === '当前库存不足，不能扣减为负数'
            ? 400
            : 500
        )
    return NextResponse.json({ error: message }, { status })
  }
}
