import { parse as parseCsv } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

export interface RawImportRow {
  rowNumber: number;
  data: Record<string, unknown>;
}

export interface ImportFormatAdapter {
  readonly format: 'CSV' | 'XLSX';
  parse(buffer: Buffer): RawImportRow[];
}

/**
 * Adapter Pattern (FR9): Unifies CSV and Excel (.xlsx/.xls) factory exports into a common row format.
 */
export class CsvImportAdapter implements ImportFormatAdapter {
  public readonly format = 'CSV' as const;

  parse(buffer: Buffer): RawImportRow[] {
    const records = parseCsv(buffer.toString('utf-8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, unknown>[];

    return records.map((data, idx) => ({
      rowNumber: idx + 2, // Row 1 is CSV header
      data,
    }));
  }
}

export class ExcelImportAdapter implements ImportFormatAdapter {
  public readonly format = 'XLSX' as const;

  parse(buffer: Buffer): RawImportRow[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    const sheet = workbook.Sheets[firstSheetName];
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    return records.map((data, idx) => ({
      rowNumber: idx + 2,
      data,
    }));
  }
}

export function getImportAdapter(fileName: string): ImportFormatAdapter {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return new ExcelImportAdapter();
  }
  return new CsvImportAdapter();
}
