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
