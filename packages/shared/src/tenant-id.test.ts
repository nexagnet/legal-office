import { describe, expect, it } from 'vitest';
import { toTenantId } from './tenant-id';

describe('toTenantId', () => {
  it('returns the trimmed value', () => {
    expect(toTenantId('  tenant-a ')).toBe('tenant-a');
  });

  it('rejects empty values', () => {
    expect(() => toTenantId('   ')).toThrow('TenantId must not be empty');
  });
});
