import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { DRAFT_BANNER, FORM_TEMPLATE_VERSION, renderFormDocx } from './form-docx';
import { buildContext, FormInputError } from './form-fields';
import { FORM_CODES, templateKeys, type FormCode } from './form-template';
import type { FormInputMap } from './form-input';
import { FULL_INPUTS, N02, N03, N11 } from './forms.fixtures';
import { TEMPLATES } from './templates';

const unescapeXml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** Văn bản từng đoạn trong một phần XML của DOCX (thân, đầu trang...), theo thứ tự xuất hiện. */
function paragraphsOf(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g)) {
    let text = '';
    for (const t of m[0].matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:br\/>|<w:tab\/>/g)) {
      text += t[1] !== undefined ? unescapeXml(t[1]) : t[0] === '<w:br/>' ? '\n' : '\t';
    }
    out.push(text);
  }
  return out;
}

async function unzipDocx(buf: Buffer): Promise<{ body: string[]; header: string[]; zip: JSZip }> {
  const zip = await JSZip.loadAsync(buf);
  const read = async (name: string): Promise<string> => {
    const f = zip.file(name);
    if (!f) throw new Error(`thiếu ${name} trong DOCX`);
    return f.async('string');
  };
  return {
    zip,
    body: paragraphsOf(await read('word/document.xml')),
    header: paragraphsOf(await read('word/header1.xml')),
  };
}

const render = <C extends FormCode>(code: C, input: FormInputMap[C]) =>
  renderFormDocx(code, input).then(unzipDocx);

const goldenDir = join(__dirname, 'golden');
function expectGolden(name: string, lines: string[]): void {
  const file = join(goldenDir, name);
  const actual = lines.join('\n') + '\n';
  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(goldenDir, { recursive: true });
    writeFileSync(file, actual, 'utf8');
  }
  expect(existsSync(file), `thiếu golden ${name}; chạy với UPDATE_GOLDEN=1`).toBe(true);
  expect(actual).toBe(readFileSync(file, 'utf8'));
}

describe('golden: N-03 và N-02 với dữ liệu tổng hợp cố định', () => {
  it('N-03 khớp tệp golden', async () => {
    const { body } = await render('N-03', N03);
    expectGolden('n-03.txt', body);
  });

  it('N-02 khớp tệp golden', async () => {
    const { body } = await render('N-02', N02);
    expectGolden('n-02.txt', body);
  });

  it('N-03 giữ nguyên các câu cố định của mẫu chính thức', async () => {
    const { body } = await render('N-03', N03);
    for (const s of [
      'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
      'Căn cứ Nghị định số 151/2026/NĐ-CP ngày 13/5/2026 của Chính phủ quy định về tổ chức và hoạt động của văn phòng thi hành án dân sự, Thừa hành viên;',
      'Căn cứ nhu cầu, khả năng của các bên,',
      'Hai bên thỏa thuận ký kết Hợp đồng này để thực hiện việc lập vi bằng với các điều khoản như sau:',
      '2. Vi bằng phải được Bên A lập theo đúng quy định của pháp luật và Hợp đồng này.',
      'a) Bên A có quyền đơn phương chấm dứt Hợp đồng này do Bên B vi phạm nghĩa vụ thanh toán nêu tại Điều 3 hoặc vi phạm nghiêm trọng các nghĩa vụ khác theo Hợp đồng này;',
      'b) Bên B có quyền đơn phương chấm dứt Hợp đồng này trong các trường hợp Bên A vi phạm nghĩa vụ nêu tại Điều 1 hoặc vi phạm nghiêm trọng các nghĩa vụ khác theo Hợp đồng này;',
      '2. Hợp đồng này được lập thành 02 bản, có giá trị như nhau, mỗi bên giữ 01 bản.',
      '3. Hợp đồng này đã được các bên đọc, hiểu rõ và nhất trí ký tên dưới đây.',
      'Điều 7. Điều khoản chung',
      '(Dưới đây gọi là Bên A)',
    ]) {
      expect(body, s).toContain(s);
    }
    expect(body.some((p) => p.startsWith('Căn cứ Thông tư số 08/2026/TT-BTP ngày 16/5/2026'))).toBe(
      true,
    );
  });

  it('N-02 giữ nguyên các câu cố định của mẫu chính thức', async () => {
    const { body } = await render('N-02', N02);
    for (const s of [
      'BIÊN BẢN THỰC HIỆN VIỆC TỐNG ĐẠT',
      'Chúng tôi gồm:',
      'Lập biên bản tống đạt giấy tờ, hồ sơ, tài liệu sau:',
      'Ông (bà): Nguyễn Văn Mẫu cam đoan đã kiểm tra và nhận đầy đủ các giấy tờ, hồ sơ, tài liệu nêu trên.',
      'Biên bản lập xong hồi 09 giờ 50 cùng ngày, đã đọc lại cho mọi người nghe, nhất trí, ký tên.',
    ]) {
      expect(body, s).toContain(s);
    }
  });
});

describe('mọi biểu mẫu là bản nháp, không tự nhận là chính thức', () => {
  it.each(FORM_CODES)('%s có dòng cảnh báo bản nháp và phiên bản mẫu', async (code) => {
    const { body, header, zip } = await render(code, FULL_INPUTS[code] as never);
    expect(body[0]).toBe(DRAFT_BANNER);
    expect(DRAFT_BANNER).toBe('BẢN NHÁP – chưa được khách hàng/pháp lý chấp nhận');
    expect(FORM_TEMPLATE_VERSION).toBe('TT08/2026-PL3');
    expect(body[1]).toContain('TT08/2026-PL3');
    expect(body[1]).toContain(TEMPLATES[code].ref);
    expect(header).toContain(DRAFT_BANNER);
    const text = body.join('\n');
    expect(text).toContain('Không phải biểu mẫu chính thức');
    expect(text).not.toContain('Ban hành kèm theo');
    const core = await zip.file('docProps/core.xml')?.async('string');
    expect(core).toContain('BẢN NHÁP');
  });

  it('không bịa chữ ký: dòng chữ ký chỉ có chức danh và hướng dẫn ký, không có tên', async () => {
    const n06 = (await render('N-06', FULL_INPUTS['N-06'])).body;
    const i = n06.indexOf('TRƯỞNG VĂN PHÒNG');
    expect(i).toBeGreaterThan(0);
    expect(n06[i + 1]).toBe('(Ký, ghi rõ họ tên, đóng dấu)');
    const n01 = (await render('N-01', FULL_INPUTS['N-01'])).body;
    const a = n01.indexOf('BÊN A');
    expect(n01.slice(a, a + 2)).toEqual(['BÊN A', '(Ký, ghi rõ họ tên, đóng dấu)']);
  });

  it('N-11: chức danh ký theo quyết định nghiệp vụ (THV còn hành nghề hay Trưởng VP)', async () => {
    const signer = async (still: boolean | undefined): Promise<string> => {
      const { body } = await render('N-11', { ...N11, thvStillPracticing: still });
      const k = body.findIndex((p) => p.startsWith('(Ký, đóng dấu của văn phòng'));
      return body[k - 1] as string;
    };
    expect(await signer(true)).toBe('THỪA HÀNH VIÊN (3)');
    expect(await signer(false)).toBe('TRƯỞNG VĂN PHÒNG (3)');
    expect(await signer(undefined)).toBe('THỪA HÀNH VIÊN/TRƯỞNG VĂN PHÒNG (3)');
  });
});

describe('dữ liệu thiếu giữ nguyên chỗ chấm gốc', () => {
  it.each(FORM_CODES)('%s: đầu vào rỗng không sinh "undefined"/"null"', async (code) => {
    const { body } = await render(code, {} as never);
    const text = body.join('\n');
    expect(text).not.toMatch(/undefined|null|NaN|\[object|\{\{|\}\}/);
    expect(text).toMatch(/\.{6,}|…{3,}/);
  });

  it('N-03: chỗ trống không có dữ liệu giữ đúng số chấm của mẫu chính thức', async () => {
    const { body } = await render('N-03', {});
    const dots = (n: number): string => '.'.repeat(n);
    expect(body).toContain(
      `Hôm nay, ngày ${dots(6)} tháng ${dots(9)} năm ${dots(13)}, tại: ${dots(57)}`,
    );
    expect(body).toContain(`Số: ${dots(13)}/(năm)/HĐDV-VB`);
  });

  it('N-03: điền một phần, phần còn lại vẫn là chấm', async () => {
    const { body } = await render('N-03', {
      office: { name: 'Mẫu Thử Nghiệm' },
      signDate: '2026-10-05',
    });
    expect(body).toContain(
      '**1. Văn phòng thi hành án dân sự**: Mẫu Thử Nghiệm'.replace(/\*\*/g, ''),
    );
    const addr = body.find((p) => p.startsWith('Địa chỉ: ') && p.includes('…'));
    expect(addr).toBeDefined();
    const day = body.find((p) => p.startsWith('Hôm nay, ngày 05 tháng 10 năm 2026'));
    expect(day).toContain(', tại: ......');
  });

  it('số/chuỗi rỗng hoặc toàn khoảng trắng coi như thiếu', () => {
    const ctx = buildContext('N-03', { office: { name: '   ', address: '' }, contractSeq: '' });
    expect(ctx.fields.has('office.name')).toBe(false);
    expect(ctx.fields.has('office.address')).toBe(false);
    expect(ctx.fields.has('contractSeq')).toBe(false);
  });
});

describe('dữ liệu đầu vào', () => {
  it('đầy đủ dữ liệu: mọi khóa của mẫu đều có nguồn, không còn chỗ chấm ứng với dữ liệu', () => {
    // N-01 chỉ điền một trong ba dòng cơ quan yêu cầu theo `kind`.
    const optional: Partial<Record<FormCode, string[]>> = {
      'N-01': ['requester.procuracyName', 'requester.agencyName'],
    };
    for (const code of FORM_CODES) {
      const ctx = buildContext(code, FULL_INPUTS[code] as never);
      const missing = templateKeys(TEMPLATES[code]).filter(
        (k) => !ctx.fields.has(k) && !(optional[code] ?? []).includes(k),
      );
      expect(missing, code).toEqual([]);
    }
  });

  it('ngày sai định dạng hoặc không tồn tại bị từ chối rõ ràng', () => {
    expect(() => buildContext('N-03', { signDate: '05/10/2026' })).toThrow(FormInputError);
    expect(() => buildContext('N-03', { signDate: '2026-02-30' })).toThrow(FormInputError);
    expect(() =>
      buildContext('N-01', { requester: { kind: 'OTHER' as never, name: 'x' } }),
    ).toThrow(FormInputError);
  });

  it('định dạng ngày/tiền theo kiểu Việt Nam; năm không bị chèn dấu chấm', () => {
    const ctx = buildContext('N-03', {
      signDate: '2026-03-05',
      contractYear: 2026,
      fee: { total: 1500000 },
    });
    expect(ctx.fields.get('signDate.d')).toBe('05');
    expect(ctx.fields.get('signDate.m')).toBe('03');
    expect(ctx.fields.get('signDate.y')).toBe('2026');
    expect(ctx.fields.get('contractYear')).toBe('2026');
    expect(ctx.fields.get('fee.total')).toBe('1.500.000');
  });

  it('ký tự đặc biệt XML được escape đúng, ký tự điều khiển bị loại', async () => {
    const { body } = await render('N-03', {
      office: { name: 'A & B <C> "D"' },
      requester: { person: { fullName: 'Tên\u0000 lỗi\u0007' } },
    });
    expect(body.some((p) => p.includes('A & B <C> "D"'))).toBe(true);
    expect(body.some((p) => p.includes('Tên lỗi'))).toBe(true);
  });

  it('N-02: danh sách giấy tờ đánh số, dòng chưa có dữ liệu giữ chấm; vượt 2 dòng thì thêm dòng', async () => {
    const one = (await render('N-02', { documents: ['Giấy A'] })).body;
    expect(one).toContain('1) Giấy A');
    expect(one.some((p) => p.startsWith('2)…'))).toBe(true);
    const three = (await render('N-02', { documents: ['A', 'B', 'C'] })).body;
    expect(three).toEqual(expect.arrayContaining(['1) A', '2) B', '3) C']));
  });

  it('N-01: bảng kê có dữ liệu, ô Ký nhận để trống', async () => {
    const { body } = await render('N-01', FULL_INPUTS['N-01']);
    expect(body).toContain('Giấy triệu tập số 01/GT-MẪU');
    expect(body).toContain('50.000');
    expect(body).toContain('Tổng cộng: 125.000');
    const k = body.indexOf('Ký nhận');
    expect(k).toBeGreaterThan(0);
  });

  it('N-11: bảng sửa lỗi có hàng dữ liệu', async () => {
    const { body } = await render('N-11', N11);
    expect(body).toContain('Ngày 08/10/2062');
    expect(body).toContain('Ngày 08/10/2026');
  });
});
