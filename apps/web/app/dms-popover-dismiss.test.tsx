import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DmsPopoverDismiss } from '../components/DmsPopoverDismiss';

afterEach(cleanup);

function setup() {
  const { container } = render(
    <div>
      <DmsPopoverDismiss />
      <p data-testid="outside">ngoài</p>
      <details className="dms-pop" open>
        <summary>Bộ lọc khác</summary>
        <div data-testid="inside">
          <details className="dms-pop-time" open>
            <summary>Thời gian</summary>
          </details>
        </div>
      </details>
    </div>,
  );
  return container.querySelector<HTMLDetailsElement>('details.dms-pop')!;
}

describe('đóng ngăn lọc', () => {
  it('bấm ra ngoài thì đóng, bấm bên trong thì giữ', () => {
    const d = setup();
    fireEvent.mouseDown(d.querySelector('[data-testid=inside]')!);
    expect(d.open).toBe(true);
    fireEvent.mouseDown(document.querySelector('[data-testid=outside]')!);
    expect(d.open).toBe(false);
  });
  it('nhấn Esc thì đóng và trả tiêu điểm về nút mở', () => {
    const d = setup();
    d.querySelector<HTMLElement>(':scope > summary')!.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(d.open).toBe(false);
    expect(document.activeElement).toBe(d.querySelector(':scope > summary'));
  });
});
