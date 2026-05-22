import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value.trim() : String(value).trim()
}

function parseDateInput(value: string) {
  const matched = value.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/)
  if (!matched) return null

  const [, yearText, monthText, dayText] = matched
  const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText), 0, 0, 0, 0)
  return Number.isNaN(date.getTime()) ? null : date
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function buildRecipientKey(item: {
  buyerUsername?: string | null
  buyerNickname?: string | null
  recipient?: string | null
}) {
  const buyerUsername = normalizeCell(item.buyerUsername).toLowerCase()
  const buyerNickname = normalizeCell(item.buyerNickname).toLowerCase()
  const recipient = normalizeCell(item.recipient).toLowerCase()

  if (!buyerUsername && !buyerNickname && !recipient) {
    return 'unknown'
  }

  return `${buyerUsername}__${buyerNickname}__${recipient}`
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const startDateText = normalizeCell(searchParams.get('startDate'))
    const endDateText = normalizeCell(searchParams.get('endDate'))
    const requestedSku = normalizeCell(searchParams.get('sku'))
    const requestedBuyerUsername = normalizeCell(searchParams.get('buyerUsername'))

    const startDate = parseDateInput(startDateText)
    const endDate = parseDateInput(endDateText)

    if (!startDate || !endDate) {
      return NextResponse.json({ error: '请提供有效的开始日期和结束日期' }, { status: 400 })
    }
    if (startDate.getTime() > endDate.getTime()) {
      return NextResponse.json({ error: '开始日期不能大于结束日期' }, { status: 400 })
    }

    const rows = await prisma.productOrderItem.findMany({
      where: {
        isSample: true,
        paidDate: {
          gte: startDate,
          lt: addDays(endDate, 1),
        },
        ...(requestedSku ? { sellerSku: requestedSku } : {}),
        ...(requestedBuyerUsername
          ? {
              buyerUsername: {
                equals: requestedBuyerUsername,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      select: {
        sellerSku: true,
        sampleQty: true,
        buyerUsername: true,
        buyerNickname: true,
        recipient: true,
      },
      orderBy: [
        { paidDate: 'asc' },
        { createdAt: 'asc' },
      ],
    })

    const sampleBySkuMap = new Map<string, {
      sku: string
      sampleQty: number
      sampleRows: number
    }>()
    const sampleByRecipientMap = new Map<string, {
      buyerUsername: string
      buyerNickname: string
      recipient: string
      sampleQty: number
      sampleRows: number
      skus: Set<string>
    }>()
    const sampleByRecipientAndSkuMap = new Map<string, {
      buyerUsername: string
      buyerNickname: string
      recipient: string
      sku: string
      sampleQty: number
      sampleRows: number
    }>()

    rows.forEach((item) => {
      const sampleBySku = sampleBySkuMap.get(item.sellerSku) || {
        sku: item.sellerSku,
        sampleQty: 0,
        sampleRows: 0,
      }
      sampleBySku.sampleQty += item.sampleQty || 0
      sampleBySku.sampleRows += 1
      sampleBySkuMap.set(item.sellerSku, sampleBySku)

      const recipientKey = buildRecipientKey(item)
      const sampleByRecipient = sampleByRecipientMap.get(recipientKey) || {
        buyerUsername: normalizeCell(item.buyerUsername),
        buyerNickname: normalizeCell(item.buyerNickname),
        recipient: normalizeCell(item.recipient),
        sampleQty: 0,
        sampleRows: 0,
        skus: new Set<string>(),
      }
      sampleByRecipient.sampleQty += item.sampleQty || 0
      sampleByRecipient.sampleRows += 1
      sampleByRecipient.skus.add(item.sellerSku)
      sampleByRecipientMap.set(recipientKey, sampleByRecipient)

      const recipientSkuKey = `${recipientKey}__${item.sellerSku}`
      const sampleByRecipientAndSku = sampleByRecipientAndSkuMap.get(recipientSkuKey) || {
        buyerUsername: normalizeCell(item.buyerUsername),
        buyerNickname: normalizeCell(item.buyerNickname),
        recipient: normalizeCell(item.recipient),
        sku: item.sellerSku,
        sampleQty: 0,
        sampleRows: 0,
      }
      sampleByRecipientAndSku.sampleQty += item.sampleQty || 0
      sampleByRecipientAndSku.sampleRows += 1
      sampleByRecipientAndSkuMap.set(recipientSkuKey, sampleByRecipientAndSku)
    })

    const sampleBySku = Array.from(sampleBySkuMap.values()).sort((a, b) => (
      b.sampleQty - a.sampleQty || b.sampleRows - a.sampleRows || a.sku.localeCompare(b.sku)
    ))
    const sampleByRecipient = Array.from(sampleByRecipientMap.values())
      .map((item) => ({
        buyerUsername: item.buyerUsername || 'unknown',
        buyerNickname: item.buyerNickname || '',
        recipient: item.recipient || '',
        sampleQty: item.sampleQty,
        sampleRows: item.sampleRows,
        skus: Array.from(item.skus).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => (
        b.sampleQty - a.sampleQty
        || b.sampleRows - a.sampleRows
        || a.buyerUsername.localeCompare(b.buyerUsername)
        || a.recipient.localeCompare(b.recipient)
      ))
    const sampleByRecipientAndSku = Array.from(sampleByRecipientAndSkuMap.values())
      .map((item) => ({
        buyerUsername: item.buyerUsername || 'unknown',
        buyerNickname: item.buyerNickname || '',
        recipient: item.recipient || '',
        sku: item.sku,
        sampleQty: item.sampleQty,
        sampleRows: item.sampleRows,
      }))
      .sort((a, b) => (
        b.sampleQty - a.sampleQty
        || b.sampleRows - a.sampleRows
        || a.buyerUsername.localeCompare(b.buyerUsername)
        || a.sku.localeCompare(b.sku)
      ))

    return NextResponse.json({
      startDate: startDateText,
      endDate: endDateText,
      sku: requestedSku,
      buyerUsername: requestedBuyerUsername,
      totalSampleQty: rows.reduce((sum, item) => sum + (item.sampleQty || 0), 0),
      sampleRows: rows.length,
      sampleBySku,
      sampleByRecipient,
      sampleByRecipientAndSku,
    })
  } catch (error) {
    console.error('获取样品统计失败:', error)
    return NextResponse.json(
      {
        error: '获取样品统计失败',
        detail: String((error as Error)?.message || error),
      },
      { status: 500 },
    )
  }
}
