import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type SupportedField = 'name' | 'color' | 'length' | 'style' | 'image'

type ParsedRow = {
  rowNumber: number
  rawLine: string
  sku: string
  name?: string
  color?: string
  length?: string
  style?: string
  image?: string
}

type IssueRow = {
  rowNumber: number
  rawLine: string
  sku: string
  resolvedSku?: string
  reason: string
}

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value.trim() : String(value).trim()
}

function normalizeSkuKey(value: string) {
  return normalizeCell(value).replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, '').toUpperCase()
}

function normalizeBracketText(value: string) {
  return normalizeCell(value).replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, ' ')
}

function extractAliasSkusFromText(value: string | null | undefined) {
  const aliases = new Set<string>()
  const text = normalizeBracketText(value || '')
  if (!text) return []

  const pattern = /[（(]\s*([^()（）]+?)\s*[)）]/g
  let match = pattern.exec(text)
  while (match) {
    const alias = normalizeCell(match[1])
    if (alias) aliases.add(alias)
    match = pattern.exec(text)
  }

  return Array.from(aliases)
}

function extractMainSku(value: string | null | undefined) {
  const text = normalizeBracketText(value || '')
  const matched = text.match(/^(.+?)\s*\(\s*([^()]+?)\s*\)$/)
  return matched ? normalizeCell(matched[1]) : text
}

function splitDelimitedLine(line: string) {
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | '' = ''

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if ((char === '"' || char === "'") && !quote) {
      quote = char as '"' | "'"
      continue
    }
    if (char === quote) {
      quote = ''
      continue
    }
    if (!quote && char === ',') {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }

  parts.push(current.trim())
  return parts
}

function mapHeaderKey(value: string): SupportedField | 'sku' | null {
  const normalized = normalizeCell(value).toLowerCase().replace(/[\s_-]+/g, '')
  if (normalized === 'sku') return 'sku'
  if (normalized === 'name' || normalized === 'productname' || normalized === '产品名' || normalized === '品名') return 'name'
  if (normalized === 'color' || normalized === '颜色') return 'color'
  if (normalized === 'length' || normalized === '长度') return 'length'
  if (normalized === 'style' || normalized === '款式') return 'style'
  if (normalized === 'image' || normalized === 'imageurl' || normalized === '图片' || normalized === '图片链接') return 'image'
  return null
}

function isEmptyDetail(value: string | null | undefined) {
  return !normalizeCell(value)
}

function formatValueSummary(record: Record<SupportedField, string>) {
  return (Object.entries(record) as Array<[SupportedField, string]>)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}:${value}`)
    .join(' | ')
}

async function requireProductEditor() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return { error: NextResponse.json({ error: '未登录' }, { status: 401 }) }
  }

  return { error: null }
}

export async function POST(request: NextRequest) {
  try {
    const { error } = await requireProductEditor()
    if (error) return error

    const body = await request.json()
    const text = normalizeCell(body?.text)
    const dryRun = body?.dryRun !== false
    const allowOverwrite = body?.allowOverwrite === true

    if (!text) {
      return NextResponse.json({ error: '请先粘贴批量更新内容' }, { status: 400 })
    }

    const lines = text.split(/\r?\n/).filter((line) => normalizeCell(line))
    if (lines.length < 2) {
      return NextResponse.json({ error: '请包含表头和至少一行数据' }, { status: 400 })
    }

    const headerLine = lines[0]
    const headerParts = headerLine.includes('\t')
      ? headerLine.split('\t').map((part) => normalizeCell(part))
      : splitDelimitedLine(headerLine)

    const mappedHeaders = headerParts.map(mapHeaderKey)
    const skuIndex = mappedHeaders.findIndex((item) => item === 'sku')
    if (skuIndex < 0) {
      return NextResponse.json({ error: '表头必须包含 SKU 列' }, { status: 400 })
    }

    const parsedRows: ParsedRow[] = []
    const issueRows: IssueRow[] = []

    lines.slice(1).forEach((line, rowOffset) => {
      const rowNumber = rowOffset + 2
      const values = line.includes('\t')
        ? line.split('\t').map((part) => normalizeCell(part))
        : splitDelimitedLine(line)

      const row: ParsedRow = {
        rowNumber,
        rawLine: line,
        sku: '',
      }

      mappedHeaders.forEach((headerKey, index) => {
        if (!headerKey) return
        const value = values[index] || ''
        if (headerKey === 'sku') {
          row.sku = value
          return
        }
        row[headerKey] = value
      })

      if (!normalizeCell(row.sku)) {
        issueRows.push({
          rowNumber,
          rawLine: line,
          sku: '',
          reason: 'SKU 不能为空',
        })
        return
      }

      parsedRows.push(row)
    })

    const duplicateRows: Array<{ rowNumber: number; rawLine: string; sku: string; normalizedSku: string; action: string }> = []
    const dedupedRows = new Map<string, ParsedRow>()
    parsedRows.forEach((row) => {
      const dedupeKey = normalizeSkuKey(extractMainSku(row.sku) || row.sku)
      if (dedupedRows.has(dedupeKey)) {
        duplicateRows.push({
          rowNumber: row.rowNumber,
          rawLine: row.rawLine,
          sku: row.sku,
          normalizedSku: extractMainSku(row.sku) || row.sku,
          action: '保留最后一条',
        })
      }
      dedupedRows.set(dedupeKey, row)
    })

    const [products, aliases] = await Promise.all([
      prisma.product.findMany({
        select: {
          id: true,
          sku: true,
          name: true,
          color: true,
          length: true,
          style: true,
          image: true,
        },
      }),
      prisma.productSkuAlias.findMany({
        select: {
          aliasSku: true,
          productId: true,
        },
      }),
    ])

    const productById = new Map(products.map((product) => [product.id, product]))
    const matchIndex = new Map<string, Set<string>>()
    const registerMatch = (value: string | null | undefined, productId: string) => {
      const key = normalizeSkuKey(value || '')
      if (!key) return
      const bucket = matchIndex.get(key) || new Set<string>()
      bucket.add(productId)
      matchIndex.set(key, bucket)
    }

    products.forEach((product) => {
      if (!product.sku) return
      registerMatch(product.sku, product.id)
      registerMatch(normalizeBracketText(product.sku), product.id)
      registerMatch(extractMainSku(product.sku), product.id)
      extractAliasSkusFromText(product.sku).forEach((aliasSku) => registerMatch(aliasSku, product.id))
      extractAliasSkusFromText(product.name).forEach((aliasSku) => registerMatch(aliasSku, product.id))
    })

    aliases.forEach((alias) => {
      registerMatch(alias.aliasSku, alias.productId)
    })

    const previewRows: Array<{
      rowNumber: number
      inputSku: string
      resolvedSku: string
      currentValues: Record<SupportedField, string>
      nextValues: Record<SupportedField, string>
      changedFields: SupportedField[]
      mode: 'update' | 'fill-empty' | 'skip'
      reason: string
      productId: string
    }> = []
    const notFoundRows: IssueRow[] = []
    const conflictRows: IssueRow[] = []
    const updateOps: Array<{ id: string; data: Partial<Record<SupportedField, string>> }> = []

    Array.from(dedupedRows.values()).forEach((row) => {
      const normalizedInputSku = normalizeBracketText(row.sku)
      const mainSku = extractMainSku(row.sku)
      const aliasSkus = extractAliasSkusFromText(row.sku)
      const candidateKeys = [
        normalizeSkuKey(mainSku),
        ...aliasSkus.map(normalizeSkuKey),
        normalizeSkuKey(row.sku),
        normalizeSkuKey(normalizedInputSku),
      ].filter(Boolean)

      let matchedProductIds = new Set<string>()
      for (const key of candidateKeys) {
        const bucket = matchIndex.get(key)
        if (!bucket || bucket.size === 0) continue
        matchedProductIds = new Set(bucket)
        break
      }

      if (matchedProductIds.size === 0) {
        notFoundRows.push({
          rowNumber: row.rowNumber,
          rawLine: row.rawLine,
          sku: row.sku,
          resolvedSku: mainSku || normalizedInputSku,
          reason: '按 SKU / 主 SKU / 别称均未匹配到产品',
        })
        return
      }

      if (matchedProductIds.size > 1) {
        conflictRows.push({
          rowNumber: row.rowNumber,
          rawLine: row.rawLine,
          sku: row.sku,
          resolvedSku: mainSku || normalizedInputSku,
          reason: '匹配到多个产品，存在重复风险，请先清理产品库 SKU / 别称',
        })
        return
      }

      const productId = Array.from(matchedProductIds)[0]
      const product = productById.get(productId)
      if (!product || !product.sku) {
        conflictRows.push({
          rowNumber: row.rowNumber,
          rawLine: row.rawLine,
          sku: row.sku,
          resolvedSku: mainSku || normalizedInputSku,
          reason: '匹配到的产品缺少 SKU，已跳过',
        })
        return
      }

      const currentValues: Record<SupportedField, string> = {
        name: normalizeCell(product.name),
        color: normalizeCell(product.color),
        length: normalizeCell(product.length),
        style: normalizeCell(product.style),
        image: normalizeCell(product.image),
      }

      const incomingValues: Record<SupportedField, string> = {
        name: normalizeCell(row.name),
        color: normalizeCell(row.color),
        length: normalizeCell(row.length),
        style: normalizeCell(row.style),
        image: normalizeCell(row.image),
      }

      const nextValues = { ...currentValues }
      const changedFields: SupportedField[] = []
      const updateData: Partial<Record<SupportedField, string>> = {}

      ;(Object.keys(incomingValues) as SupportedField[]).forEach((field) => {
        const incomingValue = incomingValues[field]
        if (!incomingValue) return
        const currentValue = currentValues[field]
        if (allowOverwrite) {
          if (currentValue !== incomingValue) {
            nextValues[field] = incomingValue
            updateData[field] = incomingValue
            changedFields.push(field)
          }
          return
        }

        if (isEmptyDetail(currentValue)) {
          nextValues[field] = incomingValue
          updateData[field] = incomingValue
          changedFields.push(field)
        }
      })

      const mode = changedFields.length > 0 ? (allowOverwrite ? 'update' : 'fill-empty') : 'skip'
      const reason = mode === 'skip'
        ? (allowOverwrite ? '目标字段与现有值相同，无需更新' : '默认仅补空字段，现有值已存在')
        : (allowOverwrite ? '将按指定字段覆盖更新' : '将只补空字段')

      previewRows.push({
        rowNumber: row.rowNumber,
        inputSku: row.sku,
        resolvedSku: extractMainSku(product.sku) || product.sku,
        currentValues,
        nextValues,
        changedFields,
        mode,
        reason,
        productId,
      })

      if (changedFields.length > 0) {
        updateOps.push({ id: productId, data: updateData })
      }
    })

    if (!dryRun && updateOps.length > 0) {
      await prisma.$transaction(
        updateOps.map((item) => prisma.product.update({
          where: { id: item.id },
          data: item.data,
        })),
      )
    }

    return NextResponse.json({
      dryRun,
      allowOverwrite,
      totalRows: lines.length - 1,
      parsedCount: parsedRows.length,
      duplicateInInputCount: duplicateRows.length,
      matchedCount: previewRows.length,
      updateCount: previewRows.filter((item) => item.changedFields.length > 0).length,
      skippedCount: previewRows.filter((item) => item.changedFields.length === 0).length,
      notFoundCount: notFoundRows.length,
      conflictCount: conflictRows.length,
      previewRows: previewRows.map((item) => ({
        rowNumber: item.rowNumber,
        inputSku: item.inputSku,
        resolvedSku: item.resolvedSku,
        currentSummary: formatValueSummary(item.currentValues) || '-',
        nextSummary: formatValueSummary(item.nextValues) || '-',
        changedFields: item.changedFields,
        mode: item.mode,
        reason: item.reason,
      })),
      duplicateRows,
      notFoundRows,
      conflictRows,
      parseIssueRows: issueRows,
    })
  } catch (error) {
    console.error('批量更新产品信息失败:', error)
    return NextResponse.json({ error: '批量更新产品信息失败' }, { status: 500 })
  }
}
