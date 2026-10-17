'use client';

import type { FormEvent } from 'react';
import { useCasePost } from './CasePost';

interface Props {
  readonly caseId: string;
  readonly placeAddress: string | null;
  readonly canEdit: boolean;
}

/** Nhập tay địa chỉ nơi lập Vi bằng (cột 5 sổ S-02). Hồ sơ đã trả hoặc huỷ không sửa được; máy chủ quyết định quyền. */
export function PlaceForm({ caseId, placeAddress, canEdit }: Props) {
  const { post, error, busy } = useCasePost();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void post(`cases/${caseId}/place`, {
      placeAddress: String(f.get('placeAddress') ?? '').trim(),
    });
  }

  if (!canEdit) {
    return (
      <p>
        Nơi lập Vi bằng: <strong>{placeAddress ?? 'Chưa ghi nhận'}</strong>
      </p>
    );
  }
  return (
    <form className="form" onSubmit={submit}>
      <label>
        Nơi lập Vi bằng
        <input name="placeAddress" defaultValue={placeAddress ?? ''} maxLength={500} />
      </label>
      <button type="submit" disabled={busy}>
        Lưu nơi lập
      </button>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </form>
  );
}
