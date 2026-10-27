import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { statusFor } from '../vibang/status';
import { VibangRepo } from '../vibang/vibang.repo';
import { createSmtpMailer } from './mailer';
import { decryptSecret, encryptSecret, keyFromEnv } from './secret-box';
import { isInternalHost } from './smtp-host';
import { renderTestMail } from '../mail/test-mail';

const uuid = z.string().uuid();

interface SettingsRow {
  readonly configured: boolean;
  readonly host: string | null;
  readonly port: number | null;
  readonly secure: boolean | null;
  readonly username: string | null;
  readonly has_password: boolean | null;
  readonly mail_from: string | null;
  readonly updated_at: Date | null;
  readonly actor_email: string | null;
}

interface StoredRow {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly username: string | null;
  readonly password_enc: string | null;
  readonly mail_from: string;
}

const fail = (status: number, code: string): never => {
  throw new HttpException({ code, label: null }, status);
};

function parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }
  return result.data;
}

/**
 * Cấu hình SMTP cho email nhắc hạn. Chỉ Admin văn phòng. Mật khẩu được mã hoá ở đây (AES-256-GCM, khoá `MAIL_SETTINGS_KEY`)
 * trước khi xuống DB và không bao giờ có trong phản hồi.
 */
@Controller('office/mail-settings')
@UseGuards(ActorGuard)
export class MailSettingsController {
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

  private key() {
    return keyFromEnv(process.env.MAIL_SETTINGS_KEY);
  }

  private async load(actor: AuthenticatedActor, officeId: string): Promise<SettingsRow | null> {
    const rows = await this.repo.rows<SettingsRow>(actor.tenantId, 'of_search_mail_settings', [
      actor.tenantId,
      actor.userId,
      officeId,
    ]);
    return rows[0] ?? null;
  }

  @Get()
  async get(
    @CurrentActor() a: AuthenticatedActor,
    @Query('officeId', ParseUUIDPipe) officeId: string,
  ) {
    const row = await this.load(a, officeId);
    if (!row) return fail(HttpStatus.FORBIDDEN, 'ADMIN_ONLY');
    return {
      keyReady: this.key() !== null,
      configured: row.configured,
      host: row.host,
      port: row.port,
      secure: row.secure,
      username: row.username,
      hasPassword: row.has_password ?? false,
      mailFrom: row.mail_from,
      updatedAt: row.updated_at,
      testTo: row.actor_email,
    };
  }

  @Put()
  async save(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const b = parse(
      z
        .object({
          officeId: uuid,
          host: z.string().max(253),
          port: z.number().int().min(1).max(65535),
          secure: z.boolean(),
          username: z.string().max(254).nullish(),
          password: z.string().min(1).max(500).nullish(),
          clearPassword: z.boolean().optional(),
          mailFrom: z.string().max(300),
        })
        .strict(),
      body,
    );
    if (!(await this.load(a, b.officeId))) return fail(HttpStatus.FORBIDDEN, 'ADMIN_ONLY');
    if (isInternalHost(b.host))
      return fail(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_MAIL_SETTINGS');
    let passwordEnc: string | null = null;
    if (b.password) {
      const key = this.key();
      if (!key) return fail(HttpStatus.SERVICE_UNAVAILABLE, 'MAIL_KEY_MISSING');
      passwordEnc = encryptSecret(b.password, key, a.tenantId);
    }
    const op = await this.repo.call(a.tenantId, 'of_set_mail_settings', [
      a.tenantId,
      a.userId,
      b.officeId,
      b.host,
      b.port,
      b.secure,
      b.username ?? null,
      passwordEnc,
      !b.password && !b.clearPassword,
      b.mailFrom,
    ]);
    const status = statusFor(op);
    const reply = { code: op.code, label: op.label };
    if (status >= 400) throw new HttpException(reply, status);
    return reply;
  }

  /** Gửi một thư thử tới email đăng nhập của chính Admin để kiểm tra cấu hình đã lưu. Không trả chi tiết lỗi máy chủ SMTP. */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  async test(@CurrentActor() a: AuthenticatedActor, @Body() body: unknown) {
    const { officeId } = parse(z.object({ officeId: uuid }).strict(), body);
    const row = await this.load(a, officeId);
    if (!row) return fail(HttpStatus.FORBIDDEN, 'ADMIN_ONLY');
    if (!row.configured) return fail(HttpStatus.NOT_FOUND, 'MAIL_SETTINGS_NOT_FOUND');
    if (!row.actor_email) return fail(HttpStatus.CONFLICT, 'NO_LOGIN_EMAIL');
    const stored = (
      await this.repo.rows<StoredRow>(a.tenantId, 'of_mail_settings_get', [a.tenantId])
    )[0];
    if (!stored) return fail(HttpStatus.NOT_FOUND, 'MAIL_SETTINGS_NOT_FOUND');
    let password: string | null = null;
    if (stored.password_enc) {
      const key = this.key();
      if (!key) return fail(HttpStatus.SERVICE_UNAVAILABLE, 'MAIL_KEY_MISSING');
      try {
        password = decryptSecret(stored.password_enc, key, a.tenantId);
      } catch {
        return fail(HttpStatus.CONFLICT, 'MAIL_PASSWORD_UNREADABLE');
      }
    }
    try {
      await createSmtpMailer({ ...toConfig(stored), password }, stored.mail_from).send({
        to: row.actor_email,
        ...(await renderTestMail()),
      });
    } catch {
      return fail(HttpStatus.BAD_GATEWAY, 'MAIL_SEND_FAILED');
    }
    return { code: 'ALLOWED', label: row.actor_email };
  }
}

function toConfig(s: StoredRow) {
  return { host: s.host, port: s.port, secure: s.secure, username: s.username };
}
