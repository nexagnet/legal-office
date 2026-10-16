/** Gọi API qua cùng origin (/api → máy chủ). Trả về mã kết quả để ánh xạ sang câu tiếng Việt bằng `messageFor`. */
export interface PostResult {
  readonly ok: boolean;
  readonly code?: string;
  readonly label?: string | null;
}

export async function postJson(path: string, body: unknown): Promise<PostResult> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string; label?: string | null };
  return { ok: res.ok, code: json.code, label: json.label };
}
