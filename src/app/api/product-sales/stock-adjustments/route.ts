import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canManagePage, getSessionPermissionContext } from '@/lib/pagePermissions'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const ADJUSTMENT_TYPES = new Set(['replenish', 'manual_adjust', 'damage', 'other'])

type AdjustmentPayloadItem = {
  sku: string
  quantity: number
  adjustmentDate?: string
  lineNumber?: number
  rawLine?: string
}

type AdjustmentFailure = {
  lineNumber: number
  sku: string
  quantity?: number | null
  date?: string
  rawLine?: string
  reason: string
}

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value.trim() : String(value).trim()
}

function normalizeSkuKey(value: string) {
  return normalizeCell(value).replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, '').toUpperCase()
}

function extractMainSkuFromText(value: string | null | undefined) {
  const text = normalizeCell(value).replace(/（/g, '(').replace(/）/g, ')')
  const matched = text.match(/^(.+?)\s*\(\s*([^()]+?)\s*\)$/)
  return matched ? normalizeCell(matched[1]) : ''
}

function buildKnownSkuMatchKeys(value: string | null | undefined) {
  const keys = new Set<string>()
  const text = normalizeCell(value)
  if (!text) return []

  keys.add(text)
  const mainSku = extractMainSkuFromText(text)
  if (mainSku) {
    keys.add(mainSku)
  }
  extractAliasSkusFromText(text).forEach((aliasSku) => keys.add(aliasSku))
  return Array.from(keys)
}

function parseDateInput(value: string) {
  const normalized = normalizeCell(value).replace(/\//g, '-')
  const matched = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return null

  const [, yearText, monthText, dayText] = matched
  const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText), 0, 0, 0, 0)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function requireOperator() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { error: NextResponse.json({ error: '未登录' }, { status: 401 }) }
  }

  const permissionContext = getSessionPermissionContext(session)
  if (!canManagePage(permissionContext, 'productSales')) {
    return { error: NextResponse.json({ error: '无权限操作销售库存' }, { status: 403 }) }
  }

  return { error: null }
}

function extractAliasSkusFromText(value: string | null | undefined) {
  const aliases = new Set<string>()
  const text = normalizeCell(value)
  if (!text) return []

  const pattern = /[（(]\s*([^()（）]+?)\s*[)）]/g
  let match = pattern.exec(text)
  while (match) {
    const alias = normalizeCell(match[1])
    if (alias) {
      aliases.add(alias)
    }
    match = pattern.exec(text)
  }

  return Array.from(aliases)
}

function serializeAdjustment(adjustment: {
  id: string
  sku: string
  quantity: number
  adjustmentDate: Date
  type: string
  note: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: adjustment.id,
    sku: adjustment.sku,
    quantity: adjustment.quantity,
    adjustmentDate: formatDateKey(adjustment.adjustmentDate),
    type: adjustment.type,
    note: adjustment.note || '',
    createdAt: adjustment.createdAt.toISOString(),
    updatedAt: adjustment.updatedAt.toISOString(),
  }
}

function validateAdjustmentItem(item: unknown, index: number, type: string): {
  item: AdjustmentPayloadItem | null
  failure: AdjustmentFailure | null
} {
  const sku = normalizeCell((item as any)?.sku)
  const quantity = Number((item as any)?.quantity)
  const adjustmentDate = normalizeCell((item as any)?.adjustmentDate)
  const rawLineNumber = Number((item as any)?.lineNumber)
  const rawLine = normalizeCell((item as any)?.rawLine)
  const lineNumber = Number.isInteger(rawLineNumber) && rawLineNumber > 0 ? rawLineNumber : index + 1

  if (!sku) {
    return {
      item: null,
      failure: {
        lineNumber,
        sku: '',
        quantity: Number.isFinite(quantity) ? quantity : null,
        date: adjustmentDate,
        rawLine,
        reason: 'SKU 不能为空',
      },
    }
  }

  if (!Number.isInteger(quantity) || quantity === 0) {
    return {
      item: null,
      failure: {
        lineNumber,
        sku,
        quantity: Number.isFinite(quantity) ? quantity : null,
        date: adjustmentDate,
        rawLine,
        reason: '调整数量不能为 0，且必须是整数',
      },
    }
  }

  if (type === 'replenish' && quantity < 0) {
    return {
      item: null,
      failure: {
        lineNumber,
        sku,
        quantity,
        date: adjustmentDate,
        rawLine,
        reason: '补货数量必须为正数',
      },
    }
  }

  if (type === 'damage' && quantity > 0) {
    return {
      item: null,
      failure: {
        lineNumber,
        sku,
        quantity,
        date: adjustmentDate,
        rawLine,
        reason: '损耗数量必须为负数',
      },
    }
  }

  return {
    item: {
      sku,
      quantity,
      adjustmentDate,
      lineNumber,
      rawLine,
    },
    failure: null,
  }
}

export async function GET(request: NextRequest) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const { searchParams } = new URL(request.url)
    const sku = normalizeCell(searchParams.get('sku'))

    const adjustments = await prisma.productStockAdjustment.findMany({
      where: sku ? { sku } : undefined,
      orderBy: [
        { adjustmentDate: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    return NextResponse.json({
      adjustments: adjustments.map(serializeAdjustment),
    })
  } catch (error) {
    console.error('获取库存补货/调整记录失败:', error)
    return NextResponse.json({ error: '获取库存补货/调整记录失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const body = await request.json()
    const defaultAdjustmentDateText = normalizeCell(body?.adjustmentDate)
    const type = normalizeCell(body?.type)
    const note = normalizeCell(body?.note)

    const defaultAdjustmentDate = defaultAdjustmentDateText ? parseDateInput(defaultAdjustmentDateText) : null

    if (!Array.isArray(body?.items)) {
      if (!defaultAdjustmentDateText) {
        return NextResponse.json({ error: '调整日期不能为空' }, { status: 400 })
      }
      if (!defaultAdjustmentDate) {
        return NextResponse.json({ error: '调整日期格式必须为 YYYY-MM-DD' }, { status: 400 })
      }
    } else if (defaultAdjustmentDateText && !defaultAdjustmentDate) {
      return NextResponse.json({ error: '统一调整日期格式必须为 YYYY-MM-DD' }, { status: 400 })
    }

    if (!ADJUSTMENT_TYPES.has(type)) {
      return NextResponse.json({ error: '调整类型无效' }, { status: 400 })
    }

    const rawItems: unknown[] = Array.isArray(body?.items)
      ? body.items
      : [{
          sku: body?.sku,
          quantity: body?.quantity,
          adjustmentDate: body?.adjustmentDate,
          lineNumber: 1,
        }]

    const failures: AdjustmentFailure[] = []
    const dedupedItemsByCompositeKey = new Map<string, AdjustmentPayloadItem & { resolvedAdjustmentDateText: string }>()
    let duplicateInInputCount = 0

    rawItems.forEach((item, index) => {
      const { item: validatedItem, failure } = validateAdjustmentItem(item, index, type)
      if (failure) {
        failures.push(failure)
        return
      }
      if (!validatedItem) return

      const effectiveDateText = normalizeCell(validatedItem.adjustmentDate) || defaultAdjustmentDateText
      if (!effectiveDateText) {
        failures.push({
          lineNumber: validatedItem.lineNumber || index + 1,
          sku: validatedItem.sku,
          quantity: validatedItem.quantity,
          date: '',
          rawLine: validatedItem.rawLine || '',
          reason: '缺少调整日期',
        })
        return
      }

      const parsedItemDate = parseDateInput(effectiveDateText)
      if (!parsedItemDate) {
        failures.push({
          lineNumber: validatedItem.lineNumber || index + 1,
          sku: validatedItem.sku,
          quantity: validatedItem.quantity,
          date: effectiveDateText,
          rawLine: validatedItem.rawLine || '',
          reason: '调整日期格式必须为 YYYY-MM-DD',
        })
        return
      }

      const resolvedAdjustmentDateText = formatDateKey(parsedItemDate)
      const compositeKey = `${normalizeSkuKey(validatedItem.sku)}::${resolvedAdjustmentDateText}::${validatedItem.quantity}::${type}`
      if (dedupedItemsByCompositeKey.has(compositeKey)) {
        duplicateInInputCount += 1
      }
      dedupedItemsByCompositeKey.set(compositeKey, {
        ...validatedItem,
        resolvedAdjustmentDateText,
      })
    })

    const items = Array.from(dedupedItemsByCompositeKey.values())
    if (!items.length) {
      return NextResponse.json({
        error: failures.length > 0 ? '没有可保存的补货/调整数据' : 'SKU 不能为空',
        successCount: 0,
        failureCount: failures.length,
        duplicateInInputCount,
        unmatchedSkuCount: 0,
        usedItemDateCount: 0,
        usedDefaultDateCount: 0,
        failures,
      }, { status: 400 })
    }

    const [products, aliases] = await Promise.all([
      prisma.product.findMany({
        select: {
          sku: true,
          name: true,
        },
      }),
      prisma.productSkuAlias.findMany({
        select: {
          aliasSku: true,
        },
      }),
    ])

    const knownSkuKeys = new Set<string>()
    products.forEach((product) => {
      buildKnownSkuMatchKeys(product.sku).forEach((sku) => knownSkuKeys.add(normalizeSkuKey(sku)))
      buildKnownSkuMatchKeys(product.name).forEach((sku) => knownSkuKeys.add(normalizeSkuKey(sku)))
    })
    aliases.forEach((alias) => {
      knownSkuKeys.add(normalizeSkuKey(alias.aliasSku))
    })

    const unmatchedSkuCount = items.filter((item) => !knownSkuKeys.has(normalizeSkuKey(item.sku))).length
    const usedItemDateCount = items.filter((item) => normalizeCell(item.adjustmentDate)).length
    const usedDefaultDateCount = items.length - usedItemDateCount

    if (!Array.isArray(body?.items)) {
      const adjustment = await prisma.productStockAdjustment.create({
        data: {
          sku: items[0].sku,
          quantity: items[0].quantity,
          adjustmentDate: parseDateInput(items[0].resolvedAdjustmentDateText)!,
          type,
          note: note || null,
        },
      })

      return NextResponse.json({
        adjustment: serializeAdjustment(adjustment),
        successCount: 1,
        failureCount: failures.length,
        duplicateInInputCount,
        unmatchedSkuCount,
        usedItemDateCount,
        usedDefaultDateCount,
        failures,
      })
    }

    const createdCount = await prisma.productStockAdjustment.createMany({
      data: items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        adjustmentDate: parseDateInput(item.resolvedAdjustmentDateText)!,
        type,
        note: note || null,
      })),
    })

    return NextResponse.json({
      successCount: createdCount.count,
      failureCount: failures.length,
      duplicateInInputCount,
      unmatchedSkuCount,
      usedItemDateCount,
      usedDefaultDateCount,
      failures,
    })
  } catch (error) {
    console.error('保存库存补货/调整记录失败:', error)
    return NextResponse.json({ error: '保存库存补货/调整记录失败' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const body = await request.json()
    const id = normalizeCell(body?.id)
    if (!id) {
      return NextResponse.json({ error: '缺少调整记录 ID' }, { status: 400 })
    }

    await prisma.productStockAdjustment.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除库存补货/调整记录失败:', error)
    return NextResponse.json({ error: '删除库存补货/调整记录失败' }, { status: 500 })
  }
}
