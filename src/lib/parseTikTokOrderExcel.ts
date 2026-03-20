import * as XLSX from 'xlsx'

export type NormalizedOrderRow = {
  orderId?: string
  orderStatus?: string
  orderSubstatus?: string
  skuId?: string
  sku?: string
  productName?: string
  variation?: string
  quantity?: number
  gmv?: number
  refundAmount?: number
  taxes?: number
  createdAt?: string | null
  paidAt?: string | null
  fulfillmentType?: string
  warehouseName?: string
  trackingId?: string
  shippingProvider?: string
}

export type ParsedOrderResult = {
  meta: {
    sheetName: string
    headerRowIndex: number
    skippedDescriptionRowIndex: number
    dataStartRowIndex: number
    importedAt: string
  }
  rawRows: Record<string, unknown>[]
  normalizedRows: NormalizedOrderRow[]
  stats: {
    totalRows: number
    validRows: number
    skippedRows: number
    todayGMV: number
    todayOrders: number
  }
}

const CHINESE_LABELS: Record<string, string> = {
  orderId: '订单号',
  orderStatus: '订单状态',
  orderSubstatus: '订单子状态',
  skuId: 'SKU ID',
  sku: '商家SKU',
  productName: '产品名称',
  variation: '规格/变体',
  quantity: '数量',
  gmv: '订单金额',
  refundAmount: '退款金额',
  taxes: '税费',
  createdAt: '下单时间',
  paidAt: '支付时间',
  fulfillmentType: '履约方式',
  warehouseName: '仓库',
  trackingId: '物流单号',
  shippingProvider: '物流商',
}

function normalizeHeader(raw: unknown): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s) return null
  const cleaned = s
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[\(\)\[\]#]/g, '')
    .replace(/_/g, '')
    .replace(/-/g, '')

  if (cleaned.includes('orderid')) return 'orderId'
  if (cleaned.includes('ordersubstatus')) return 'orderSubstatus'
  if (cleaned.includes('orderstatus')) return 'orderStatus'
  if (cleaned.includes('skuid')) return 'skuId'
  if (cleaned.includes('sellersku') || cleaned === 'sku') return 'sku'
  if (cleaned.includes('productname') || cleaned.includes('itemname')) return 'productName'
  if (cleaned.includes('variation')) return 'variation'
  if (cleaned === 'quantity' || cleaned.includes('qty')) return 'quantity'
  if (cleaned.includes('orderamount')) return 'gmv'
  if (cleaned.includes('orderrefundamount')) return 'refundAmount'
  if (cleaned === 'taxes' || cleaned.includes('taxamount')) return 'taxes'
  if (cleaned.includes('createdtime') || cleaned.includes('ordercreated')) return 'createdAt'
  if (cleaned.includes('paidtime') || cleaned.includes('paymenttime')) return 'paidAt'
  if (cleaned.includes('fulfillmenttype')) return 'fulfillmentType'
  if (cleaned.includes('warehousename')) return 'warehouseName'
  if (cleaned.includes('trackingid')) return 'trackingId'
  if (cleaned.includes('shippingprovidername')) return 'shippingProvider'

  return null
}

function parseExcelDateTime(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'number') {
    const code = XLSX.SSF?.parse_date_code ? XLSX.SSF.parse_date_code(value) : null
    if (code) {
      const jsDate = new Date(code.y, code.m - 1, code.d, code.H || 0, code.M || 0, code.S || 0)
      return jsDate.toISOString()
    }
  }
  const s = String(value).trim()
  if (!s) return null
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

export async function parseTikTokOrderExcel(file: File): Promise<ParsedOrderResult> {
  const buf = await file.arrayBuffer()
  const workbook = XLSX.read(buf)

  const preferredSheetName =
    workbook.SheetNames.find((n) => n.toLowerCase() === 'orderskulist'.toLowerCase()) ??
    workbook.SheetNames[0]
  const sheet = workbook.Sheets[preferredSheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })

  const headerRowIndex = 0
  const skippedDescriptionRowIndex = 1
  const dataStartRowIndex = 2

  const headerRow = (rows[headerRowIndex] || []) as unknown[]
  const headerKeys: (string | null)[] = headerRow.map((cell) => normalizeHeader(cell))

  const rawRows: Record<string, unknown>[] = []
  const normalizedRows: NormalizedOrderRow[] = []

  let totalRows = 0
  let validRows = 0

  for (let i = dataStartRowIndex; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !Array.isArray(row)) continue

    const isAllEmpty = row.every(
      (cell) => cell === null || cell === undefined || String(cell).trim() === '',
    )
    if (isAllEmpty) continue

    totalRows++

    const normalized: NormalizedOrderRow = {}
    const rawRow: Record<string, unknown> = {}

    headerKeys.forEach((key, colIndex) => {
      if (!key) return
      const cell = row[colIndex]
      if (cell === undefined) return

      const zhLabel = CHINESE_LABELS[key] || String(headerRow[colIndex] ?? key)
      if (!(zhLabel in rawRow)) rawRow[zhLabel] = cell

      switch (key) {
        case 'orderId':
        case 'orderStatus':
        case 'orderSubstatus':
        case 'skuId':
        case 'sku':
        case 'productName':
        case 'variation':
        case 'fulfillmentType':
        case 'warehouseName':
        case 'trackingId':
        case 'shippingProvider':
          ;(normalized as Record<string, unknown>)[key] = String(cell || '').trim()
          break
        case 'quantity':
        case 'gmv':
        case 'refundAmount':
        case 'taxes':
          ;(normalized as Record<string, unknown>)[key] = Number(cell) || 0
          break
        case 'createdAt':
        case 'paidAt':
          ;(normalized as Record<string, unknown>)[key] = parseExcelDateTime(cell)
          break
        default:
          break
      }
    })

    const missingKeyFields =
      !normalized.orderId &&
      !normalized.sku &&
      !normalized.productName &&
      !normalized.gmv &&
      !normalized.paidAt

    if (missingKeyFields) {
      continue
    }

    rawRows.push(rawRow)
    normalizedRows.push(normalized)
    validRows++
  }

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  let todayGMV = 0
  const todayOrderIds = new Set<string>()

  for (const row of normalizedRows) {
    if (!row.paidAt) continue
    if (row.paidAt.slice(0, 10) !== todayStr) continue
    todayGMV += row.gmv || 0
    if (row.orderId) todayOrderIds.add(row.orderId)
  }

  return {
    meta: {
      sheetName: preferredSheetName,
      headerRowIndex,
      skippedDescriptionRowIndex,
      dataStartRowIndex,
      importedAt: new Date().toISOString(),
    },
    rawRows,
    normalizedRows,
    stats: {
      totalRows,
      validRows,
      skippedRows: totalRows - validRows,
      todayGMV,
      todayOrders: todayOrderIds.size,
    },
  }
}
