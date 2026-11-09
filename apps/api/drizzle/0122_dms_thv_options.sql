-- Sửa "Hồ sơ nháp chờ tôi lưu" không hoạt động: ô chọn Thừa hành viên trên bản nháp luôn rỗng.
-- Nguyên nhân: ô chọn lấy danh sách từ vb_list_thv (đường Vi bằng cũ) chỉ trả cho ADMIN và chỉ gồm tài khoản có vai 'THV';
-- tài khoản tạo theo Nhóm quyền có vai THANH_VIEN (0087) nên không bao giờ được ghi tên, và người soạn nháp không phải Admin
-- (vd. Thư ký) thấy danh sách rỗng. Hồ sơ không có thv_user_id thì không hiện ở mục chờ THV nào.
-- Danh sách mới: thành viên của văn phòng mà người gọi cũng là thành viên, có vai THV hoặc có Thẻ THV còn hiệu lực.
-- vb_list_thv giữ nguyên (đường Vi bằng cũ).
CREATE FUNCTION dms_list_thv_options(p_tenant uuid, p_actor uuid)
RETURNS TABLE (user_id uuid, office_id uuid, label text)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT u.id, m.office_id, ad_user_label(u.full_name, ac.email, u.external_ref)
  FROM memberships m
  JOIN users u ON u.id = m.user_id AND u.tenant_id = m.tenant_id
  LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
  WHERE m.tenant_id = p_tenant
    AND EXISTS (SELECT 1 FROM memberships a WHERE a.tenant_id = p_tenant AND a.user_id = p_actor AND a.office_id = m.office_id)
    AND (m.role = 'THV'
         OR EXISTS (SELECT 1 FROM of_thv_cards k
                     WHERE k.tenant_id = m.tenant_id AND k.office_id = m.office_id AND k.user_id = m.user_id
                       AND k.status = 'ACTIVE' AND (k.effective_to IS NULL OR k.effective_to >= current_date)))
  ORDER BY 3, 1
$$;
