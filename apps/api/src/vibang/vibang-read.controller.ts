import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { FILE_STORE, type FileStore } from '../storage/file-store';
import { VibangRepo } from './vibang.repo';

const caseNotFound = () => new NotFoundException({ code: 'CASE_NOT_FOUND', label: null });

/**
 * Các API ĐỌC bổ sung cho hồ sơ Vi bằng (MISA, N-11, tài liệu/chứng cứ). Mọi hàm đọc dùng cổng `vb_list_cases`:
 * người không được xem hồ sơ nhận 404 (không phân biệt "không tồn tại" và "không được xem"). Không có số tiền.
 */
@Controller('vibang')
@UseGuards(ActorGuard)
export class VibangReadController {
  constructor(
    @Inject(VibangRepo) private readonly repo: VibangRepo,
    @Optional() @Inject(FILE_STORE) private readonly store: FileStore | null,
  ) {}

  private read<T>(a: AuthenticatedActor, fn: string, caseId: string, extra: unknown[] = []) {
    return this.repo.rows<T>(a.tenantId, fn, [a.tenantId, a.userId, caseId, ...extra]);
  }

  /**
   * Số dự kiến sẽ cấp cho hồ sơ và việc đã nhập số cuối sổ giấy của năm hiện tại chưa. Chỉ xem trước, không cấp số;
   * số thật có thể khác nếu hồ sơ khác được cấp trước.
   */
  @Get('cases/:id/number-preview')
  async numberPreview(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const [r] = await this.read<{ next_label: string; paper_last_imported: boolean }>(
      a,
      'vb_number_preview',
      id,
    );
    if (!r) throw caseNotFound();
    return { nextLabel: r.next_label, paperLastImported: r.paper_last_imported };
  }

  /** Trạng thái/tham chiếu MISA hiện tại + các đề xuất thu hồi (mới nhất trước). */
  @Get('cases/:id/misa')
  async misa(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const [m] = await this.read<{
      status: string;
      reference: string | null;
      confirmed_by: string | null;
      confirmed_at: Date | null;
      revoke_status: string;
      revoke_reason: string | null;
      revoke_proposed_by: string | null;
      updated_at: Date | null;
    }>(a, 'vb_case_misa', id);
    if (!m) throw caseNotFound();
    const revokes = await this.read<{
      id: string;
      proposed_by: string;
      reason: string;
      proposed_at: Date;
      status: string;
      decided_by: string | null;
      decided_at: Date | null;
    }>(a, 'vb_list_revokes', id);
    return {
      status: m.status,
      reference: m.reference,
      confirmedBy: m.confirmed_by,
      confirmedAt: m.confirmed_at,
      revokeStatus: m.revoke_status,
      revokeReason: m.revoke_reason,
      revokeProposedBy: m.revoke_proposed_by,
      updatedAt: m.updated_at,
      revokeProposals: revokes.map((r) => ({
        id: r.id,
        proposedBy: r.proposed_by,
        reason: r.reason,
        proposedAt: r.proposed_at,
        status: r.status,
        decidedBy: r.decided_by,
        decidedAt: r.decided_at,
      })),
    };
  }

  private async registrations(a: AuthenticatedActor, caseId: string | null) {
    const rows = await this.repo.rows<{
      case_id: string;
      office_id: string;
      number_label: string;
      thv_user_id: string | null;
      thv_label: string | null;
      case_status: string;
      made_at: Date | null;
      reg_status: string;
      deadline_at: Date | null;
      updated_at: Date | null;
      updated_by: string | null;
      incident_reason: string | null;
      overdue: boolean;
    }>(a.tenantId, 'vb_list_registrations', [a.tenantId, a.userId, caseId, 200]);
    return rows.map((r) => ({
      caseId: r.case_id,
      officeId: r.office_id,
      numberLabel: r.number_label,
      thvUserId: r.thv_user_id,
      thvLabel: r.thv_label,
      caseStatus: r.case_status,
      madeAt: r.made_at,
      regStatus: r.reg_status,
      deadlineAt: r.deadline_at,
      updatedAt: r.updated_at,
      updatedBy: r.updated_by,
      incidentReason: r.incident_reason,
      overdue: r.overdue,
    }));
  }

  /**
   * Theo dõi cập nhật CSDL/Sở của các Vi bằng đã cấp số (việc phía Văn phòng; S-03 là sổ của Sở).
   * `status` lọc theo nhóm: pending (chưa/đang cập nhật), done (đã cập nhật), incident (sự cố); `summary` đếm trên toàn bộ danh sách.
   */
  @Get('registrations')
  async registrationList(@CurrentActor() a: AuthenticatedActor, @Query('status') status?: string) {
    const all = await this.registrations(a, null);
    const group = (s: string) =>
      s === 'CONFIRMED' ? 'done' : s === 'FAILED' ? 'incident' : 'pending';
    const summary = {
      pending: all.filter((r) => group(r.regStatus) === 'pending').length,
      done: all.filter((r) => group(r.regStatus) === 'done').length,
      incident: all.filter((r) => group(r.regStatus) === 'incident').length,
    };
    const items =
      status === 'pending' || status === 'done' || status === 'incident'
        ? all.filter((r) => group(r.regStatus) === status)
        : all;
    return { summary, items };
  }

  /** Trạng thái theo dõi cập nhật Sở/CSDL của một hồ sơ (đã cấp số). */
  @Get('cases/:id/registration')
  async registrationOne(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const [r] = await this.registrations(a, id);
    if (!r) throw caseNotFound();
    return r;
  }

  /** Tab "Thông tin pháp lý": hợp đồng, định danh khách (PII chỉ vai tiếp nhận), số vi bằng, MISA, ký, đóng dấu, đăng ký, bản scan. */
  @Get('cases/:id/legal')
  async legal(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const [r] = await this.read<Record<string, string | Date | null>>(a, 'vb_case_legal', id);
    if (!r) throw caseNotFound();
    return {
      placeAddress: r.place_address,
      contract: {
        ref: r.contract_ref,
        serviceKind: r.contract_service_kind,
        signedOn: r.contract_signed_on,
        validFrom: r.contract_valid_from,
        validTo: r.contract_valid_to,
        status: r.contract_status,
      },
      customer: {
        kind: r.customer_kind,
        name: r.customer_name,
        idNumber: r.customer_id_number,
        address: r.customer_address,
        phone: r.customer_phone,
        taxCode: r.customer_tax_code,
        representative: r.customer_representative,
      },
      number: { label: r.number_label, allocatedAt: r.number_allocated_at },
      misa: {
        status: r.misa_status,
        reference: r.misa_reference,
        confirmedAt: r.misa_confirmed_at,
      },
      signed: { at: r.signed_at, byLabel: r.signed_by_label },
      stamped: { at: r.stamped_at, byLabel: r.stamped_by_label },
      registration: { status: r.registration_status, deadlineAt: r.registration_deadline_at },
      finalScan: { sha256: r.final_scan_sha256, lockedAt: r.final_scan_locked_at },
    };
  }

  /** Tab "Lịch sử": các mốc của hồ sơ theo thời gian (mới nhất trước). `kind` là mã sự kiện, `detail` ngắn và không PII. */
  @Get('cases/:id/history')
  async history(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    await this.requireCase(a, id);
    const rows = await this.read<{
      at: Date;
      kind: string;
      actor_user_id: string | null;
      actor_label: string | null;
      detail: string | null;
    }>(a, 'vb_case_history', id);
    return {
      items: rows
        .map((r) => ({
          at: r.at,
          kind: r.kind,
          actorUserId: r.actor_user_id,
          actorLabel: r.actor_label,
          detail: r.detail,
        }))
        .reverse(),
    };
  }

  /** Nhật ký liên hệ khách của hồ sơ (nhắc/kết quả; chỉ mã, mới nhất trước). */
  @Get('cases/:id/contacts')
  async contacts(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.read<{
      id: string;
      kind: string;
      outcome: string;
      actor_user_id: string;
      at: Date;
    }>(a, 'vb_list_contacts', id);
    const visible = await this.repo.rows(a.tenantId, 'vb_list_cases', [
      a.tenantId,
      a.userId,
      id,
      1,
    ]);
    if (visible.length === 0) throw caseNotFound();
    return {
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        outcome: r.outcome,
        actorUserId: r.actor_user_id,
        at: r.at,
      })),
    };
  }

  /** Đề nghị sửa lỗi N-11 của hồ sơ (mới nhất trước) kèm trạng thái áp dụng. */
  @Get('cases/:id/n11-corrections')
  async n11(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    await this.requireCase(a, id);
    const rows = await this.read<{
      id: string;
      reason: string;
      requested_by: string;
      requested_at: Date;
      before_document_id: string | null;
      status: string;
      correction_document_id: string | null;
      signatory_user_id: string | null;
      applied_at: Date | null;
    }>(a, 'vb_list_n11', id);
    return {
      items: rows.map((r) => ({
        id: r.id,
        reason: r.reason,
        requestedBy: r.requested_by,
        requestedAt: r.requested_at,
        beforeDocumentId: r.before_document_id,
        status: r.status,
        applied: r.status === 'APPLIED',
        correctionDocumentId: r.correction_document_id,
        signatoryUserId: r.signatory_user_id,
        appliedAt: r.applied_at,
      })),
    };
  }

  /** Tài liệu đã đính kèm (mới nhất trước) + mốc xác nhận chữ ký/đóng dấu. Không trả khoá đối tượng. */
  @Get('cases/:id/documents')
  async documents(@CurrentActor() a: AuthenticatedActor, @Param('id', ParseUUIDPipe) id: string) {
    const [e] = await this.read<{
      signed_by: string | null;
      signed_at: Date | null;
      stamped_by: string | null;
      stamped_at: Date | null;
      final_scan_document_id: string | null;
      final_scan_sha256: string | null;
      locked_at: Date | null;
    }>(a, 'vb_case_evidence', id);
    if (!e) throw caseNotFound();
    const rows = await this.read<{
      id: string;
      kind: string;
      version: number;
      source: string;
      sha256: string;
      mime: string;
      size_bytes: string;
      created_by: string;
      created_at: Date;
    }>(a, 'vb_list_documents', id);
    return {
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        version: r.version,
        source: r.source,
        sha256: r.sha256,
        mime: r.mime,
        sizeBytes: Number(r.size_bytes),
        createdBy: r.created_by,
        createdAt: r.created_at,
      })),
      signature: { confirmedBy: e.signed_by, confirmedAt: e.signed_at },
      stamp: { confirmedBy: e.stamped_by, confirmedAt: e.stamped_at },
      finalScan: {
        documentId: e.final_scan_document_id,
        sha256: e.final_scan_sha256,
        lockedAt: e.locked_at,
      },
    };
  }

  /** Tải tệp của một tài liệu: DB kiểm quyền và audit, máy chủ đọc tệp từ kho. 503 khi chưa cấu hình kho. */
  @Get('cases/:id/documents/:docId/file')
  async file(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @Res({ passthrough: true }) res: { set(headers: Record<string, string>): unknown },
  ) {
    if (!this.store)
      throw new HttpException(
        { code: 'FILE_STORE_NOT_CONFIGURED', label: null },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const [d] = await this.read<{ object_key: string; mime: string; kind: string }>(
      a,
      'vb_document_file',
      id,
      [docId],
    );
    if (!d) throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', label: null });
    const bytes = d.object_key.startsWith(`t/${a.tenantId}/`)
      ? await this.store.get(d.object_key)
      : null;
    if (!bytes)
      throw new HttpException({ code: 'FILE_NOT_FOUND', label: null }, HttpStatus.NOT_FOUND);
    const ext = d.mime === 'application/pdf' ? 'pdf' : 'docx';
    res.set({
      'content-type': d.mime,
      'content-disposition': `attachment; filename="${d.kind.toLowerCase().replaceAll('_', '-')}.${ext}"`,
      'cache-control': 'private, no-store',
    });
    return new StreamableFile(bytes);
  }

  private async requireCase(a: AuthenticatedActor, id: string) {
    const rows = await this.repo.rows(a.tenantId, 'vb_case_progress', [a.tenantId, a.userId, id]);
    if (!rows[0]) throw caseNotFound();
  }
}
