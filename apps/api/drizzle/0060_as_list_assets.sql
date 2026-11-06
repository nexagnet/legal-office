-- Đọc tài sản của một hồ sơ THA kèm sự kiện, đề xuất biện pháp và lệnh đã ghi (Figma N17 H2). Chỉ đọc.
-- Cùng phạm vi quyền với as_list_transfers. Tài sản NHẠY CẢM không trả nhãn ở danh sách (label = NULL); muốn xem nhãn phải
-- gọi as_access_asset (nêu mục đích, luôn audit). Không trả khoá bằng chứng hay hash, chỉ cho biết có bằng chứng.
CREATE FUNCTION as_list_assets(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (id uuid, case_id uuid, category text, label text, sensitivity text, obligation_id uuid, party_id uuid,
  created_at timestamptz, events jsonb, proposals jsonb)
LANGUAGE sql STABLE AS $$
  SELECT a.id, a.case_id, a.category, CASE WHEN a.sensitivity = 'SENSITIVE' THEN NULL ELSE a.label END, a.sensitivity,
         a.obligation_id, a.party_id, a.created_at,
         coalesce((SELECT jsonb_agg(jsonb_build_object('kind', e.kind, 'note', e.note, 'actorUserId', e.actor_user_id, 'at', e.at)
                                    ORDER BY e.at, e.id)
                   FROM as_events e WHERE e.asset_id = a.id AND e.tenant_id = a.tenant_id), '[]'::jsonb),
         coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'measure', p.measure, 'rationale', p.rationale, 'status', p.status,
                                     'proposedBy', p.proposed_by, 'createdAt', p.created_at,
                                     'agencyName', o.agency_name, 'orderRef', o.order_ref, 'orderAt', o.at)
                                    ORDER BY p.created_at, p.id)
                   FROM as_proposals p LEFT JOIN as_orders o ON o.id = p.order_id AND o.tenant_id = p.tenant_id
                   WHERE p.asset_id = a.id AND p.tenant_id = a.tenant_id), '[]'::jsonb)
  FROM as_assets a
  JOIN th_cases c ON c.id = a.case_id AND c.tenant_id = a.tenant_id
  WHERE a.tenant_id = p_tenant AND a.case_id = p_case
    AND td_authorize(p_tenant, p_actor, c.office_id, c.branch_id,
                     ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV'], c.handler_user_id) IS NULL
  ORDER BY a.created_at, a.id
$$;
