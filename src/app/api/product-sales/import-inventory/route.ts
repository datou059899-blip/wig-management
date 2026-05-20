import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import * as XLSX from 'xlsx'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type InventoryFailure = {
  row: number
  sku: string
  reason: string
}

function parseQty(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value) : null
  }

  const text = String(value).trim()
  if (!text) return null

  const normalized = text.replace(/,/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.round(parsed) : null
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
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

    if (!rows.length) {
      return NextResponse.json({ error: '库存文件中没有可导入的数据' }, { status: 400 })
    }

    const failures: InventoryFailure[] = []
    const candidates = rows.map((row, index) => {
      const sku = String(row['商家 SKU'] || '').trim()
      if (!sku) {
        failures.push({
          row: index + 2,
          sku: '',
          reason: '商家 SKU 为空',
        })
        return null
      }

      const availableQty = parseQty(row['可售数量']) ?? 0
      const lockedQty = parseQty(row['锁定数量']) ?? 0
      const sunnymayHairQtyRaw = parseQty(row['Sunnymay Hair 总数量'])
      const fc03Atl1Qty = parseQty(row['FC03_ATL1 总数量']) ?? 0
      const fc14Ewr4Qty = parseQty(row['FC14_EWR4 总数量']) ?? 0
      const fc09Atl2Qty = parseQty(row['FC09_ATL2 总数量']) ?? 0
      const sunnymayHairQty = sunnymayHairQtyRaw ?? 0
      const totalQty =
        sunnymayHairQtyRaw ?? (fc03Atl1Qty + fc14Ewr4Qty + fc09Atl2Qty)

      return {
        row: index + 2,
        sku,
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
        failureCount: failures.length,
        failures,
      }, { status: 400 })
    }

    const skuList = Array.from(new Set(candidates.map((item) => item.sku)))
    const products = await prisma.product.findMany({
      where: {
        sku: {
          in: skuList,
        },
      },
      select: {
        id: true,
        sku: true,
      },
    })

    const productMap = new Map(
      products
        .filter((product): product is { id: string; sku: string } => Boolean(product.sku))
        .map((product) => [product.sku, product]),
    )

    const snapshotDate = new Date()
    snapshotDate.setHours(0, 0, 0, 0)

    let successCount = 0

    for (const item of candidates) {
      const product = productMap.get(item.sku)
      if (!product) {
        failures.push({
          row: item.row,
          sku: item.sku,
          reason: '未找到匹配的 Product.sku',
        })
        continue
      }

      try {
        await prisma.$transaction([
          prisma.productInventorySnapshot.upsert({
            where: {
              sku_date: {
                sku: item.sku,
                date: snapshotDate,
              },
            },
            create: {
              sku: item.sku,
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

        successCount += 1
      } catch (error) {
        console.error('导入库存行失败:', error)
        failures.push({
          row: item.row,
          sku: item.sku,
          reason: '写入库存数据失败',
        })
      }
    }

    return NextResponse.json({
      success: true,
      successCount,
      failureCount: failures.length,
      failures,
    })
  } catch (error) {
    console.error('导入库存数据失败:', error)
    return NextResponse.json({ error: '导入库存数据失败，请检查文件格式' }, { status: 500 })
  }
}
