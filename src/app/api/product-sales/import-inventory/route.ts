import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import * as XLSX from 'xlsx'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type InventoryFailure = {
  row: number
  sku: string
  productName?: string
  reason: string
}

type ProductLookup = {
  id: string
  sku: string | null
  name: string
  skuId: string | null
}

type QtyParseResult = {
  value: number
  invalid: boolean
}

function parseQty(value: unknown): QtyParseResult {
  if (value === null || value === undefined) {
    return { value: 0, invalid: false }
  }
  if (typeof value === 'number') {
    return {
      value: Number.isFinite(value) ? Math.round(value) : 0,
      invalid: !Number.isFinite(value),
    }
  }

  const text = String(value).trim()
  if (!text || text === '/' || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') {
    return { value: 0, invalid: false }
  }

  const normalized = text.replace(/,/g, '')
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    return { value: 0, invalid: true }
  }

  return { value: Math.round(parsed), invalid: false }
}

function normalizeHeader(value: unknown) {
  return String(value ?? '').trim()
}

function getCell(row: Record<string, unknown>, fieldName: string) {
  return row[fieldName]
}

function normalizeSku(value: string) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function updateProductLookupMaps(
  product: ProductLookup,
  productBySkuMap: Map<string, ProductLookup>,
  productByNameMap: Map<string, ProductLookup>,
  productBySkuIdMap: Map<string, ProductLookup>,
  productByNormalizedSkuMap: Map<string, ProductLookup>,
) {
  if (product.sku) {
    productBySkuMap.set(product.sku, product)

    const normalized = normalizeSku(product.sku)
    if (normalized && !productByNormalizedSkuMap.has(normalized)) {
      productByNormalizedSkuMap.set(normalized, product)
    }
  }

  if (product.name && !productByNameMap.has(product.name)) {
    productByNameMap.set(product.name, product)
  }

  if (product.skuId) {
    productBySkuIdMap.set(product.skuId, product)
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const user = session.user as any
    const userRole = user?.role as string | undefined
    if (!userRole || (userRole !== 'admin' && userRole !== 'operator' && userRole !== 'optimizer')) {
      return NextResponse.json({ error: '无权限导入库存数据' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: '请上传库存 Excel 文件' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const workbook = XLSX.read(bytes, { type: 'array' })
    const firstSheetName = workbook.SheetNames[0]

    if (!firstSheetName) {
      return NextResponse.json({ error: 'Excel 文件没有可读取的工作表' }, { status: 400 })
    }

    const sheet = workbook.Sheets[firstSheetName]
    const rawRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: '',
    })

    if (rawRows.length < 4) {
      return NextResponse.json({ error: '库存文件中没有可导入的数据' }, { status: 400 })
    }

    const headerRow = Array.isArray(rawRows[0]) ? rawRows[0] : []
    const headers = headerRow.map((cell) => normalizeHeader(cell))
    const dataRows = rawRows.slice(3)

    if (!headers.length || !dataRows.length) {
      return NextResponse.json({ error: '库存文件中没有可导入的数据' }, { status: 400 })
    }

    const failures: InventoryFailure[] = []
    const candidates = dataRows.map((row, index) => {
      const record = headers.reduce<Record<string, unknown>>((acc, header, headerIndex) => {
        if (header) {
          acc[header] = Array.isArray(row) ? row[headerIndex] : ''
        }
        return acc
      }, {})

      const excelRowNumber = index + 4
      const productName = String(getCell(record, '商品名称') || '').trim()
      const platformSku = String(getCell(record, 'SKU') || '').trim()
      const sku = String(getCell(record, '商家 SKU') || '').trim()
      const itemId = String(getCell(record, '商品 ID') || '').trim()
      const skuId = String(getCell(record, 'SKU ID') || '').trim()
      if (!sku) {
        failures.push({
          row: excelRowNumber,
          sku: '',
          productName,
          reason: '商家 SKU 为空',
        })
        return null
      }

      if (sku === '-' || sku === '不可编辑') {
        failures.push({
          row: excelRowNumber,
          sku,
          productName,
          reason: '商家 SKU 无效',
        })
        return null
      }

      const availableQtyResult = parseQty(getCell(record, '可售数量'))
      const lockedQtyResult = parseQty(getCell(record, '锁定数量'))
      const rawSunnymayHairQty = getCell(record, 'Sunnymay Hair 总数量')
      const sunnymayHairQtyResult = parseQty(rawSunnymayHairQty)
      const fc03Atl1QtyResult = parseQty(getCell(record, 'FC03_ATL1 总数量'))
      const fc14Ewr4QtyResult = parseQty(getCell(record, 'FC14_EWR4 总数量'))
      const fc09Atl2QtyResult = parseQty(getCell(record, 'FC09_ATL2 总数量'))

      if (
        availableQtyResult.invalid ||
        lockedQtyResult.invalid ||
        sunnymayHairQtyResult.invalid ||
        fc03Atl1QtyResult.invalid ||
        fc14Ewr4QtyResult.invalid ||
        fc09Atl2QtyResult.invalid
      ) {
        failures.push({
          row: excelRowNumber,
          sku,
          productName,
          reason: '数量字段格式错误',
        })
        return null
      }

      const availableQty = availableQtyResult.value
      const lockedQty = lockedQtyResult.value
      const sunnymayHairQty = sunnymayHairQtyResult.value
      const fc03Atl1Qty = fc03Atl1QtyResult.value
      const fc14Ewr4Qty = fc14Ewr4QtyResult.value
      const fc09Atl2Qty = fc09Atl2QtyResult.value
      const hasSunnymayHairQty =
        rawSunnymayHairQty !== null &&
        rawSunnymayHairQty !== undefined &&
        String(rawSunnymayHairQty).trim() !== '' &&
        String(rawSunnymayHairQty).trim() !== '/'
      const totalQty = hasSunnymayHairQty
        ? sunnymayHairQty
        : (fc03Atl1Qty + fc14Ewr4Qty + fc09Atl2Qty)

      return {
        row: excelRowNumber,
        sku,
        productName,
        platformSku,
        itemId,
        skuId,
        availableQty,
        lockedQty,
        sunnymayHairQty,
        fc03Atl1Qty,
        fc14Ewr4Qty,
        fc09Atl2Qty,
        totalQty,
      }
    }).filter(Boolean) as Array<{
      row: number
      sku: string
      productName: string
      platformSku: string
      itemId: string
      skuId: string
      availableQty: number
      lockedQty: number
      sunnymayHairQty: number
      fc03Atl1Qty: number
      fc14Ewr4Qty: number
      fc09Atl2Qty: number
      totalQty: number
    }>

    if (!candidates.length) {
      return NextResponse.json({
        success: false,
        successCount: 0,
        updatedExistingCount: 0,
        autoFilledSkuCount: 0,
        autoCreatedCount: 0,
        failureCount: failures.length,
        failures,
      }, { status: 400 })
    }

    const products = await prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        skuId: true,
      },
    })

    const productBySkuMap = new Map<string, ProductLookup>()
    const productByNameMap = new Map<string, ProductLookup>()
    const productBySkuIdMap = new Map<string, ProductLookup>()
    const productByNormalizedSkuMap = new Map<string, ProductLookup>()

    for (const product of products) {
      updateProductLookupMaps(
        product,
        productBySkuMap,
        productByNameMap,
        productBySkuIdMap,
        productByNormalizedSkuMap,
      )
    }

    const snapshotDate = new Date()
    snapshotDate.setHours(0, 0, 0, 0)

    let successCount = 0
    let updatedExistingCount = 0
    let autoFilledSkuCount = 0
    let autoCreatedCount = 0
    let reviewCount = 0

    for (const item of candidates) {
      try {
        let product = productBySkuMap.get(item.sku) || null
        let importMode: 'existing' | 'filled' | 'created' = 'existing'
        let shouldReview = false
        let reviewReason = ''

        if (!product && item.platformSku) {
          product = productBySkuMap.get(item.platformSku) || null
        }

        if (!product) {
          const matchedByExternalId =
            (item.skuId ? productBySkuIdMap.get(item.skuId) : null) ||
            (item.itemId ? productBySkuIdMap.get(item.itemId) : null) ||
            null

          if (matchedByExternalId) {
            if (!matchedByExternalId.sku) {
              const updatedProduct = await prisma.product.update({
                where: { id: matchedByExternalId.id },
                data: {
                  sku: item.sku,
                  skuId: matchedByExternalId.skuId || item.skuId || item.itemId || null,
                },
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  skuId: true,
                },
              })

              product = updatedProduct
              importMode = 'filled'
              updateProductLookupMaps(
                updatedProduct,
                productBySkuMap,
                productByNameMap,
                productBySkuIdMap,
                productByNormalizedSkuMap,
              )
            } else {
              product = matchedByExternalId
            }
          }
        }

        if (!product && item.productName) {
          const matchedByName = productByNameMap.get(item.productName) || null
          if (matchedByName?.sku && matchedByName.sku !== item.sku) {
            shouldReview = true
            reviewReason = '商品名称已存在但 SKU 不一致，请人工确认是否为同一商品'
          } else if (matchedByName) {
            const updatedProduct = await prisma.product.update({
              where: { id: matchedByName.id },
              data: {
                sku: item.sku,
                skuId: matchedByName.skuId || item.skuId || item.itemId || null,
              },
              select: {
                id: true,
                sku: true,
                name: true,
                skuId: true,
              },
            })

            product = updatedProduct
            importMode = 'filled'
            updateProductLookupMaps(
              updatedProduct,
              productBySkuMap,
              productByNameMap,
              productBySkuIdMap,
              productByNormalizedSkuMap,
            )
          }
        }

        if (!product && !shouldReview) {
          const normalizedSku = normalizeSku(item.sku)
          const similarSku = normalizedSku ? productByNormalizedSkuMap.get(normalizedSku) || null : null

          if (similarSku && similarSku.sku && similarSku.sku !== item.sku) {
            shouldReview = true
            reviewReason = '检测到 SKU 相似但不完全一致，请人工确认是否为同一商品'
          }
        }

        if (shouldReview) {
          reviewCount += 1
          failures.push({
            row: item.row,
            sku: item.sku,
            productName: item.productName,
            reason: reviewReason,
          })
          continue
        }

        if (!product) {
          const createdProduct = await prisma.product.create({
            data: {
              sku: item.sku,
              name: item.productName || item.sku,
              skuId: item.skuId || item.itemId || null,
              stock: item.totalQty,
            },
            select: {
              id: true,
              sku: true,
              name: true,
              skuId: true,
            },
          })

          product = createdProduct
          importMode = 'created'
          updateProductLookupMaps(
            createdProduct,
            productBySkuMap,
            productByNameMap,
            productBySkuIdMap,
            productByNormalizedSkuMap,
          )
        }

        const snapshotSku = product.sku || item.sku

        await prisma.$transaction([
          prisma.productInventorySnapshot.upsert({
            where: {
              sku_date: {
                sku: snapshotSku,
                date: snapshotDate,
              },
            },
            create: {
              sku: snapshotSku,
              date: snapshotDate,
              availableQty: item.availableQty,
              lockedQty: item.lockedQty,
              sunnymayHairQty: item.sunnymayHairQty,
              fc03Atl1Qty: item.fc03Atl1Qty,
              fc14Ewr4Qty: item.fc14Ewr4Qty,
              fc09Atl2Qty: item.fc09Atl2Qty,
              totalQty: item.totalQty,
              sourceFileName: file.name,
            },
            update: {
              availableQty: item.availableQty,
              lockedQty: item.lockedQty,
              sunnymayHairQty: item.sunnymayHairQty,
              fc03Atl1Qty: item.fc03Atl1Qty,
              fc14Ewr4Qty: item.fc14Ewr4Qty,
              fc09Atl2Qty: item.fc09Atl2Qty,
              totalQty: item.totalQty,
              sourceFileName: file.name,
            },
          }),
          prisma.product.update({
            where: { id: product.id },
            data: {
              stock: item.totalQty,
            },
          }),
        ])

        if (importMode === 'existing') {
          updatedExistingCount += 1
        } else if (importMode === 'filled') {
          autoFilledSkuCount += 1
        } else if (importMode === 'created') {
          autoCreatedCount += 1
        }

        successCount += 1
      } catch (error) {
        console.error('导入库存行失败:', error)
        failures.push({
          row: item.row,
          sku: item.sku,
          productName: item.productName,
          reason: '写入库存数据失败',
        })
      }
    }

    const hint =
      reviewCount > 0
        ? '检测到商品名称已存在但 SKU 不一致，为避免重复创建，请先人工确认产品库 SKU。'
        : null

    return NextResponse.json({
      success: true,
      successCount,
      updatedExistingCount,
      autoFilledSkuCount,
      autoCreatedCount,
      reviewCount,
      failureCount: failures.length,
      failures,
      hint,
    })
  } catch (error) {
    console.error('导入库存数据失败:', error)
    return NextResponse.json({ error: '导入库存数据失败，请检查文件格式' }, { status: 500 })
  }
}
