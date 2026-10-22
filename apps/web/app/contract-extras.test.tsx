// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContractExtras } from '../components/ContractExtras';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ContractExtras', () => {
  it('lists files and parties with Vietnamese role labels', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          url.endsWith('/attachments')
            ? [{ id: 1, name: 'Bản scan HĐ' }]
            : [{ customerId: 'c2', role: 'WITNESS', displayName: 'Nguyễn A', externalRef: 'd' }],
      })),
    );
    const { container } = render(<ContractExtras contractId="k1" customers={[]} />);
    const d = container.querySelector('details')!;
    d.open = true;
    fireEvent(d, new Event('toggle'));
    await waitFor(() => expect(screen.getByText('Bản scan HĐ')).toBeTruthy());
    expect(screen.getAllByText(/Người làm chứng/).length).toBeGreaterThan(0);
  });
});
