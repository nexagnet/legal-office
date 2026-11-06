/** Một đoạn của văn bản đã tách để tô sáng: `hit` = khớp từ khóa. */
export interface HighlightPart {
  readonly text: string;
  readonly hit: boolean;
}

/** Bỏ dấu và hạ chữ thường từng ký tự, giữ NGUYÊN độ dài chuỗi để chỉ số khớp với văn bản gốc. */
function fold(s: string): string {
  let out = '';
  for (const ch of s) {
    const base = ch === 'đ' || ch === 'Đ' ? 'd' : ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const lower = (base || ch).toLowerCase();
    out += lower.length === ch.length ? lower : ch;
  }
  return out;
}

/** Tách từ khóa người dùng gõ: bỏ từ quá ngắn, bỏ trùng. */
export function highlightTerms(query: string): string[] {
  const seen = new Set<string>();
  for (const w of fold(query.normalize('NFC')).split(/\s+/)) if (w.length >= 2) seen.add(w);
  return [...seen];
}

/**
 * Tách `text` thành các đoạn khớp / không khớp từ khóa, không phân biệt hoa thường và dấu tiếng Việt
 * (gõ "hop dong" vẫn tô "hợp đồng"). Dùng để tô sáng đoạn trích kết quả tìm kiếm.
 */
export function highlightParts(text: string, query: string): HighlightPart[] {
  const src = text.normalize('NFC');
  const terms = highlightTerms(query);
  if (!src || terms.length === 0) return src ? [{ text: src, hit: false }] : [];
  const folded = fold(src);
  const marked = new Array<boolean>(src.length).fill(false);
  for (const t of terms) {
    for (let i = folded.indexOf(t); i >= 0; i = folded.indexOf(t, i + t.length)) {
      for (let k = i; k < i + t.length; k++) marked[k] = true;
    }
  }
  // Nối các từ khóa liền nhau, chỉ cách nhau bằng khoảng trắng, thành một cụm tô sáng ("hợp đồng", không phải "hợp" và "đồng").
  for (let i = 1; i < src.length; i++) {
    if (!marked[i] && marked[i - 1] && /\s/.test(src[i]!)) {
      let j = i;
      while (j < src.length && /\s/.test(src[j]!)) j++;
      if (j < src.length && marked[j]) for (let k = i; k < j; k++) marked[k] = true;
    }
  }
  const parts: HighlightPart[] = [];
  let start = 0;
  for (let i = 1; i <= src.length; i++) {
    if (i === src.length || marked[i] !== marked[start]) {
      parts.push({ text: src.slice(start, i), hit: marked[start]! });
      start = i;
    }
  }
  return parts;
}
