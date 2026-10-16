-- Lát #82: danh bạ chủ thể dùng chung (cá nhân/tổ chức) và hợp đồng dịch vụ có hiệu lực. Chỉ THÊM cột (nullable) vào bảng cũ,
-- không phá dữ liệu hiện có. Trường tối thiểu theo NĐ 151 Điều 30.2 c–d; cá nhân: họ tên, số định danh, địa chỉ, điện thoại;
-- tổ chức: tên, mã số thuế/đăng ký, người đại diện, địa chỉ. Không có số tiền/thanh toán (MISA giữ kế toán). Dữ liệu giả lập.
-- Quyền đọc/ghi PII: cùng nhóm vai tiếp nhận (vb_is_intake_staff); vai khác nhận danh sách rỗng hoặc bị từ chối, có audit.

ALTER TABLE customers
  ADD COLUMN display_name text,
  ADD COLUMN id_number text,
  ADD COLUMN address text,
  ADD COLUMN phone text,
  ADD COLUMN tax_code text,
  ADD COLUMN representative text,
  ADD COLUMN updated_by uuid,
  ADD COLUMN updated_at timestamptz;

ALTER TABLE contracts
  ADD COLUMN service_kind text CHECK (service_kind IN ('VI_BANG', 'TONG_DAT', 'XAC_MINH', 'THI_HANH_AN')),
  ADD COLUMN signed_on date,
  ADD COLUMN valid_from date,
  ADD COLUMN valid_to date,
  ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ENDED')),
  ADD COLUMN note text,
  ADD COLUMN updated_by uuid,
  ADD COLUMN updated_at timestamptz,
  ADD CONSTRAINT contracts_valid_range_chk CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from);

CREATE FUNCTION vb_update_customer(p_tenant uuid, p_actor uuid, p_customer uuid, p_display_name text, p_id_number text,
  p_address text, p_phone text, p_tax_code text, p_representative text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c customers%ROWTYPE;
BEGIN
  IF NOT vb_is_intake_staff(p_tenant, p_actor) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.customer.update', false, 'ROLE_LACKS_PERMISSION', NULL, NULL, NULL);
  END IF;
  SELECT * INTO c FROM customers WHERE id = p_customer AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vb.customer.update', false, 'CUSTOMER_NOT_FOUND', NULL, NULL, NULL); END IF;
  IF btrim(coalesce(p_display_name, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.customer.update', false, 'NAME_REQUIRED', NULL, NULL, NULL);
  END IF;
  IF c.kind = 'PERSON' AND (btrim(coalesce(p_tax_code, '')) <> '' OR btrim(coalesce(p_representative, '')) <> '') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.customer.update', false, 'FIELD_NOT_FOR_KIND', NULL, NULL, NULL);
  END IF;
  IF c.kind = 'ORGANIZATION' AND btrim(coalesce(p_id_number, '')) <> '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.customer.update', false, 'FIELD_NOT_FOR_KIND', NULL, NULL, NULL);
  END IF;
  UPDATE customers SET display_name = btrim(p_display_name), id_number = nullif(btrim(coalesce(p_id_number, '')), ''),
         address = nullif(btrim(coalesce(p_address, '')), ''), phone = nullif(btrim(coalesce(p_phone, '')), ''),
         tax_code = nullif(btrim(coalesce(p_tax_code, '')), ''), representative = nullif(btrim(coalesce(p_representative, '')), ''),
         updated_by = p_actor, updated_at = now()
   WHERE id = p_customer AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.customer.update', true, 'ALLOWED', NULL, NULL, p_customer::text);
END $$;

CREATE FUNCTION vb_update_contract(p_tenant uuid, p_actor uuid, p_contract uuid, p_service_kind text, p_signed_on date,
  p_valid_from date, p_valid_to date, p_status text, p_note text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  IF NOT vb_is_intake_staff(p_tenant, p_actor) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.update', false, 'ROLE_LACKS_PERMISSION', NULL, NULL, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM contracts WHERE id = p_contract AND tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.update', false, 'CONTRACT_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF p_service_kind IS NOT NULL AND p_service_kind NOT IN ('VI_BANG', 'TONG_DAT', 'XAC_MINH', 'THI_HANH_AN') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.update', false, 'INVALID_SERVICE_KIND', NULL, NULL, NULL);
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('ACTIVE', 'ENDED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.update', false, 'INVALID_STATUS', NULL, NULL, NULL);
  END IF;
  IF p_valid_from IS NOT NULL AND p_valid_to IS NOT NULL AND p_valid_to < p_valid_from THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.update', false, 'INVALID_VALIDITY', NULL, NULL, NULL);
  END IF;
  UPDATE contracts SET service_kind = p_service_kind, signed_on = p_signed_on, valid_from = p_valid_from, valid_to = p_valid_to,
         status = p_status, note = nullif(btrim(coalesce(p_note, '')), ''), updated_by = p_actor, updated_at = now()
   WHERE id = p_contract AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vb.contract.update', true, 'ALLOWED', NULL, NULL, p_contract::text);
END $$;

-- Danh bạ: chỉ vai tiếp nhận được đọc (có PII). Vai khác nhận tập rỗng và bị ghi audit.
CREATE FUNCTION vb_list_customers(p_tenant uuid, p_actor uuid, p_query text)
RETURNS TABLE (id uuid, kind text, external_ref text, display_name text, id_number text, address text, phone text,
  tax_code text, representative text)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT vb_is_intake_staff(p_tenant, p_actor) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'vb.customer.list', false, 'ROLE_LACKS_PERMISSION', NULL, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'vb.customer.list', true, 'ALLOWED', NULL, NULL, NULL);
  RETURN QUERY
    SELECT c.id, c.kind, c.external_ref, c.display_name, c.id_number, c.address, c.phone, c.tax_code, c.representative
    FROM customers c
    WHERE c.tenant_id = p_tenant
      AND (btrim(coalesce(p_query, '')) = ''
        OR c.display_name ILIKE '%' || btrim(p_query) || '%' OR c.external_ref ILIKE '%' || btrim(p_query) || '%'
        OR c.id_number ILIKE '%' || btrim(p_query) || '%' OR c.tax_code ILIKE '%' || btrim(p_query) || '%')
    ORDER BY coalesce(c.display_name, c.external_ref), c.id
    LIMIT 100;
END $$;

CREATE FUNCTION vb_list_contracts(p_tenant uuid, p_actor uuid, p_customer uuid)
RETURNS TABLE (id uuid, customer_id uuid, external_ref text, service_kind text, signed_on text, valid_from text,
  valid_to text, status text, note text)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT vb_is_intake_staff(p_tenant, p_actor) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'vb.contract.list', false, 'ROLE_LACKS_PERMISSION', NULL, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'vb.contract.list', true, 'ALLOWED', NULL, NULL, NULL);
  RETURN QUERY
    SELECT k.id, k.customer_id, k.external_ref, k.service_kind, to_char(k.signed_on, 'YYYY-MM-DD'),
           to_char(k.valid_from, 'YYYY-MM-DD'), to_char(k.valid_to, 'YYYY-MM-DD'), k.status, k.note
    FROM contracts k
    WHERE k.tenant_id = p_tenant AND (p_customer IS NULL OR k.customer_id = p_customer)
    ORDER BY k.external_ref, k.id
    LIMIT 200;
END $$;
