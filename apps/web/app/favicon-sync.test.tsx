// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FaviconSync } from '../components/FaviconSync';

const OFFICE = '22222222-2222-4222-8222-222222222222';
const hrefs = () =>
  [...document.head.querySelectorAll('link[rel~="icon"]')].map((link) => link.getAttribute('href'));

describe('FaviconSync', () => {
  it('lets React switch from defaults to the office logo and unmount the icons during navigation', () => {
    const { rerender, unmount } = render(<FaviconSync officeId={null} version={null} />);
    expect(hrefs()).toContain('/favicon.ico?v=2');

    rerender(<FaviconSync officeId={OFFICE} version={42} />);
    const logo = `/api/office/logo?officeId=${OFFICE}&v=42`;
    expect(hrefs()).toEqual([logo, logo]);

    rerender(<FaviconSync officeId={OFFICE} version={43} />);
    expect(hrefs()).toEqual([logo.replace('v=42', 'v=43'), logo.replace('v=42', 'v=43')]);

    rerender(<FaviconSync officeId={OFFICE} version={null} />);
    expect(hrefs()).toEqual([
      '/favicon.ico?v=2',
      '/icon.svg?v=2',
      '/favicon-16x16.png?v=2',
      '/favicon-32x32.png?v=2',
    ]);

    unmount();
    expect(hrefs()).toEqual([]);
  });
});
