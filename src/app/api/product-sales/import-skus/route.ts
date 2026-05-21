import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import * as XLSX from 'xlsx'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type ImportStage = 'parse-file' | 'check-products' | 'write-products' | 'done'

type ImportIssueRow = {
  row: number
  sku: string
  productName?: string
  reason: string
}

type ParsedSkuRow = {
  row: number
  sku: string
  productName: string
  skuId: string
  productId: string
  sourceField: 'Seller SKU' | '商家 SKU' | 'SKU'
}

type ProductLookup = {
  id: string
  sku: string | null
  name: string
}

type CandidateResolution =
  | { type: 'existing'; sku: string }
  | { type: 'create'; sku: string }
  | { type: 'fill'; sku: string; productId: string }
  | { type: 'suspicious'; row: ImportIssueRow }

function normalizeHeader(value: unknown) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim()
}

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value.trim() : String(value).trim()
}

function normalizeSkuForCompare(value: string) {
  return normalizeCell(value).replace(/\s+/g, '').toUpperCase()
}

function normalizeName(value: string) {
  return normalizeCell(value)
}

function getNormalizedRowsFromSheet(sheet: XLSX.WorkSheet) {
  const rawRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: '',
  })

  if (!rawRows.length) return []

  const headerRow = Array.isArray(rawRows[0]) ? rawRows[0] : []
  const headers = headerRow.map((cell) => normalizeHeader(cell))

  return rawRows.slice(1).map((row, index) => {
    const record = headers.reduce<Record<string, unknown>>((acc, header, headerIndex) => {
      if (header) {
        acc[header] = Array.isArray(row) ? row[headerIndex] : ''
      }
      return acc
    }, {})

    return {
      rowNumber: index + 2,
      record,
    }
  })
}

function parseCsvText(text: string) {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell)
      currentCell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1
      }
      currentRow.push(currentCell)
      rows.push(currentRow)
      currentRow = []
      currentCell = ''
      continue
    }

    currentCell += char
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell)
    rows.push(currentRow)
  }

  if (!rows.length) return []

  const headers = (rows[0] || []).map((cell) => normalizeHeader(cell))
  return rows.slice(1).map((row, index) => {
    const record = headers.reduce<Record<string, unknown>>((acc, header, headerIndex) => {
      if (header) {
        acc[header] = row[headerIndex] ?? ''
      }
      return acc
    }, {})

    return {
      rowNumber: index + 2,
      record,
    }
  })
}

function pickSku(record: Record<string, unknown>) {
  const sellerSku = normalizeCell(record['Seller SKU'])
  if (sellerSku) {
    return { sku: sellerSku, sourceField: 'Seller SKU' as const }
  }

  const merchantSku = normalizeCell(record['商家 SKU'])
  if (merchantSku) {
    return { sku: merchantSku, sourceField: '商家 SKU' as const }
  }

  const sku = normalizeCell(record['SKU'])
  if (sku) {
    return { sku, sourceField: 'SKU' as const }
  }

  return null
}

function getSingleFillableProduct(
  products: ProductLookup[],
  requestedSku: string,
): { product: ProductLookup } | { error: string } | null {
  if (!products.length) return null

  const conflictingProduct = products.find((product) => product.sku && product.sku !== requestedSku)
  if (conflictingProduct) {
    return {
      error: conflictingProduct.name === requestedSku
        ? '产品名称已等于该 SKU，但数据库中已有不同 SKU，请人工确认'
        : '商品名称已存在但 SKU 不一致，请人工确认',
    }
  }

  const fillableProducts = products.filter((product) => !product.sku)
  if (fillableProducts.length === 1) {
    return { product: fillableProducts[0] }
  }

  if (fillableProducts.length > 1) {
    return { error: '匹配到多个空 SKU 产品，请人工确认后再补齐' }
  }

  return null
}

function hasFillableError(
  result: { product: ProductLookup } | { error: string } | null,
): result is { error: string } {
  return Boolean(result && 'error' in result)
}

function hasFillableProduct(
  result: { product: ProductLookup } | { error: string } | null,
): result is { product: ProductLookup } {
  return Boolean(result && 'product' in result)
}

function resolveCandidate(
  candidate: ParsedSkuRow,
  exactSkuMap: Map<string, ProductLookup>,
  normalizedSkuMap: Map<string, ProductLookup[]>,
  nameMap: Map<string, ProductLookup[]>,
  normalizedFileMap: Map<string, ParsedSkuRow[]>,
  reservedProductIds: Set<string>,
): CandidateResolution {
  if (exactSkuMap.has(candidate.sku)) {
    return { type: 'existing', sku: candidate.sku }
  }

  const normalizedSku = normalizeSkuForCompare(candidate.sku)
  const fileVariants = normalizedFileMap.get(normalizedSku) || []
  const distinctRawSkus = Array.from(new Set(fileVariants.map((item) => item.sku)))
  if (distinctRawSkus.length > 1) {
    return {
      type: 'suspicious',
      row: {
        row: candidate.row,
        sku: candidate.sku,
        productName: candidate.productName || undefined,
        reason: '检测到相似 SKU，请人工确认',
      },
    }
  }

  const nameEqualsSkuMatches = nameMap.get(candidate.sku) || []
  const fillBySkuName = getSingleFillableProduct(nameEqualsSkuMatches, candidate.sku)
  if (hasFillableError(fillBySkuName)) {
    return {
      type: 'suspicious',
      row: {
        row: candidate.row,
        sku: candidate.sku,
        productName: candidate.productName || undefined,
        reason: fillBySkuName.error,
      },
    }
  }
  if (hasFillableProduct(fillBySkuName)) {
    if (reservedProductIds.has(fillBySkuName.product.id)) {
      return {
        type: 'suspicious',
        row: {
          row: candidate.row,
          sku: candidate.sku,
          productName: candidate.productName || undefined,
          reason: '同一空 SKU 产品匹配到多个文件 SKU，请人工确认',
        },
      }
    }
    reservedProductIds.add(fillBySkuName.product.id)
    return { type: 'fill', sku: candidate.sku, productId: fillBySkuName.product.id }
  }

  const productName = normalizeName(candidate.productName)
  if (productName) {
    const nameMatches = nameMap.get(productName) || []
    const fillByProductName = getSingleFillableProduct(nameMatches, candidate.sku)
    if (hasFillableError(fillByProductName)) {
      return {
        type: 'suspicious',
        row: {
          row: candidate.row,
          sku: candidate.sku,
          productName: candidate.productName || undefined,
          reason: '商品名称已存在但 SKU 不一致，请人工确认',
        },
      }
    }
    if (hasFillableProduct(fillByProductName)) {
      if (reservedProductIds.has(fillByProductName.product.id)) {
        return {
          type: 'suspicious',
          row: {
            row: candidate.row,
            sku: candidate.sku,
            productName: candidate.productName || undefined,
            reason: '同一空 SKU 产品匹配到多个文件 SKU，请人工确认',
          },
        }
      }
      reservedProductIds.add(fillByProductName.product.id)
      return { type: 'fill', sku: candidate.sku, productId: fillByProductName.product.id }
    }
  }

  const normalizedMatches = normalizedSkuMap.get(normalizedSku) || []
  const similarSkuProduct = normalizedMatches.find((product) => product.sku && product.sku !== candidate.sku)
  if (similarSkuProduct) {
    return {
      type: 'suspicious',
      row: {
        row: candidate.row,
        sku: candidate.sku,
        productName: candidate.productName || undefined,
        reason: '检测到相似 SKU，请人工确认',
      },
    }
  }

  return { type: 'create', sku: candidate.sku }
}

export async function POST(request: NextRequest) {
  let stage: ImportStage = 'parse-file'

  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const user = session.user as any
    const userRole = user?.role as string | undefined
    if (!userRole || (userRole !== 'admin' && userRole !== 'operator' && userRole !== 'optimizer')) {
      return NextResponse.json({ error: '无权限导入产品 SKU' }, { status: 403 })
    }

    const dryRun = request.nextUrl.searchParams.get('dryRun') === '1'
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: '请上传订单或库存文件' }, { status: 400 })
    }

    const fileName = String(file.name || '').trim()
    const lowerFileName = fileName.toLowerCase()
    const bytes = await file.arrayBuffer()

    let rows: Array<{ rowNumber: number; record: Record<string, unknown> }> = []

    try {
      if (lowerFileName.endsWith('.csv')) {
        const text = new TextDecoder('utf-8').decode(bytes)
        rows = parseCsvText(text)
      } else {
        const workbook = XLSX.read(bytes, { type: 'array' })
        const targetSheetName = workbook.SheetNames.includes('OrderSKUList')
          ? 'OrderSKUList'
          : workbook.SheetNames[0]

        if (!targetSheetName) {
          return NextResponse.json({ error: '文件没有可读取的工作表' }, { status: 400 })
        }

        rows = getNormalizedRowsFromSheet(workbook.Sheets[targetSheetName])
      }
    } catch (error) {
      console.error('解析 SKU 导入文件失败:', error)
      return NextResponse.json({ error: '解析文件失败，请检查格式' }, { status: 400 })
    }

    if (!rows.length) {
      return NextResponse.json({ error: '文件中没有可读取的数据' }, { status: 400 })
    }

    const skippedRows: ImportIssueRow[] = []
    const failedRows: ImportIssueRow[] = []
    const parsedRows: ParsedSkuRow[] = []

    rows.forEach(({ rowNumber, record }) => {
      try {
        const pickedSku = pickSku(record)
        const productName = normalizeCell(record['Product Name']) || normalizeCell(record['商品名称'])
        const skuId = normalizeCell(record['SKU ID'])
        const productId = normalizeCell(record['商品 ID'])

        if (!pickedSku) {
          skippedRows.push({
            row: rowNumber,
            sku: '',
            productName: productName || undefined,
            reason: '未提取到 SKU，已跳过',
          })
          return
        }

        const sku = normalizeCell(pickedSku.sku)
        if (!sku || sku === '-' || sku === '不可编辑') {
          skippedRows.push({
            row: rowNumber,
            sku,
            productName: productName || undefined,
            reason: 'SKU 无效，已跳过',
          })
          return
        }

        parsedRows.push({
          row: rowNumber,
          sku,
          productName,
          skuId,
          productId,
          sourceField: pickedSku.sourceField,
        })
      } catch (error) {
        console.error('解析 SKU 行失败:', error)
        failedRows.push({
          row: rowNumber,
          sku: '',
          reason: '解析行失败',
        })
      }
    })

    const totalRows = rows.length
    const extractedSkuCount = parsedRows.length

    const uniqueBySku = new Map<string, ParsedSkuRow>()
    let duplicateInFileCount = 0
    parsedRows.forEach((row) => {
      const existing = uniqueBySku.get(row.sku)
      if (existing) {
        duplicateInFileCount += 1
        if (!existing.productName && row.productName) {
          uniqueBySku.set(row.sku, {
            ...existing,
            productName: row.productName,
          })
        }
        return
      }
      uniqueBySku.set(row.sku, row)
    })

    const uniqueCandidates = Array.from(uniqueBySku.values())
    const uniqueSkuCount = uniqueCandidates.length

    stage = 'check-products'
    const products = await prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
      },
    })

    const exactSkuMap = new Map<string, ProductLookup>()
    const normalizedSkuMap = new Map<string, ProductLookup[]>()
    const nameMap = new Map<string, ProductLookup[]>()

    products.forEach((product) => {
      if (product.sku) {
        exactSkuMap.set(product.sku, product)
        const normalizedSku = normalizeSkuForCompare(product.sku)
        const normalizedBucket = normalizedSkuMap.get(normalizedSku) || []
        normalizedBucket.push(product)
        normalizedSkuMap.set(normalizedSku, normalizedBucket)
      }

      const normalizedProductName = normalizeName(product.name)
      if (normalizedProductName) {
        const nameBucket = nameMap.get(normalizedProductName) || []
        nameBucket.push(product)
        nameMap.set(normalizedProductName, nameBucket)
      }
    })

    const normalizedFileMap = new Map<string, ParsedSkuRow[]>()
    uniqueCandidates.forEach((candidate) => {
      const normalizedSku = normalizeSkuForCompare(candidate.sku)
      const bucket = normalizedFileMap.get(normalizedSku) || []
      bucket.push(candidate)
      normalizedFileMap.set(normalizedSku, bucket)
    })

    const reservedProductIds = new Set<string>()
    const suspiciousRows: ImportIssueRow[] = []
    const existingSkus: string[] = []
    const newSkus: string[] = []
    const fillableSkus: string[] = []
    const createCandidates: ParsedSkuRow[] = []
    const fillCandidates: Array<ParsedSkuRow & { productId: string }> = []

    uniqueCandidates.forEach((candidate) => {
      const resolution = resolveCandidate(
        candidate,
        exactSkuMap,
        normalizedSkuMap,
        nameMap,
        normalizedFileMap,
        reservedProductIds,
      )

      if (resolution.type === 'existing') {
        existingSkus.push(candidate.sku)
        return
      }

      if (resolution.type === 'create') {
        newSkus.push(candidate.sku)
        createCandidates.push(candidate)
        return
      }

      if (resolution.type === 'fill') {
        fillableSkus.push(candidate.sku)
        fillCandidates.push({
          ...candidate,
          productId: resolution.productId,
        })
        return
      }

      suspiciousRows.push(resolution.row)
    })

    if (!dryRun) {
      stage = 'write-products'

      for (const candidate of fillCandidates) {
        await prisma.product.update({
          where: { id: candidate.productId },
          data: {
            sku: candidate.sku,
          },
        })
      }

      for (const candidate of createCandidates) {
        await prisma.product.create({
          data: {
            sku: candidate.sku,
            name: candidate.sku,
            stock: 0,
          },
        })
      }
    }

    stage = 'done'

    return NextResponse.json({
      success: true,
      mode: dryRun ? 'dryRun' : 'import',
      stage,
      fileName,
      totalRows,
      extractedSkuCount,
      uniqueSkuCount,
      existingSkuCount: existingSkus.length,
      newSkuCount: newSkus.length,
      fillableSkuCount: fillableSkus.length,
      duplicateInFileCount,
      suspiciousCount: suspiciousRows.length,
      createdCount: dryRun ? 0 : createCandidates.length,
      filledCount: dryRun ? 0 : fillCandidates.length,
      existingSkus,
      newSkus,
      fillableSkus,
      suspiciousRows,
      skippedRows,
      failedRows,
    })
  } catch (error) {
    console.error('导入产品 SKU 失败:', error)
    return NextResponse.json(
      {
        error: '导入产品 SKU 失败',
        detail: error instanceof Error ? error.message : '未知错误',
        stage,
      },
      { status: 500 },
    )
  }
}
