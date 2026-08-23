import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { addSheet } from '@/lib/reports/xlsx';
import { pieChartConfig, barChartConfig } from '@/lib/reports/charts';

describe('addSheet', () => {
  it('writes a right-to-left sheet with a bold header row', () => {
    const wb = new ExcelJS.Workbook();
    const ws = addSheet(wb, 'סקירה', ['סוג', 'כמות'], [['תלונה', 5], ['משלוח', 3]]);

    expect(ws.views[0].rightToLeft).toBe(true);
    expect(ws.getRow(1).getCell(1).value).toBe('סוג');
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.getRow(2).getCell(2).value).toBe(5);
    expect(ws.rowCount).toBe(3);
  });

  it('creates a sheet even with no data rows', () => {
    const wb = new ExcelJS.Workbook();
    const ws = addSheet(wb, 'ריק', ['א'], []);
    expect(ws.rowCount).toBe(1);
  });

  it('truncates a sheet name to the 31-char Excel limit', () => {
    const wb = new ExcelJS.Workbook();
    const ws = addSheet(wb, 'א'.repeat(40), ['א'], []);
    expect(ws.name.length).toBeLessThanOrEqual(31);
  });
});

describe('chart configs', () => {
  it('builds an RTL doughnut config', () => {
    const c = pieChartConfig('פילוח', ['א', 'ב'], [1, 2]);
    expect(c.type).toBe('doughnut');
    expect(c.data.labels).toEqual(['א', 'ב']);
    expect(c.options.legend.rtl).toBe(true);
  });

  it('builds a horizontal bar config that starts at zero', () => {
    const c = barChartConfig('נושאים', ['א'], [3]);
    expect(c.type).toBe('horizontalBar');
    expect(c.options.scales.xAxes[0].ticks.beginAtZero).toBe(true);
  });
});
