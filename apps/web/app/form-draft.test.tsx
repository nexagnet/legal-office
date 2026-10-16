import { describe, expect, it } from 'vitest';
import { buildInput } from '../components/FormDraft';

describe('buildInput', () => {
  it('builds nested objects from dotted paths and skips blanks', () => {
    const f = new FormData();
    f.set('requester.organization.name', ' Công ty Minh Long ');
    f.set('signPlace', '   ');
    f.set('office.name', 'Văn phòng A');
    const input = buildInput(f, [
      { path: 'requester.organization.name', label: 'a' },
      { path: 'signPlace', label: 'b' },
      { path: 'office.name', label: 'c' },
    ]);
    expect(input).toEqual({
      requester: { organization: { name: 'Công ty Minh Long' } },
      office: { name: 'Văn phòng A' },
    });
  });
});
