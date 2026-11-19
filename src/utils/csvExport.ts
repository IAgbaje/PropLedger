import { downloadTextFile } from './format';

export type CsvCellValue = string | number | boolean | null | undefined;

export function escapeCsvCell(value: CsvCellValue): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvContent(headers: string[], rows: CsvCellValue[][]): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const bodyLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return [headerLine, ...bodyLines].join('\r\n');
}

export function exportFilteredCsv(
  filename: string,
  headers: string[],
  rows: CsvCellValue[][]
): void {
  const csv = buildCsvContent(headers, rows);
  downloadTextFile(filename, `\uFEFF${csv}`, 'text/csv;charset=utf-8;');
}
