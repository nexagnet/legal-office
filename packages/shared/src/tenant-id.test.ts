import { describe, expect, it } from 'vitest';
import { toTenantId } from './tenant-id';

describe('toTenantId', () => {
  it('returns the trimmed value as a TenantId', () => {
    expect(toTenantId('  tenant-1 ')).toBe('tenant-1');
  });

  it('rejects an empty value', () => {
    expect(() => toTenantId('   ')).toThrow('TenantId must not be empty');
  });
});
