import * as XLSX from 'xlsx'

export type ImportFileType = 'csv' | 'xlsx' | 'xls'

export type ImportCellValue = string | number | null

export type ImportRowRecord = Record<string, ImportCellValue>

export type ParsedImportRowRecord = {
  rowNumber: number
  record: ImportRowRecord
}

export type ParsedImportFileResult = {
  rows: ImportRowRecord[]
  rowRecords: ParsedImportRowRecord[]
  headers: string[]
  fileType: ImportFileType
  sheetName?: string
  sheetNames?: string[]
  rowCount: number
  rawRows: ImportCellValue[][]
}

type ParseImportFileOptions = {
  preferredSheetNames?: string[]
  headerRowIndex?: number
  dataStartRowIndex?: number
}

export function normalizeImportCell(value: unknown) {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value.trim() : String(value).trim()
}

export function normalizeImportHeader(value: unknown) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim()
}

function detectFileType(file: File): ImportFileType | null {
  const lowerFileName = String(file.name || '').trim().toLowerCase()
  if (lowerFileName.endsWith('.csv')) return 'csv'
  if (lowerFileName.endsWith('.xlsx')) return 'xlsx'
  if (lowerFileName.endsWith('.xls')) return 'xls'

  const mimeType = String(file.type || '').toLowerCase()
  if (mimeType.includes('csv')) return 'csv'
  if (mimeType.includes('spreadsheetml')) return 'xlsx'
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'xls'

  return null
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

  return rows.map((row) => row.map((cell) => cell.replace(/^\uFEFF/, '')))
}

function getSpreadsheetCellValue(cell: XLSX.CellObject | undefined): ImportCellValue {
  if (!cell) return ''

  if (typeof cell.w === 'string' && cell.w.trim() !== '') {
    return cell.w
  }

  if (cell.v === null || cell.v === undefined) return ''
  if (cell.v instanceof Date) {
    return cell.v.toISOString()
  }
  if (typeof cell.v === 'boolean') {
    return cell.v ? 'TRUE' : 'FALSE'
  }

  return cell.v as string | number
}

function sheetToRawRows(sheet: XLSX.WorkSheet) {
  const ref = sheet['!ref']
  if (!ref) return []

  const range = XLSX.utils.decode_range(ref)
  const rows: ImportCellValue[][] = []

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row: ImportCellValue[] = []
    for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })
      row.push(getSpreadsheetCellValue(sheet[address]))
    }
    rows.push(row)
  }

  return rows
}

export function buildImportRowRecords(
  rawRows: ImportCellValue[][],
  options?: {
    headerRowIndex?: number
    dataStartRowIndex?: number
  },
) {
  const headerRowIndex = options?.headerRowIndex ?? 0
  const dataStartRowIndex = options?.dataStartRowIndex ?? (headerRowIndex + 1)
  const headerRow = Array.isArray(rawRows[headerRowIndex]) ? rawRows[headerRowIndex] : []
  const headers = headerRow.map((cell) => normalizeImportHeader(cell))

  const rowRecords = rawRows.slice(dataStartRowIndex).map((row, index) => {
    const record = headers.reduce<ImportRowRecord>((acc, header, headerIndex) => {
      if (header) {
        acc[header] = Array.isArray(row) ? (row[headerIndex] ?? '') : ''
      }
      return acc
    }, {})

    return {
      rowNumber: dataStartRowIndex + index + 1,
      record,
    }
  }).filter(({ record }) =>
    Object.values(record).some((value) => normalizeImportCell(value) !== ''),
  )

  return {
    headers,
    rowRecords,
    rows: rowRecords.map((item) => item.record),
  }
}

export async function parseImportFile(
  file: File,
  options?: ParseImportFileOptions,
): Promise<ParsedImportFileResult> {
  const fileType = detectFileType(file)
  if (!fileType) {
    throw new Error('仅支持 CSV、XLSX、XLS 文件')
  }

  const bytes = await file.arrayBuffer()
  let rawRows: ImportCellValue[][] = []
  let sheetName: string | undefined
  let sheetNames: string[] | undefined

  if (fileType === 'csv') {
    const text = new TextDecoder('utf-8').decode(bytes)
    rawRows = parseCsvText(text)
  } else {
    const workbook = XLSX.read(bytes, {
      type: 'array',
      cellDates: true,
      raw: false,
    })

    sheetNames = workbook.SheetNames
    const preferredSheetName = options?.preferredSheetNames?.find((name) =>
      workbook.SheetNames.some((sheet) => sheet.toLowerCase() === name.toLowerCase()),
    )
    sheetName = preferredSheetName
      ? workbook.SheetNames.find((sheet) => sheet.toLowerCase() === preferredSheetName.toLowerCase())
      : workbook.SheetNames[0]

    if (!sheetName) {
      throw new Error('文件没有可读取的工作表')
    }

    rawRows = sheetToRawRows(workbook.Sheets[sheetName])
  }

  const built = buildImportRowRecords(rawRows, {
    headerRowIndex: options?.headerRowIndex,
    dataStartRowIndex: options?.dataStartRowIndex,
  })

  return {
    rows: built.rows,
    rowRecords: built.rowRecords,
    headers: built.headers,
    fileType,
    sheetName,
    sheetNames,
    rowCount: built.rowRecords.length,
    rawRows,
  }
}
