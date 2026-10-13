/** Gửi một tệp làm thân yêu cầu (máy chủ tự tính hash và khoá lưu). Trả `{ok, code}` như các lệnh gọi JSON khác. */
export async function postFile(
  path: string,
  file: File,
  query?: Record<string, string>,
): Promise<{ ok: boolean; code?: string }> {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  const res = await fetch(`/api/${path}${qs}`, {
    method: 'POST',
    headers: { 'content-type': file.type },
    body: file,
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: res.ok, code: json.code };
}

/** Lấy tệp đã chọn trong ô `name` của biểu mẫu; null nếu chưa chọn hoặc tệp rỗng. */
export function pickedFile(form: HTMLFormElement, name: string): File | null {
  const input = form.elements.namedItem(name) as HTMLInputElement | null;
  const file = input?.files?.[0];
  return file && file.size > 0 ? file : null;
}
