import ExcelJS from 'exceljs';

export interface SheetSpec {
  readonly name: string;
  readonly title: string;
  readonly notice: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly (string | number | null)[])[];
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Một trang tính: tiêu đề, dòng lưu ý, hàng tiêu đề cột rồi các dòng dữ liệu. Ô rỗng để trống (không suy đoán). */
export async function buildXlsx(spec: SheetSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Legal Office';
  const ws = wb.addWorksheet(spec.name.slice(0, 31));
  const width = Math.max(spec.columns.length, 1);
  ws.addRow([spec.title]).font = { bold: true, size: 14 };
  ws.addRow([spec.notice]).font = { italic: true };
  ws.mergeCells(1, 1, 1, width);
  ws.mergeCells(2, 1, 2, width);
  const head = ws.addRow([...spec.columns]);
  head.font = { bold: true };
  head.alignment = { wrapText: true, vertical: 'middle' };
  spec.rows.forEach((r) => ws.addRow([...r]));
  ws.columns.forEach((c, i) => {
    c.width = i === 0 ? 8 : 32;
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
