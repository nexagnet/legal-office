// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('looksLikeOrganization', () => {
  it('tells organisations from people by name when the data has no kind flag', async () => {
    const { looksLikeOrganization } = await import('../lib/avatar');
    expect(looksLikeOrganization('Công ty TNHH An Phát')).toBe(true);
    expect(looksLikeOrganization('Cty CP Minh Long')).toBe(true);
    expect(looksLikeOrganization('UBND quận Hoàn Kiếm')).toBe(true);
    expect(looksLikeOrganization('Ông Trần Văn B')).toBe(false);
    expect(looksLikeOrganization('Sơn Tùng')).toBe(false);
    expect(looksLikeOrganization('Cục Văn')).toBe(true);
  });
});

describe('Avatar photo', () => {
  it('shows the profile photo when a version is given and falls back to initials if it fails', async () => {
    const { fireEvent } = await import('@testing-library/react');
    render(<Avatar name="Lê Thu Hà" id="u1" photoVersion={123} />);
    const img = screen.getByRole('img', { name: 'Lê Thu Hà' });
    expect(img.getAttribute('src')).toBe('/api/people/u1/avatar?v=123');
    fireEvent.error(img);
    expect(screen.getByRole('img', { name: 'Lê Thu Hà' }).textContent).toBe('LH');
  });
  it('shows initials when there is no photo version', () => {
    render(<Avatar name="Lê Thu Hà" id="u1" photoVersion={null} />);
    expect(screen.getByRole('img', { name: 'Lê Thu Hà' }).textContent).toBe('LH');
  });
});

describe('Avatar lookup by id', () => {
  it('fetches photo versions in one batch and shows the photo for people who have one', async () => {
    const { waitFor } = await import('@testing-library/react');
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ items: [{ userId: 'p1', version: 7 }] }), {
        status: 200,
      });
    });
    render(
      <>
        <Avatar name="Có Ảnh" id="p1" />
        <Avatar name="Không Ảnh" id="p2" />
      </>,
    );
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Có Ảnh' }).getAttribute('src')).toBe(
        '/api/people/p1/avatar?v=7',
      ),
    );
    expect(screen.getByRole('img', { name: 'Không Ảnh' }).textContent).toBe('KẢ');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('p1,p2');
    vi.unstubAllGlobals();
  });
});
