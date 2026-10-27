import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAction } from '../components/useAction';
import { Button } from '../components/ui/button';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

describe('Button loading', () => {
  it('khoá nút và báo aria-busy khi đang gửi', () => {
    render(<Button loading>Lưu</Button>);
    const b = screen.getByRole('button', { name: 'Lưu' });
    expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(b.getAttribute('aria-busy')).toBe('true');
  });
  it('bình thường thì không khoá', () => {
    render(<Button>Lưu</Button>);
    const b = screen.getByRole('button', { name: 'Lưu' });
    expect((b as HTMLButtonElement).disabled).toBe(false);
    expect(b.hasAttribute('aria-busy')).toBe(false);
  });
  it('vẫn nhấn được khi không loading', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Lưu</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('useAction chống bấm đúp', () => {
  it('chỉ chạy một lần khi gọi run hai lần liên tiếp', async () => {
    const { result } = renderHook(() => useAction());
    let release: (v: { ok: boolean }) => void = () => undefined;
    const action = vi.fn(() => new Promise<{ ok: boolean }>((r) => (release = r)));
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.run(action, 'xong');
      second = result.current.run(action, 'xong');
    });
    expect(await second).toBe(false);
    await act(async () => {
      release({ ok: true });
      await first;
    });
    expect(action).toHaveBeenCalledOnce();
    expect(result.current.busy).toBe(false);
  });
});
