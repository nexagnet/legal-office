// Truy vấn MỚI (sau 0098): đúng các hàm mà endpoint /dms/case-search, /dms/case-facet-counts, /dms/search gọi.
const pick = (a, i) => a[i % a.length];
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
const ts = (s) =>
  fold(s)
    .split(/\s+/)
    .map((t, i, a) => (i === a.length - 1 ? `${t}:*` : t))
    .join(' & ');
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
const NAMES = [
  'nguyen van an',
  'tran thi binh',
  'le minh cuong',
  'pham quoc dung',
  'hoang thu ha',
  'vu thi lan',
];
const NUMS = ['45/gtt', '120/qd', '777/cv-vp', '3/tb', '998/gtt'];
const personas = ['admin', 'vanthu', 'thv'];
const KINDS = ['Biên bản', 'Quyết định', 'Thông báo', 'Hợp đồng'];

// (tenant, actor, office, domain, status, q, year, from, to, branch, creator, kind, scan, pending, sort, cursor, limit, offset, with_total)
const sc = (persona, name, f = {}, page = {}) => ({
  name: `${name} [${persona}]`,
  sql: 'SELECT id, cursor, total_capped FROM dms_search_cases($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)',
  params: (c, i) => {
    const v = typeof f === 'function' ? f(c, i) : f;
    return [
      c.tenantId,
      c.personas[persona],
      c.officeId,
      v.domain ?? null,
      v.status ?? null,
      v.q ?? null,
      v.year ?? null,
      null,
      null,
      v.branch ?? null,
      v.creator ?? null,
      v.kind ?? null,
      v.scan ?? null,
      v.pending ?? null,
      page.sort ?? 'newest',
      page.cursor ?? null,
      page.limit ?? 50,
      page.offset ?? 0,
      true,
    ];
  },
});
const fc = (persona, name, f = {}) => ({
  name: `facets ${name} [${persona}]`,
  sql: 'SELECT * FROM dms_case_facet_counts($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
  params: (c, i) => {
    const v = typeof f === 'function' ? f(c, i) : f;
    return [
      c.tenantId,
      c.personas[persona],
      c.officeId,
      v.domain ?? null,
      v.status ?? null,
      v.q ?? null,
      v.year ?? null,
      null,
      null,
      v.branch ?? null,
      v.creator ?? null,
      v.kind ?? null,
      v.scan ?? null,
      v.pending ?? null,
    ];
  },
});
export const scenarios = [
  ...personas.flatMap((p) => [
    sc(p, 'list official vibang 2024 p1', { domain: 'vibang', status: 'RECORDED', year: 2024 }),
    sc(
      p,
      'list official vibang 2024 offset 2000',
      { domain: 'vibang', status: 'RECORDED', year: 2024 },
      { offset: 2000 },
    ),
    sc(p, 'list all-domains no filter', {}),
    sc(p, 'list official vibang 2024 thieu-scan', {
      domain: 'vibang',
      status: 'RECORDED',
      year: 2024,
      scan: 'missing',
    }),
    sc(p, 'list + creator + kind', (c, i) => ({
      domain: 'vibang',
      status: 'RECORDED',
      creator: pick(c.creators, i).id,
      kind: pick(KINDS, i),
    })),
    sc(p, 'list + branch', (c, i) => ({
      domain: 'tongdat',
      status: 'RECORDED',
      branch: pick(c.branches, i),
    })),
    sc(p, 'list drafts', { status: 'DRAFT' }),
    sc(p, 'list pending-amendment', { status: 'RECORDED', pending: true }),
    sc(p, 'text name', (c, i) => ({ domain: 'vibang', status: 'RECORDED', q: pick(NAMES, i) })),
    sc(p, 'text name no domain', (c, i) => ({ q: pick(NAMES, i) })),
    sc(p, 'text case number', (c, i) => ({ q: pick(NUMS, i) })),
    sc(p, 'text 2 words + year', (c, i) => ({
      status: 'RECORDED',
      year: 2025,
      q: `${pick(NAMES, i)} so ky hieu`,
    })),
    sc(
      p,
      'keyset deep page (cursor mid)',
      { domain: 'vibang', status: 'RECORDED' },
      { cursor: '2022-06-01T00:00:00.000000+00|ffffffff-ffff-ffff-ffff-ffffffffffff' },
    ),
    fc(p, 'official vibang 2026', { domain: 'vibang', status: 'RECORDED', year: 2024 }),
    fc(p, 'all-domains no filter', {}),
    fc(p, 'with text', (c, i) => ({ status: 'RECORDED', q: pick(NAMES, i) })),
    fc(p, 'with creator+kind picked', (c, i) => ({
      domain: 'vibang',
      status: 'RECORDED',
      creator: pick(c.creators, i).id,
      kind: pick(KINDS, i),
    })),
    ...[
      ['common', COMMON],
      ['rare', RARE],
    ].map(([kind, terms]) => ({
      name: `content ${kind} [${p}]`,
      sql: 'SELECT case_id, rank, ranked FROM dms_search_content($1,$2,$3,$4,$5,$6,$7,$8,$9,20,0)',
      params: (c, i) => [
        c.tenantId,
        c.personas[p],
        c.officeId,
        null,
        ts(pick(terms, i)),
        null,
        null,
        null,
        null,
      ],
    })),
    {
      name: `content common + year + branch [${p}]`,
      sql: 'SELECT case_id, rank, ranked FROM dms_search_content($1,$2,$3,$4,$5,$6,$7,$8,$9,20,0)',
      params: (c, i) => [
        c.tenantId,
        c.personas[p],
        c.officeId,
        'vibang',
        ts(pick(COMMON, i)),
        2025,
        pick(c.branches, i),
        null,
        null,
      ],
    },
  ]),
];
