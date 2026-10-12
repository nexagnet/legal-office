import { describe, expect, it } from 'vitest';
import { InMemoryAuditSink, authorize } from '../audit/audit';
import { decide } from './decide';
import { ROLES, type Actor, type Resource } from './types';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const OFFICE = 'office-1';

const actor = (over: Partial<Actor> = {}): Actor => ({
  userId: 'user-1',
  tenantId: TENANT_A,
  officeId: OFFICE,
  role: 'THV',
  branchIds: ['branch-1'],
  legalSigner: false,
  ...over,
});
const resource = (over: Partial<Resource> = {}): Resource => ({
  tenantId: TENANT_A,
  officeId: OFFICE,
  branchId: 'branch-1',
  ...over,
});

describe('decide', () => {
  it.each(['case.list', 'case.read', 'case.write', 'file.download'])(
    'denies %s across tenants',
    (action) => {
      expect(decide(actor(), action, resource({ tenantId: TENANT_B }))).toEqual({
        allow: false,
        reason: 'TENANT_MISMATCH',
      });
    },
  );

  it('denies a branch that was not granted, with no bypass for non-office-wide roles', () => {
    for (const role of ROLES.filter((r) => r !== 'TRUONG_VP')) {
      const d = decide(
        actor({ role, legalSigner: true }),
        'legal.sign',
        resource({ branchId: 'branch-2' }),
      );
      expect(d).toEqual({ allow: false, reason: 'BRANCH_NOT_GRANTED' });
    }
  });

  it('allows a granted branch for a permitted role', () => {
    expect(decide(actor(), 'case.write', resource())).toEqual({ allow: true, reason: 'ALLOWED' });
  });

  it('lets an office-wide role see any branch of its own office but never another office', () => {
    const lead = actor({ role: 'TRUONG_VP', branchIds: [] });
    expect(decide(lead, 'case.read', resource({ branchId: 'branch-9' })).allow).toBe(true);
    expect(decide(lead, 'case.read', resource({ officeId: 'office-2' }))).toEqual({
      allow: false,
      reason: 'OFFICE_MISMATCH',
    });
  });

  it('does not imply legal signing from the Admin role', () => {
    const admin = actor({ role: 'ADMIN', branchIds: ['branch-1'] });
    expect(decide(admin, 'legal.sign', resource())).toEqual({
      allow: false,
      reason: 'SIGNING_AUTHORITY_NOT_GRANTED',
    });
  });

  it('allows legal signing only with the separate grant', () => {
    const signer = actor({ role: 'THV', legalSigner: true });
    expect(decide(signer, 'legal.sign', resource()).allow).toBe(true);
  });

  it('fails closed on unknown actions and on roles lacking the permission', () => {
    expect(decide(actor(), 'case.delete', resource())).toEqual({
      allow: false,
      reason: 'UNKNOWN_ACTION',
    });
    expect(decide(actor({ role: 'KE_TOAN' }), 'case.write', resource())).toEqual({
      allow: false,
      reason: 'ROLE_LACKS_PERMISSION',
    });
    expect(decide(actor({ role: 'bogus' as Actor['role'] }), 'case.read', resource())).toEqual({
      allow: false,
      reason: 'ROLE_LACKS_PERMISSION',
    });
  });
});

describe('authorize', () => {
  it('writes one audit row for every decision, including denials', async () => {
    const sink = new InMemoryAuditSink();
    const now = () => new Date('2026-10-12T00:00:00.000Z');
    await authorize(actor(), 'case.read', resource(), sink, now);
    await authorize(actor(), 'case.read', resource({ tenantId: TENANT_B }), sink, now);
    expect(sink.all()).toEqual([
      expect.objectContaining({ outcome: 'allow', reason: 'ALLOWED', actorId: 'user-1' }),
      expect.objectContaining({ outcome: 'deny', reason: 'TENANT_MISMATCH', tenantId: TENANT_A }),
    ]);
  });

  it('records only identifiers and codes, so no PII can reach the audit trail', async () => {
    const sink = new InMemoryAuditSink();
    await authorize(actor(), 'case.read', resource(), sink);
    expect(Object.keys(sink.all()[0]!).sort()).toEqual(
      ['action', 'actorId', 'at', 'branchId', 'officeId', 'outcome', 'reason', 'tenantId'].sort(),
    );
  });

  it('fails closed when the audit sink cannot record', async () => {
    const broken = { record: () => Promise.reject(new Error('sink down')) };
    await expect(authorize(actor(), 'case.read', resource(), broken)).rejects.toThrow('sink down');
  });
});
