/**
 * Chuẩn hoá văn bản để tìm kiếm không dấu. Mỗi ký tự cho ra đúng một ký tự (giữ nguyên độ dài chuỗi) nên vị trí khớp
 * trong `search_text` dùng được để cắt đoạn trích từ văn bản gốc.
 */
export function foldChar(ch: string): string {
  if (ch === 'đ' || ch === 'Đ') return 'd';
  const base = ch.normalize('NFD')[0] ?? ch;
  return base.toLowerCase();
}

export function toSearchText(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFC')) out += foldChar(ch);
  return out;
}

/** Từ khoá dạng [a-z0-9]+ sau khi bỏ dấu; mọi ký tự khác bị bỏ nên không thể chèn cú pháp tsquery. */
export function searchTerms(query: string, max = 8): string[] {
  const words = toSearchText(query).match(/[a-z0-9]+/g) ?? [];
  return [...new Set(words)].slice(0, max);
}

/** Chuỗi cho to_tsquery('simple', ...): mọi từ phải có mặt, từ cuối khớp tiền tố. Rỗng nếu không có từ hợp lệ. */
export function toTsQuery(query: string): string {
  const terms = searchTerms(query);
  return terms.map((t, i) => (i === terms.length - 1 ? `${t}:*` : t)).join(' & ');
}

/** Đoạn trích quanh lần xuất hiện đầu tiên của một từ khoá, lấy từ văn bản GỐC (có dấu). */
export function snippetAround(text: string, terms: readonly string[], radius = 70): string {
  const folded = toSearchText(text);
  let at = -1;
  for (const t of terms) {
    const i = folded.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  const from = Math.max(0, (at < 0 ? 0 : at) - radius);
  const to = Math.min(text.length, (at < 0 ? 0 : at) + radius);
  const body = text.slice(from, to).replace(/\s+/g, ' ').trim();
  return `${from > 0 ? '…' : ''}${body}${to < text.length ? '…' : ''}`;
}
