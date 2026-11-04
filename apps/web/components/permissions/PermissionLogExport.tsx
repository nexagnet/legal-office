/** Nút "Xuất bản sao" nhật ký phân quyền (cần quyền riêng dms.audit.export; máy chủ vẫn kiểm và ghi lại việc xuất). */
export function PermissionLogExport({ officeId }: { readonly officeId: string }) {
  return (
    <a
      className="btn-link"
      href={`/api/dms/permission-log/export?officeId=${encodeURIComponent(officeId)}`}
      download
    >
      Xuất bản sao
    </a>
  );
}
