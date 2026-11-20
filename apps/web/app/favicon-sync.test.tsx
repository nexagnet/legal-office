// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FaviconSync } from '../components/FaviconSync';

const OFFICE = '22222222-2222-4222-8222-222222222222';
const hrefs = () =>
  [...document.head.querySelectorAll('link[rel~="icon"]')].map((l) => l.getAttribute('href'));

describe('FaviconSync', () => {
  afterEach(() => {
    cleanup();
    document.head.innerHTML = '';
  });

  it('does not touch the head on first render', () => {
    document.head.innerHTML = '<link rel="icon" href="/server.ico">';
    render(<FaviconSync officeId={OFFICE} version={1} />);
    expect(hrefs()).toEqual(['/server.ico']);
  });

  it('switches to the new logo, then back to the default icons when the logo is removed', () => {
    document.head.innerHTML = '<link rel="icon" href="/old.ico">';
    const { rerender } = render(<FaviconSync officeId={OFFICE} version={null} />);
    rerender(<FaviconSync officeId={OFFICE} version={42} />);
    expect(hrefs().every((h) => h?.includes(`/api/office/logo?officeId=${OFFICE}&v=42`))).toBe(
      true,
    );
    rerender(<FaviconSync officeId={null} version={null} />);
    const after = hrefs();
    expect(after.length).toBeGreaterThan(0);
    expect(after.some((h) => h?.includes('/api/office/logo'))).toBe(false);
    expect(after.some((h) => h?.startsWith('/favicon.ico?r='))).toBe(true);
  });
});
