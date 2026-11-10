import { describe, expect, it } from 'vitest';
import { legacyOcrEnabled, legacySearchEnabled } from './legacy';

describe('hai công tắc tài liệu cũ độc lập', () => {
  it('mặc định tắt cả hai', () => {
    expect(legacyOcrEnabled({})).toBe(false);
    expect(legacySearchEnabled({})).toBe(false);
  });
  it('bật bằng 1 hoặc true, mỗi biến chỉ tác động phần của nó', () => {
    expect(legacyOcrEnabled({ LEGACY_OCR_ENABLED: '1' })).toBe(true);
    expect(legacySearchEnabled({ LEGACY_OCR_ENABLED: '1' })).toBe(false);
    expect(legacySearchEnabled({ LEGACY_SEARCH_ENABLED: ' TRUE ' })).toBe(true);
    expect(legacyOcrEnabled({ LEGACY_SEARCH_ENABLED: 'true' })).toBe(false);
    expect(legacyOcrEnabled({ LEGACY_OCR_ENABLED: '0' })).toBe(false);
    expect(legacyOcrEnabled({ LEGACY_OCR_ENABLED: 'yes' })).toBe(false);
  });
});
