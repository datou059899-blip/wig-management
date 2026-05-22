import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type BaselinePayloadItem = {
  sku: string
  quantity: number
  lineNumber?: number
}

type BaselineFailure = {
  lineNumber: number
  sku: string
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
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
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
  const rawLineNumber = Number((item as any)?.lineNumber)
  const lineNumber = Number.isInteger(rawLineNumber) && rawLineNumber > 0 ? rawLineNumber : index + 1

  if (!sku) {
    return {
      item: null,
      failure: {
        lineNumber,
        sku: '',
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
        reason: '初始库存必须是大于等于 0 的整数',
      },
    }
  }

  return {
    item: {
      sku,
      quantity,
      lineNumber,
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
    const baselineDateText = normalizeCell(body?.baselineDate)
    const note = normalizeCell(body?.note)

    if (!baselineDateText) {
      return NextResponse.json({ error: '基准日期不能为空' }, { status: 400 })
    }

    const baselineDate = parseDateInput(baselineDateText)
    if (!baselineDate) {
      return NextResponse.json({ error: '基准日期格式必须为 YYYY-MM-DD' }, { status: 400 })
    }

    const rawItems: unknown[] = Array.isArray(body?.items)
      ? body.items
      : [{
          sku: body?.sku,
          quantity: body?.quantity,
          lineNumber: 1,
        }]

    const failures: BaselineFailure[] = []
    const dedupedItemsBySkuKey = new Map<string, BaselinePayloadItem>()
    let duplicateInInputCount = 0

    rawItems.forEach((item, index) => {
      const { item: validatedItem, failure } = validateBaselineItem(item, index)
      if (failure) {
        failures.push(failure)
        return
      }
      if (!validatedItem) return

      const skuKey = normalizeSkuKey(validatedItem.sku)
      if (dedupedItemsBySkuKey.has(skuKey)) {
        duplicateInInputCount += 1
      }
      dedupedItemsBySkuKey.set(skuKey, validatedItem)
    })

    const items = Array.from(dedupedItemsBySkuKey.values())
    if (!items.length) {
      return NextResponse.json({
        error: failures.length > 0 ? '没有可保存的库存基准数据' : 'SKU 不能为空',
        successCount: 0,
        createdCount: 0,
        updatedCount: 0,
        failureCount: failures.length,
        duplicateInInputCount,
        unmatchedSkuCount: 0,
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
          sku: {
            in: items.map((item) => item.sku),
          },
          baselineDate,
        },
        select: {
          sku: true,
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
    const existingSkuSet = new Set(existingBaselines.map((item) => item.sku))

    const savedBaselines = await prisma.$transaction(items.map((item) => (
      prisma.productStockBaseline.upsert({
        where: {
          sku_baselineDate: {
            sku: item.sku,
            baselineDate,
          },
        },
        update: {
          quantity: item.quantity,
          note: note || null,
        },
        create: {
          sku: item.sku,
          quantity: item.quantity,
          baselineDate,
          note: note || null,
        },
      })
    )))

    const createdCount = items.filter((item) => !existingSkuSet.has(item.sku)).length
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
      failures,
      baselines: savedBaselines.map(serializeBaseline),
    })
  } catch (error) {
    console.error('保存库存基准失败:', error)
    return NextResponse.json({ error: '保存库存基准失败' }, { status: 500 })
  }
}
