import { describe, expect, it } from 'vitest';
import { memoryGate } from './mem-gate';

describe('memoryGate', () => {
  it('tắt khi không đặt OCR_MIN_FREE_MB', async () => {
    expect(await memoryGate({}, async () => 1)()).toBe(true);
  });
  it('chặn khi RAM trống dưới ngưỡng, cho qua khi đủ hoặc không đọc được', async () => {
    const env = { OCR_MIN_FREE_MB: '300' };
    expect(await memoryGate(env, async () => 299)()).toBe(false);
    expect(await memoryGate(env, async () => 300)()).toBe(true);
    expect(await memoryGate(env, async () => null)()).toBe(true);
  });
});
