import { describe, expect, it } from 'vitest';
import { matchesQuery } from './search';

describe('matchesQuery', () => {
  it('ignores case and Vietnamese diacritics', () => {
    expect(matchesQuery('Biên bản kê biên tài sản', 'BIEN BAN')).toBe(true);
    expect(matchesQuery('Đăng ký', 'dang ky')).toBe(true);
  });
  it('matches everything for an empty query and nothing for an unrelated one', () => {
    expect(matchesQuery('Phụ lục I', '')).toBe(true);
    expect(matchesQuery('Phụ lục I', 'công văn')).toBe(false);
  });
});
