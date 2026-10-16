const fold = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

/** Khớp từ khoá không phân biệt hoa thường và dấu tiếng Việt; từ khoá rỗng khớp tất cả. */
export const matchesQuery = (text: string, query: string): boolean =>
  fold(text).includes(fold(query.trim()));
