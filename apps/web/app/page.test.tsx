import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import HomePage from './page';

afterEach(cleanup);

describe('HomePage', () => {
  it('renders the neutral placeholder with a tenant logo slot', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Quản lý văn phòng');
    expect(screen.getByTestId('tenant-logo-slot')).toBeTruthy();
  });
});
