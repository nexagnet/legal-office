import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from './page';

describe('HomePage', () => {
  it('renders the heading and the tenant logo slot', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { name: 'Legal Office' })).toBeTruthy();
    expect(screen.getByTestId('tenant-logo-slot')).toBeTruthy();
  });
});
