// Truy vấn HIỆN CÓ (trước tối ưu): đúng những hàm mà API đang gọi.
const pick = (a, i) => a[i % a.length];
const COMMON = [
  'quyết định',
  'thi hành',
  'văn phòng',
  'tài sản',
  'hợp đồng',
  'nguyễn',
  'giấy chứng nhận',
];
const RARE = ['đồng thau', 'tranh chấp đồng thau', 'thanh xuân cầu giấy'];
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
const ts = (s) =>
  fold(s)
    .split(/\s+/)
    .map((t, i, a) => (i === a.length - 1 ? `${t}:*` : t))
    .join(' & ');
const personas = ['admin', 'vanthu', 'thv'];

const list = (persona, domain, status) => ({
  name: `list ${persona} ${domain ?? 'all'} ${status ?? 'RECORDED*'} limit200`,
  sql: 'SELECT * FROM dms_list_cases($1,$2,$3,$4,$5,200,0)',
  params: (c) => [c.tenantId, c.personas[persona], c.officeId, domain, status],
});
export const scenarios = [
  ...personas.flatMap((p) => [list(p, 'vibang', null), list(p, null, null)]),
  {
    ...list('admin', 'vibang', null),
    name: 'list admin vibang offset 100000',
    sql: 'SELECT * FROM dms_list_cases($1,$2,$3,$4,$5,50,100000)',
  },
  ...personas.map((p) => ({
    name: `facets ${p} vibang`,
    sql: 'SELECT * FROM dms_case_facets($1,$2,$3,$4)',
    params: (c) => [c.tenantId, c.personas[p], c.officeId, 'vibang'],
  })),
  ...personas.flatMap((p) =>
    [
      ['common', COMMON],
      ['rare', RARE],
    ].map(([kind, terms]) => ({
      name: `ocr-search ${p} ${kind}`,
      sql: 'SELECT case_id, rank FROM dms_ocr_search($1,$2,$3,$4,$5,20)',
      params: (c, i) => [c.tenantId, c.personas[p], c.officeId, null, ts(pick(terms, i))],
    })),
  ),
];
