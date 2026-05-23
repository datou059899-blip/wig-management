import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type PreviewRow = {
  id: string
  sku: string
  currentName: string
  nextName: string
  status: 'update' | 'unchanged' | 'skip-empty-sku'
}

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value.trim() : String(value).trim()
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
    const dryRun = body?.dryRun !== false

    const products = await prisma.product.findMany({
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        sku: true,
        name: true,
      },
    })

    const previewRows: PreviewRow[] = products.map((product) => {
      const sku = normalizeCell(product.sku)
      const currentName = normalizeCell(product.name)

      if (!sku) {
        return {
          id: product.id,
          sku: '',
          currentName,
          nextName: currentName,
          status: 'skip-empty-sku',
        }
      }

      if (currentName === sku) {
        return {
          id: product.id,
          sku,
          currentName,
          nextName: sku,
          status: 'unchanged',
        }
      }

      return {
        id: product.id,
        sku,
        currentName,
        nextName: sku,
        status: 'update',
      }
    })

    const updateRows = previewRows.filter((row) => row.status === 'update')
    const unchangedRows = previewRows.filter((row) => row.status === 'unchanged')
    const skippedRows = previewRows.filter((row) => row.status === 'skip-empty-sku')

    if (!dryRun && updateRows.length > 0) {
      await prisma.$transaction(
        updateRows.map((row) => prisma.product.update({
          where: { id: row.id },
          data: { name: row.nextName },
        })),
      )
    }

    return NextResponse.json({
      dryRun,
      totalProductCount: products.length,
      updateCount: updateRows.length,
      unchangedCount: unchangedRows.length,
      skippedEmptySkuCount: skippedRows.length,
      previewRows: previewRows.map((row) => ({
        sku: row.sku,
        currentName: row.currentName,
        nextName: row.nextName,
        status: row.status,
      })),
      skippedRows: skippedRows.map((row) => ({
        sku: row.sku,
        currentName: row.currentName,
        nextName: row.nextName,
        reason: 'SKU 为空，已跳过',
      })),
    })
  } catch (error) {
    console.error('名称重置为 SKU 失败:', error)
    return NextResponse.json({ error: '名称重置为 SKU 失败' }, { status: 500 })
  }
}
