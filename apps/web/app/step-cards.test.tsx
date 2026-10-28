// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StepCards } from '../components/ui/step-cards';

afterEach(cleanup);

describe('StepCards', () => {
  it('marks the current step and states every status in words', () => {
    render(
      <StepCards
        label="Ba bước"
        steps={[
          { key: 'a', title: 'Giao người', state: 'done' },
          { key: 'b', title: 'Đi tống đạt', state: 'current', action: <button>Ghi nhận</button> },
          { key: 'c', title: 'Hoàn tất', state: 'todo' },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[1]!.getAttribute('aria-current')).toBe('step');
    expect(items[0]!.getAttribute('aria-current')).toBeNull();
    expect(screen.getByText('Đã xong')).toBeTruthy();
    expect(screen.getByText('Đang ở bước này')).toBeTruthy();
    expect(screen.getByText('Chưa đến')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ghi nhận' })).toBeTruthy();
  });

  it('shows a failed finished step as ended, not as success', () => {
    render(
      <StepCards
        label="Bước"
        steps={[{ key: 'x', title: 'Kết luận', state: 'done', failed: true }]}
      />,
    );
    expect(screen.getByText('Kết thúc')).toBeTruthy();
    expect(screen.queryByText('Đã xong')).toBeNull();
  });
});
