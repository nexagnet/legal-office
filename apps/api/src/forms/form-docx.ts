// Dựng tệp DOCX bản NHÁP từ mẫu + dữ liệu. Hàm thuần: không đọc đĩa, không mạng, không DB.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableBorders,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { buildContext, type FormContext } from './form-fields';
import {
  PLACEHOLDER_RE,
  type Align,
  type Block,
  type CellSpec,
  type FormCode,
  type FormTemplate,
} from './form-template';
import type { FormInputMap } from './form-input';
import { TEMPLATES } from './templates';

/** Dòng cảnh báo bắt buộc trên MỌI bản nháp. */
export const DRAFT_BANNER = 'BẢN NHÁP – chưa được khách hàng/pháp lý chấp nhận';
/** Phiên bản bộ mẫu: Phụ lục III, Thông tư 08/2026/TT-BTP. */
export const FORM_TEMPLATE_VERSION = 'TT08/2026-PL3';

const FONT = 'Times New Roman';
const SIZE = 26; // 13pt (nửa điểm)
const ALIGN: Record<Align, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

interface Seg {
  text: string;
  bold: boolean;
  italics: boolean;
}

/** Tách `**đậm**`, `%%nghiêng%%` rồi điền `{{khóa=chấm}}` trong từng đoạn. */
export function resolveSegments(text: string, ctx: FormContext): Seg[] {
  const segs: Seg[] = [];
  let bold = false;
  let italics = false;
  for (const part of text.split(/(\*\*|%%)/)) {
    if (part === '**') bold = !bold;
    else if (part === '%%') italics = !italics;
    else if (part !== '') {
      segs.push({ text: fillPlaceholders(part, ctx), bold, italics });
    }
  }
  return segs;
}

export function fillPlaceholders(text: string, ctx: FormContext): string {
  return text.replace(PLACEHOLDER_RE, (_m, key: string, dots: string) => {
    const v = ctx.fields.get(key);
    return v !== undefined && v !== '' ? v : dots;
  });
}

const run = (s: Seg, extra: { bold?: boolean; size?: number } = {}): TextRun =>
  new TextRun({
    text: s.text,
    bold: s.bold || extra.bold === true,
    italics: s.italics,
    font: FONT,
    size: extra.size ?? SIZE,
  });

const para = (text: string, align: Align, ctx: FormContext): Paragraph =>
  new Paragraph({
    alignment: ALIGN[align],
    spacing: { after: 80, line: 300 },
    children: resolveSegments(text, ctx).map((s) => run(s)),
  });

const emptyPara = (): Paragraph => new Paragraph({ children: [] });

function cellParas(spec: CellSpec, ctx: FormContext): Paragraph[] {
  const ps = spec.lines.map((line) => para(line, spec.align, ctx));
  return ps.length > 0 ? ps : [emptyPara()];
}

function layoutTable(cells: readonly CellSpec[], ctx: FormContext): Table {
  const width = Math.floor(100 / cells.length);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TableBorders.NONE,
    rows: [
      new TableRow({
        children: cells.map(
          (cs) =>
            new TableCell({
              width: { size: width, type: WidthType.PERCENTAGE },
              children: cellParas(cs, ctx),
            }),
        ),
      }),
    ],
  });
}

const GRID = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const;

function gridCell(
  text: string,
  opts: { span?: number; rowSpan?: number; bold?: boolean; align?: Align; width?: number } = {},
): TableCell {
  return new TableCell({
    columnSpan: opts.span,
    rowSpan: opts.rowSpan,
    verticalAlign: VerticalAlign.CENTER,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    children: [
      new Paragraph({
        alignment: ALIGN[opts.align ?? 'left'],
        children:
          text === ''
            ? []
            : [run({ text, bold: opts.bold === true, italics: false }, { size: 24 })],
      }),
    ],
  });
}

const gridTable = (rows: TableRow[]): Table =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: GRID,
      bottom: GRID,
      left: GRID,
      right: GRID,
      insideHorizontal: GRID,
      insideVertical: GRID,
    },
    rows,
  });

const withLabel = (label: string, value: string | undefined): string =>
  value === undefined || value === '' ? label : `${label} ${value}`;

/** Phụ lục "Bảng kê giấy tờ, hồ sơ, tài liệu tống đạt" của N-01. Ô "Ký nhận" luôn để trống. */
function itemsTable(ctx: FormContext): Table {
  const head = (
    t: string,
    o: { span?: number; rowSpan?: number; width?: number } = {},
  ): TableCell => gridCell(t, { ...o, bold: true, align: 'center' });
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        head('TT', { rowSpan: 2, width: 6 }),
        head('Giấy tờ, hồ sơ, tài liệu cần tống đạt', { rowSpan: 2, width: 26 }),
        head('Thời hạn tống đạt', { rowSpan: 2, width: 14 }),
        head('Ký nhận', { span: 2 }),
        head('Chi phí tống đạt đối với từng giấy tờ, hồ sơ, tài liệu', { rowSpan: 2, width: 18 }),
        head('Ghi chú', { rowSpan: 2, width: 12 }),
      ],
    }),
    new TableRow({
      tableHeader: true,
      children: [head('Bên giao văn bản', { width: 12 }), head('Bên nhận văn bản', { width: 12 })],
    }),
    new TableRow({
      children: ['', '1', '2', '3', '4', '5', '6'].map((t) => gridCell(t, { align: 'center' })),
    }),
  ];
  const data = [...ctx.items];
  const blanks = Math.max(2 - data.length, 0);
  data.forEach((it, i) =>
    rows.push(
      new TableRow({
        children: [
          gridCell(String(i + 1), { align: 'center' }),
          gridCell(it.title),
          gridCell(it.deadline ?? ''),
          gridCell(''),
          gridCell(''),
          gridCell(it.cost === undefined ? '' : String(it.cost), { align: 'right' }),
          gridCell(it.note ?? ''),
        ],
      }),
    ),
  );
  for (let i = 0; i < blanks; i++) {
    rows.push(
      new TableRow({
        children: [String(data.length + i + 1), '', '', '', '', '', ''].map((t, ci) =>
          gridCell(t, { align: ci === 0 ? 'center' : 'left' }),
        ),
      }),
    );
  }
  const total = ctx.fields.get('totalCost');
  const words = ctx.fields.get('totalCostWords');
  rows.push(
    new TableRow({
      children: [
        gridCell(''),
        gridCell('Tổng cộng:'),
        gridCell(''),
        gridCell(''),
        gridCell(''),
        gridCell(withLabel('Tổng cộng:', total)),
        gridCell(''),
      ],
    }),
    new TableRow({
      children: [
        gridCell(''),
        gridCell('Bằng chữ:'),
        gridCell(''),
        gridCell(''),
        gridCell(''),
        gridCell(withLabel('Bằng chữ:', words)),
        gridCell(''),
      ],
    }),
  );
  return gridTable(rows);
}

/** Bảng "Nội dung sửa lỗi kỹ thuật" của N-11. */
function correctionsTable(ctx: FormContext): Table {
  const head = (t: string): TableCell => gridCell(t, { bold: true, align: 'center' });
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        head('STT'),
        head('Vị trí có lỗi cần sửa (trang, dòng, mục...)'),
        head('Nội dung trước khi sửa'),
        head('Nội dung sau khi sửa'),
      ],
    }),
  ];
  ctx.corrections.forEach((r, i) =>
    rows.push(
      new TableRow({
        children: [
          gridCell(String(i + 1), { align: 'center' }),
          gridCell(r.location),
          gridCell(r.before),
          gridCell(r.after),
        ],
      }),
    ),
  );
  const minRows = 2;
  for (let i = ctx.corrections.length; i < minRows; i++) {
    rows.push(
      new TableRow({
        children: [String(i + 1), '', '', ''].map((t, ci) =>
          gridCell(t, { align: ci === 0 ? 'center' : 'left' }),
        ),
      }),
    );
  }
  rows.push(
    new TableRow({ children: ['....', '', '', ''].map((t) => gridCell(t, { align: 'center' })) }),
  );
  return gridTable(rows);
}

function blockToElements(block: Block, ctx: FormContext): (Paragraph | Table)[] {
  switch (block.kind) {
    case 'p':
      return [para(block.text, block.align, ctx)];
    case 'blank':
      return [emptyPara()];
    case 'cols':
      return [layoutTable(block.cells, ctx)];
    case 'lines': {
      const data = ctx.lists.get(block.key);
      const texts = data && data.length > 0 ? data : block.blanks;
      return texts.map((t) => para(t, 'justify', ctx));
    }
    case 'numbered': {
      const data = ctx.lists.get(block.key) ?? [];
      const count = Math.max(data.length, block.blanks.length);
      const out: Paragraph[] = [];
      for (let i = 0; i < count; i++) {
        const d = data[i];
        out.push(
          para(d !== undefined ? `${i + 1}) ${d}` : (block.blanks[i] as string), 'justify', ctx),
        );
      }
      return out;
    }
    case 'itemsTable':
      return [itemsTable(ctx), emptyPara()];
    case 'correctionsTable':
      return [correctionsTable(ctx), emptyPara()];
  }
}

function draftHeaderBlock(template: FormTemplate): Paragraph[] {
  const frame = { style: BorderStyle.SINGLE, size: 8, color: 'B45309', space: 4 } as const;
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      shading: { type: ShadingType.CLEAR, fill: 'FEF3C7', color: 'auto' },
      border: { top: frame, bottom: frame, left: frame, right: frame },
      children: [new TextRun({ text: DRAFT_BANNER, bold: true, font: FONT, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [
        new TextRun({
          text:
            `Mẫu tham chiếu: ${template.ref} (Phụ lục III, Thông tư số 08/2026/TT-BTP) · ` +
            `Phiên bản mẫu: ${FORM_TEMPLATE_VERSION} · Không phải biểu mẫu chính thức; ` +
            'chưa ký, chưa đóng dấu.',
          italics: true,
          font: FONT,
          size: 20,
        }),
      ],
    }),
  ];
}

/** Dựng các phần tử thân tài liệu (đoạn + bảng) cho một mẫu, đã gồm dòng cảnh báo bản nháp. */
export function buildBody<C extends FormCode>(
  code: C,
  input: FormInputMap[C],
): (Paragraph | Table)[] {
  const template = TEMPLATES[code];
  const ctx = buildContext(code, input);
  return [
    ...draftHeaderBlock(template),
    ...template.blocks.flatMap((b) => blockToElements(b, ctx)),
  ];
}

/** Tạo bản nháp DOCX của một biểu mẫu từ dữ liệu vụ việc. */
export async function renderFormDocx<C extends FormCode>(
  code: C,
  input: FormInputMap[C],
): Promise<Buffer> {
  const template = TEMPLATES[code];
  const doc = new Document({
    creator: 'legal-office',
    title: `[BẢN NHÁP] ${template.title} (${template.ref})`,
    description: `${DRAFT_BANNER}. Phiên bản mẫu ${FORM_TEMPLATE_VERSION}.`,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, bottom: 1134, left: 1701, right: 1134, header: 567, footer: 567 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: DRAFT_BANNER, bold: true, font: FONT, size: 20 })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `${template.ref} · ${FORM_TEMPLATE_VERSION} · bản nháp`,
                    font: FONT,
                    size: 18,
                  }),
                ],
              }),
            ],
          }),
        },
        children: buildBody(code, input),
      },
    ],
  });
  return Packer.toBuffer(doc);
}
