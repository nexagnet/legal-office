-- DMS: tải lên bước đệm để thêm PHIÊN BẢN TỆP MỚI qua yêu cầu sửa đổi (cần hai tệp: tệp mới + bản scan văn bản sửa đổi).
-- Tệp mới được tải lên trước và gắn với người tải; yêu cầu sửa đổi chỉ nhận id bước đệm do chính người đó tải, dùng một lần.
-- Client không bao giờ tự chọn khoá đối tượng. Dòng bước đệm không xoá; chỉ đánh dấu đã dùng.
CREATE TABLE dms_staged_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  object_key text NOT NULL CHECK (btrim(object_key) <> ''),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (btrim(mime) <> ''),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  CONSTRAINT dms_staged_key_uq UNIQUE (tenant_id, object_key)
);
ALTER TABLE dms_staged_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_staged_uploads FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dms_staged_uploads
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE FUNCTION dms_staged_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.used_at IS NOT NULL
     OR (NEW.id, NEW.tenant_id, NEW.uploaded_by, NEW.object_key, NEW.sha256, NEW.mime, NEW.size_bytes, NEW.created_at)
        IS DISTINCT FROM (OLD.id, OLD.tenant_id, OLD.uploaded_by, OLD.object_key, OLD.sha256, OLD.mime, OLD.size_bytes, OLD.created_at) THEN
    RAISE EXCEPTION 'dms_staged_uploads is append-only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dms_staged_guard_trg BEFORE UPDATE OR DELETE ON dms_staged_uploads FOR EACH ROW EXECUTE FUNCTION dms_staged_guard();
CREATE TRIGGER dms_staged_no_truncate BEFORE TRUNCATE ON dms_staged_uploads FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();

CREATE FUNCTION dms_stage_upload(p_tenant uuid, p_actor uuid, p_key text, p_sha text, p_mime text, p_size bigint)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE new_id uuid;
BEGIN
  IF btrim(coalesce(p_key, '')) = '' OR coalesce(p_sha, '') !~ '^[0-9a-f]{64}$' OR btrim(coalesce(p_mime, '')) = '' OR coalesce(p_size, 0) <= 0 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.upload.stage', false, 'INVALID_INPUT', NULL, NULL, NULL);
  END IF;
  INSERT INTO dms_staged_uploads (tenant_id, uploaded_by, object_key, sha256, mime, size_bytes)
  VALUES (p_tenant, p_actor, btrim(p_key), p_sha, btrim(p_mime), p_size) RETURNING id INTO new_id;
  RETURN vibang_audit(p_tenant, p_actor, 'dms.upload.stage', true, 'UPLOAD_STAGED', NULL, NULL, new_id::text);
END $$;

-- Gửi yêu cầu thêm phiên bản tệp mới: tệp mới lấy từ bước đệm của chính người gửi (dùng một lần), bằng chứng như các yêu cầu khác.
CREATE FUNCTION dms_amendment_propose_version(p_tenant uuid, p_actor uuid, p_case uuid, p_document uuid, p_file uuid, p_staged uuid,
                                              p_reason text, p_ev_key text, p_ev_sha text, p_ev_mime text, p_ev_size bigint)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE s dms_staged_uploads; res vibang_op;
BEGIN
  SELECT * INTO s FROM dms_staged_uploads WHERE id = p_staged AND tenant_id = p_tenant AND uploaded_by = p_actor FOR UPDATE;
  IF NOT FOUND OR s.used_at IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.amendment.propose', false,
                        CASE WHEN FOUND THEN 'UPLOAD_ALREADY_USED' ELSE 'UPLOAD_NOT_FOUND' END, NULL, NULL, p_case::text);
  END IF;
  res := dms_amendment_propose(p_tenant, p_actor, p_case, p_document, p_file, 'FILE_VERSION',
                               jsonb_build_object('object_key', s.object_key, 'sha256', s.sha256, 'mime', s.mime, 'size_bytes', s.size_bytes),
                               p_reason, false, p_ev_key, p_ev_sha, p_ev_mime, p_ev_size);
  IF res.ok THEN UPDATE dms_staged_uploads SET used_at = now() WHERE id = p_staged; END IF;
  RETURN res;
END $$;
