import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type BaselinePayloadItem = {
  sku: string
  quantity: number
  baselineDate?: string
  lineNumber?: number
  rawLine?: string
}

type BaselineFailure = {
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
  return normalizeCell(value).replace(/\s+/g, '').toUpperCase()
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

  const user = session.user as any
  const userRole = user?.role as string | undefined
  if (!userRole || (userRole !== 'admin' && userRole !== 'operator' && userRole !== 'optimizer')) {
    return { error: NextResponse.json({ error: '无权限' }, { status: 403 }) }
  }

  return { error: null }
}

function serializeBaseline(baseline: {
  id: string
  sku: string
  quantity: number
  baselineDate: Date
  note: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: baseline.id,
    sku: baseline.sku,
    quantity: baseline.quantity,
    baselineDate: formatDateKey(baseline.baselineDate),
    note: baseline.note || '',
    createdAt: baseline.createdAt.toISOString(),
    updatedAt: baseline.updatedAt.toISOString(),
  }
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

function validateBaselineItem(item: unknown, index: number): {
  item: BaselinePayloadItem | null
  failure: BaselineFailure | null
} {
  const sku = normalizeCell((item as any)?.sku)
  const quantity = Number((item as any)?.quantity)
  const baselineDate = normalizeCell((item as any)?.baselineDate)
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
        date: baselineDate,
        rawLine,
        reason: 'SKU 不能为空',
      },
    }
  }

  if (!Number.isInteger(quantity) || quantity < 0) {
    return {
      item: null,
      failure: {
        lineNumber,
        sku,
        quantity: Number.isFinite(quantity) ? quantity : null,
        date: baselineDate,
        rawLine,
        reason: '初始库存必须是大于等于 0 的整数',
      },
    }
  }

  return {
    item: {
      sku,
      quantity,
      baselineDate,
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

    const baselines = await prisma.productStockBaseline.findMany({
      where: sku ? { sku } : undefined,
      orderBy: [
        { baselineDate: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    return NextResponse.json({
      baselines: baselines.map(serializeBaseline),
    })
  } catch (error) {
    console.error('获取库存基准失败:', error)
    return NextResponse.json({ error: '获取库存基准失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const body = await request.json()
    const defaultBaselineDateText = normalizeCell(body?.baselineDate)
    const note = normalizeCell(body?.note)
    const defaultBaselineDate = defaultBaselineDateText ? parseDateInput(defaultBaselineDateText) : null

    if (!Array.isArray(body?.items)) {
      if (!defaultBaselineDateText) {
        return NextResponse.json({ error: '基准日期不能为空' }, { status: 400 })
      }
      if (!defaultBaselineDate) {
        return NextResponse.json({ error: '基准日期格式必须为 YYYY-MM-DD' }, { status: 400 })
      }
    } else if (defaultBaselineDateText && !defaultBaselineDate) {
      return NextResponse.json({ error: '统一基准日期格式必须为 YYYY-MM-DD' }, { status: 400 })
    }

    const rawItems: unknown[] = Array.isArray(body?.items)
      ? body.items
      : [{
          sku: body?.sku,
          quantity: body?.quantity,
          baselineDate: body?.baselineDate,
          lineNumber: 1,
        }]

    const failures: BaselineFailure[] = []
    const dedupedItemsBySkuDateKey = new Map<string, BaselinePayloadItem & { resolvedBaselineDateText: string }>()
    let duplicateInInputCount = 0

    rawItems.forEach((item, index) => {
      const { item: validatedItem, failure } = validateBaselineItem(item, index)
      if (failure) {
        failures.push(failure)
        return
      }
      if (!validatedItem) return

      const effectiveDateText = normalizeCell(validatedItem.baselineDate) || defaultBaselineDateText
      if (!effectiveDateText) {
        failures.push({
          lineNumber: validatedItem.lineNumber || index + 1,
          sku: validatedItem.sku,
          quantity: validatedItem.quantity,
          date: '',
          rawLine: validatedItem.rawLine || '',
          reason: '缺少基准日期',
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
          reason: '基准日期格式必须为 YYYY-MM-DD',
        })
        return
      }

      const resolvedBaselineDateText = formatDateKey(parsedItemDate)
      const skuDateKey = `${normalizeSkuKey(validatedItem.sku)}::${resolvedBaselineDateText}`
      if (dedupedItemsBySkuDateKey.has(skuDateKey)) {
        duplicateInInputCount += 1
      }
      dedupedItemsBySkuDateKey.set(skuDateKey, {
        ...validatedItem,
        resolvedBaselineDateText,
      })
    })

    const items = Array.from(dedupedItemsBySkuDateKey.values())
    if (!items.length) {
      return NextResponse.json({
        error: failures.length > 0 ? '没有可保存的库存基准数据' : 'SKU 不能为空',
        successCount: 0,
        createdCount: 0,
        updatedCount: 0,
        failureCount: failures.length,
        duplicateInInputCount,
        unmatchedSkuCount: 0,
        usedItemDateCount: 0,
        usedDefaultDateCount: 0,
        failures,
      }, { status: 400 })
    }

    const [products, aliases, existingBaselines] = await Promise.all([
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
      prisma.productStockBaseline.findMany({
        where: {
          OR: items.map((item) => ({
            sku: item.sku,
            baselineDate: parseDateInput(item.resolvedBaselineDateText)!,
          })),
        },
        select: {
          sku: true,
          baselineDate: true,
        },
      }),
    ])

    const knownSkuKeys = new Set<string>()
    products.forEach((product) => {
      knownSkuKeys.add(normalizeSkuKey(product.sku || ''))
      extractAliasSkusFromText(product.sku).forEach((aliasSku) => knownSkuKeys.add(normalizeSkuKey(aliasSku)))
      extractAliasSkusFromText(product.name).forEach((aliasSku) => knownSkuKeys.add(normalizeSkuKey(aliasSku)))
    })
    aliases.forEach((alias) => {
      knownSkuKeys.add(normalizeSkuKey(alias.aliasSku))
    })

    const unmatchedSkuCount = items.filter((item) => !knownSkuKeys.has(normalizeSkuKey(item.sku))).length
    const existingSkuDateSet = new Set(existingBaselines.map((item) => `${normalizeSkuKey(item.sku)}::${formatDateKey(item.baselineDate)}`))
    const usedItemDateCount = items.filter((item) => normalizeCell(item.baselineDate)).length
    const usedDefaultDateCount = items.length - usedItemDateCount

    const savedBaselines = await prisma.$transaction(items.map((item) => (
      prisma.productStockBaseline.upsert({
        where: {
          sku_baselineDate: {
            sku: item.sku,
            baselineDate: parseDateInput(item.resolvedBaselineDateText)!,
          },
        },
        update: {
          quantity: item.quantity,
          note: note || null,
        },
        create: {
          sku: item.sku,
          quantity: item.quantity,
          baselineDate: parseDateInput(item.resolvedBaselineDateText)!,
          note: note || null,
        },
      })
    )))

    const createdCount = items.filter((item) => !existingSkuDateSet.has(`${normalizeSkuKey(item.sku)}::${item.resolvedBaselineDateText}`)).length
    const updatedCount = items.length - createdCount

    if (!Array.isArray(body?.items)) {
      const baseline = savedBaselines[0]
      return NextResponse.json({
        baseline: serializeBaseline(baseline),
        successCount: 1,
        createdCount,
        updatedCount,
        failureCount: failures.length,
        duplicateInInputCount,
        unmatchedSkuCount,
        usedItemDateCount,
        usedDefaultDateCount,
        failures,
      })
    }

    return NextResponse.json({
      successCount: items.length,
      createdCount,
      updatedCount,
      failureCount: failures.length,
      duplicateInInputCount,
      unmatchedSkuCount,
      usedItemDateCount,
      usedDefaultDateCount,
      failures,
      baselines: savedBaselines.map(serializeBaseline),
    })
  } catch (error) {
    console.error('保存库存基准失败:', error)
    return NextResponse.json({ error: '保存库存基准失败' }, { status: 500 })
  }
}
