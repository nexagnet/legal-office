// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Avatar } from '../components/ui/avatar';
import { AVATAR_COLORS, avatarColor, initialsOf } from '../lib/avatar';

afterEach(cleanup);

describe('initialsOf', () => {
  it('takes the first and last word of a name', () => {
    expect(initialsOf('Nguyễn Văn Dũng')).toBe('ND');
    expect(initialsOf('Lê Thu Hà')).toBe('LH');
    expect(initialsOf('đặng Hà')).toBe('ĐH');
  });
  it('uses one letter for a single word and reads the name part of "Tên (email)"', () => {
    expect(initialsOf('Hà')).toBe('H');
    expect(initialsOf('Lê Thu Hà (ha@example.invalid)')).toBe('LH');
    expect(initialsOf('thv@example.invalid')).toBe('T');
    expect(initialsOf('')).toBe('');
  });
});

describe('avatarColor', () => {
  it('is stable per person and always one of the palette colours', () => {
    expect(avatarColor('user-1')).toBe(avatarColor('user-1'));
    expect(AVATAR_COLORS).toContain(avatarColor('user-2') as (typeof AVATAR_COLORS)[number]);
  });
});

describe('Avatar', () => {
  it('shows initials with the full name as accessible label', () => {
    render(<Avatar name="Lê Thu Hà" id="u1" />);
    const el = screen.getByRole('img', { name: 'Lê Thu Hà' });
    expect(el.textContent).toBe('LH');
  });
  it('falls back to a person icon when there is no name', () => {
    render(<Avatar name="" />);
    expect(screen.getByRole('img', { name: 'Người dùng' }).textContent).toBe('');
  });
});
