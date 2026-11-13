import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  it('ô chọn có data-auto tự gửi biểu mẫu, ô chọn thường thì không', () => {
    const submit = vi.fn();
    const { container } = render(
      <form>
        <DmsPopoverDismiss />
        <select name="fa" data-auto>
          <option value="">Tất cả</option>
          <option value="x">X</option>
        </select>
        <select name="lt">
          <option value="">Tất cả</option>
          <option value="y">Y</option>
        </select>
      </form>,
    );
    const form = container.querySelector('form')!;
    form.requestSubmit = submit;
    fireEvent.change(container.querySelector('select[name=lt]')!, { target: { value: 'y' } });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.change(container.querySelector('select[name=fa]')!, { target: { value: 'x' } });
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
