import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import * as XLSX from 'xlsx'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type OrderFailure = {
  row: number
  sku: string
  reason: string
}

function parseNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0

  const text = String(value).trim()
  if (!text) return 0

  const parsed = Number(text.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function parseDateString(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)

  if (typeof value === 'number') {
    const code = XLSX.SSF?.parse_date_code ? XLSX.SSF.parse_date_code(value) : null
    if (code) {
      const date = new Date(code.y, code.m - 1, code.d)
      return date.toISOString().slice(0, 10)
    }
  }

  const text = String(value).trim()
  if (!text) return null

  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function createDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map((part) => Number(part))
  return new Date(year, month - 1, day)
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
      return NextResponse.json({ error: '无权限导入订单数据' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: '请上传订单 Excel 文件' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const workbook = XLSX.read(bytes, { type: 'array' })
    const targetSheetName = workbook.SheetNames.includes('OrderSKUList')
      ? 'OrderSKUList'
      : workbook.SheetNames[0]

    if (!targetSheetName) {
      return NextResponse.json({ error: 'Excel 文件没有可读取的工作表' }, { status: 400 })
    }

    const sheet = workbook.Sheets[targetSheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

    if (!rows.length) {
      return NextResponse.json({ error: '订单文件中没有可导入的数据' }, { status: 400 })
    }

    const failures: OrderFailure[] = []
    const parsedRows = rows.map((row, index) => {
      const sku = String(row['Seller SKU'] || '').trim()
      if (!sku) {
        failures.push({
          row: index + 2,
          sku: '',
          reason: 'Seller SKU 为空',
        })
        return null
      }

      const dateStr =
        parseDateString(row['Paid Time']) ??
        parseDateString(row['Created Time'])

      if (!dateStr) {
        failures.push({
          row: index + 2,
          sku,
          reason: 'Paid Time 和 Created Time 都无法解析',
        })
        return null
      }

      const quantity = parseNumber(row['Quantity'])
      const returnQty = parseNumber(row['Sku Quantity of return'])
      const orders = quantity - returnQty

      return {
        row: index + 2,
        sku,
        dateStr,
        productName: String(row['Product Name'] || '').trim(),
        orders,
      }
    }).filter(Boolean) as Array<{
      row: number
      sku: string
      dateStr: string
      productName: string
      orders: number
    }>

    if (!parsedRows.length) {
      return NextResponse.json({
        success: false,
        successCount: 0,
        failureCount: failures.length,
        failures,
      }, { status: 400 })
    }

    const skuList = Array.from(new Set(parsedRows.map((item) => item.sku)))
    const products = await prisma.product.findMany({
      where: {
        sku: {
          in: skuList,
        },
      },
      select: {
        sku: true,
      },
    })

    const productSkuSet = new Set(
      products
        .map((product) => product.sku)
        .filter((sku): sku is string => Boolean(sku)),
    )

    const aggregated = new Map<string, { sku: string; dateStr: string; productName: string | null; orders: number }>()

    for (const item of parsedRows) {
      if (!productSkuSet.has(item.sku)) {
        failures.push({
          row: item.row,
          sku: item.sku,
          reason: '未找到匹配的 Product.sku',
        })
        continue
      }

      const key = `${item.sku}__${item.dateStr}`
      const current = aggregated.get(key)
      if (current) {
        current.orders += item.orders
        if (!current.productName && item.productName) {
          current.productName = item.productName
        }
      } else {
        aggregated.set(key, {
          sku: item.sku,
          dateStr: item.dateStr,
          productName: item.productName || null,
          orders: item.orders,
        })
      }
    }

    let successCount = 0

    for (const item of Array.from(aggregated.values())) {
      try {
        await prisma.performanceDaily.upsert({
          where: {
            date_sku: {
              sku: item.sku,
              date: createDate(item.dateStr),
            },
          },
          create: {
            sku: item.sku,
            date: createDate(item.dateStr),
            productName: item.productName,
            orders: item.orders,
          },
          update: {
            productName: item.productName ?? undefined,
            orders: item.orders,
          },
        })

        successCount += 1
      } catch (error) {
        console.error('导入订单汇总失败:', error)
        failures.push({
          row: 0,
          sku: item.sku,
          reason: `${item.dateStr} 写入 PerformanceDaily 失败`,
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
    console.error('导入订单数据失败:', error)
    return NextResponse.json({ error: '导入订单数据失败，请检查文件格式' }, { status: 500 })
  }
}
