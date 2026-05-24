import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { parseImportFile } from '@/lib/import-file-parser'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type ImportFailure = {
  row: number
  name: string
  reason: string
}

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value.trim() : String(value).trim()
}

function normalizeHeader(value: unknown) {
  return normalizeCell(value).replace(/\s+/g, '')
}

function parseLooseQty(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return {
      value: Number(value.toFixed(4)),
      invalid: false,
      usedLooseParsing: false,
      rawText: '',
    }
  }

  const text = normalizeCell(value)
  if (!text) {
    return {
      value: 0,
      invalid: false,
      usedLooseParsing: false,
      rawText: '',
    }
  }

  const numericText = text.replace(/,/g, '')
  const directParsed = Number(numericText)
  if (Number.isFinite(directParsed)) {
    return {
      value: Number(directParsed.toFixed(4)),
      invalid: false,
      usedLooseParsing: false,
      rawText: text,
    }
  }

  const matches = text.match(/-?\d+(?:\.\d+)?/g)
  if (matches && matches.length > 0) {
    const parsed = Number(matches[matches.length - 1])
    if (Number.isFinite(parsed)) {
      return {
        value: Number(parsed.toFixed(4)),
        invalid: false,
        usedLooseParsing: true,
        rawText: text,
      }
    }
  }

  return {
    value: 0,
    invalid: true,
    usedLooseParsing: false,
    rawText: text,
  }
}

function buildImportedNote(usageText: string, noteText: string, rawQtyText: string, usedLooseParsing: boolean) {
  const segments = [
    usageText ? `使用情况：${usageText}` : '',
    noteText ? `备注：${noteText}` : '',
    usedLooseParsing && rawQtyText ? `原始剩余数量：${rawQtyText}` : '',
  ].filter(Boolean)

  return segments.join('；')
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

export async function POST(request: NextRequest) {
  try {
    const { error } = await requireOperator()
    if (error) return error

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: '请上传物料表文件' }, { status: 400 })
    }

    let parsedFile: Awaited<ReturnType<typeof parseImportFile>>
    try {
      parsedFile = await parseImportFile(file)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : '解析物料表文件失败' },
        { status: 400 },
      )
    }
    const rawRows = parsedFile.rawRows
    if (!rawRows.length) {
      return NextResponse.json({ error: '物料表中没有可导入的数据' }, { status: 400 })
    }

    const headerRowIndex = rawRows.findIndex((row) => {
      const cells = Array.isArray(row) ? row.map((cell) => normalizeHeader(cell)) : []
      return cells.includes('品名') && cells.includes('剩余数量')
    })

    if (headerRowIndex === -1) {
      return NextResponse.json({ error: '未找到“品名 / 剩余数量”表头行' }, { status: 400 })
    }

    const headerRow = Array.isArray(rawRows[headerRowIndex]) ? rawRows[headerRowIndex] : []
    const headers = headerRow.map((cell) => normalizeHeader(cell))
    const nameIndex = headers.indexOf('品名')
    const unitIndex = headers.indexOf('单位')
    const qtyIndex = headers.indexOf('剩余数量')
    const usageIndex = headers.indexOf('使用情况')
    const noteIndex = headers.indexOf('备注')

    if (nameIndex === -1 || qtyIndex === -1) {
      return NextResponse.json({ error: '缺少必要表头“品名”或“剩余数量”' }, { status: 400 })
    }

    const dataRows = rawRows.slice(headerRowIndex + 1)
    const failures: ImportFailure[] = []
    let skippedCount = 0
    const candidates: Array<{
      row: number
      name: string
      unit: string
      remainingQty: number
      importedNote: string
    }> = []

    dataRows.forEach((row, index) => {
      const excelRowNumber = headerRowIndex + index + 2
      const cells = Array.isArray(row) ? row : []
      const name = normalizeCell(cells[nameIndex])
      if (!name) {
        skippedCount += 1
        return
      }

      const qtyResult = parseLooseQty(cells[qtyIndex])
      if (qtyResult.invalid || qtyResult.value < 0) {
        failures.push({
          row: excelRowNumber,
          name,
          reason: '剩余数量无法识别或小于 0',
        })
        return
      }

      const unit = unitIndex >= 0 ? normalizeCell(cells[unitIndex]) : ''
      const usageText = usageIndex >= 0 ? normalizeCell(cells[usageIndex]) : ''
      const noteText = noteIndex >= 0 ? normalizeCell(cells[noteIndex]) : ''
      const importedNote = buildImportedNote(
        usageText,
        noteText,
        qtyResult.rawText,
        qtyResult.usedLooseParsing,
      )

      candidates.push({
        row: excelRowNumber,
        name,
        unit,
        remainingQty: qtyResult.value,
        importedNote,
      })
    })

    if (!candidates.length) {
      return NextResponse.json({
        error: '没有可导入的耗材数据',
        totalRows: dataRows.length,
        createdCount: 0,
        updatedCount: 0,
        skippedCount,
        failureCount: failures.length,
        failures,
      }, { status: 400 })
    }

    const existingMaterials = await prisma.materialItem.findMany({
      where: {
        name: {
          in: candidates.map((item) => item.name),
        },
      },
    })
    const existingByName = new Map(existingMaterials.map((item) => [item.name, item]))

    let createdCount = 0
    let updatedCount = 0

    for (const candidate of candidates) {
      try {
        const existing = existingByName.get(candidate.name)
        if (existing) {
          await prisma.$transaction(async (tx) => {
            const updated = await tx.materialItem.update({
              where: { id: existing.id },
              data: {
                unit: candidate.unit || existing.unit || null,
                currentQty: candidate.remainingQty,
                note: candidate.importedNote || existing.note || null,
                isActive: true,
              },
            })

            await tx.materialTransaction.create({
              data: {
                materialId: updated.id,
                materialName: updated.name,
                type: 'adjust',
                quantity: Number((candidate.remainingQty - existing.currentQty).toFixed(4)),
                beforeQty: existing.currentQty,
                afterQty: candidate.remainingQty,
                transactionDate: new Date(),
                reason: 'Excel 导入校准',
                note: candidate.importedNote || null,
              },
            })
          })
          updatedCount += 1
          existingByName.set(candidate.name, {
            ...existing,
            unit: candidate.unit || existing.unit,
            currentQty: candidate.remainingQty,
            note: candidate.importedNote || existing.note,
            isActive: true,
          })
        } else {
          const created = await prisma.$transaction(async (tx) => {
            const material = await tx.materialItem.create({
              data: {
                name: candidate.name,
                unit: candidate.unit || null,
                initialQty: candidate.remainingQty,
                currentQty: candidate.remainingQty,
                note: candidate.importedNote || null,
              },
            })

            await tx.materialTransaction.create({
              data: {
                materialId: material.id,
                materialName: material.name,
                type: 'init',
                quantity: candidate.remainingQty,
                beforeQty: 0,
                afterQty: candidate.remainingQty,
                transactionDate: new Date(),
                reason: 'Excel 导入初始化',
                note: candidate.importedNote || null,
              },
            })

            return material
          })

          existingByName.set(candidate.name, created)
          createdCount += 1
        }
      } catch (rowError) {
        failures.push({
          row: candidate.row,
          name: candidate.name,
          reason: rowError instanceof Error ? rowError.message : '导入失败',
        })
      }
    }

    return NextResponse.json({
      totalRows: dataRows.length,
      createdCount,
      updatedCount,
      skippedCount,
      failureCount: failures.length,
      failures,
    })
  } catch (error) {
    console.error('导入物料表失败:', error)
    return NextResponse.json({ error: '导入物料表失败' }, { status: 500 })
  }
}
