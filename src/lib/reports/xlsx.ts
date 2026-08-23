/**
 * Shared workbook helpers. Extracted from daily-support-report so the weekly
 * conversation report renders identically without copying 900 lines.
 */

import ExcelJS from 'exceljs';

/** Excel rejects sheet names over 31 characters. */
const MAX_SHEET_NAME = 31;

export function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: Array<Array<string | number | null>>
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name.slice(0, MAX_SHEET_NAME), {
    views: [{ rightToLeft: true }],
  });

  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);

  ws.columns.forEach((col, i) => {
    const widest = Math.max(
      String(headers[i] ?? '').length,
      ...rows.map((r) => String(r[i] ?? '').length)
    );
    col.width = Math.min(50, Math.max(12, widest + 2));
  });

  return ws;
}
