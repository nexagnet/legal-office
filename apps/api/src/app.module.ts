import { type DynamicModule, Module } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL, PgService } from './db/pg.service';
import { AccessController } from './admin/access.controller';
import { MembersController } from './admin/members.controller';
import { PeopleController } from './people/people.controller';
import { ApprovalController } from './approval/approval.controller';
import { AuthController } from './auth/auth.controller';
import {
  AUTH_CONFIG,
  AuthService,
  TENANT_MAILER,
  type AuthConfig,
  type TenantMailerResolver,
} from './auth/auth.service';
import { resolveTenantMailer } from './reminders/resolve-mailer';
import { SessionResolver } from './auth/session.resolver';
import { AssetsController } from './assets/assets.controller';
import { DmsAmendmentsController } from './dms/dms-amendments.controller';
import { DmsCasesController } from './dms/dms-cases.controller';
import { DmsLegacyController } from './dms/dms-legacy.controller';
import { DmsBrowseController } from './dms/dms-browse.controller';
import { DmsSearchController } from './dms/dms-search.controller';
import { DmsPermissionsController } from './dms/dms-permissions.controller';
import { DmsThvController } from './dms/dms-thv.controller';
import { EnforcementCaseController } from './enforcement/enforcement-case.controller';
import { FormsController } from './forms/forms.controller';
import { HealthController } from './health.controller';
import { type ActorResolver } from './http/actor';
import { ACTOR_RESOLVER, ActorGuard } from './http/actor.guard';
import { ServiceOfDocumentsController } from './service-of-documents/service-of-documents.controller';
import { OfficeController } from './office/office.controller';
import { ThvCardsController } from './office/thv-cards.controller';
import { MailSettingsController } from './reminders/mail-settings.controller';
import { VerificationController } from './verification/verification.controller';
import { VibangIntakeController } from './vibang/vibang-intake.controller';
import { FILE_STORE, type FileStore } from './storage/file-store';
import { VibangController } from './vibang/vibang.controller';
import { VibangReadController } from './vibang/vibang-read.controller';
import { VibangFilesController } from './vibang/vibang-files.controller';
import { VibangRepo } from './vibang/vibang.repo';

export interface AppOptions {
  readonly pool: pg.Pool;
  /** `session` = đăng nhập email + mật khẩu (cookie phiên). */
  readonly resolver: ActorResolver | 'session';
  readonly auth?: AuthConfig;
  /** Kho tệp (R2/đĩa). Không đặt = các thao tác cần tệp trả 503. */
  readonly fileStore?: FileStore | null;
  /** Mailer theo tenant cho email xác thực Admin; không đặt = đọc cấu hình SMTP đã lưu (mặc định). */
  readonly tenantMailer?: TenantMailerResolver;
}

const DEFAULT_AUTH: AuthConfig = { sessionTtlMinutes: 720, secureCookie: true, allowedOrigins: [] };

@Module({})
export class AppModule {
  /** Phụ thuộc truyền vào rõ ràng (không đọc env ở đây) để test dựng được app với DB và người dùng giả lập. */
  static register(options: AppOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        AuthController,
        VibangController,
        VibangIntakeController,
        VibangFilesController,
        VibangReadController,
        ServiceOfDocumentsController,
        VerificationController,
        EnforcementCaseController,
        AssetsController,
        ApprovalController,
        AccessController,
        MembersController,
        PeopleController,
        OfficeController,
        ThvCardsController,
        MailSettingsController,
        FormsController,
        DmsAmendmentsController,
        DmsCasesController,
        DmsLegacyController,
        DmsBrowseController,
        DmsSearchController,
        DmsPermissionsController,
        DmsThvController,
      ],
      providers: [
        { provide: PG_POOL, useValue: options.pool },
        { provide: AUTH_CONFIG, useValue: options.auth ?? DEFAULT_AUTH },
        {
          provide: TENANT_MAILER,
          useValue:
            options.tenantMailer ??
            ((tenantId: string) => resolveTenantMailer(options.pool, tenantId, process.env)),
        },
        AuthService,
        options.resolver === 'session'
          ? {
              provide: ACTOR_RESOLVER,
              useFactory: (auth: AuthService) => new SessionResolver(auth),
              inject: [AuthService],
            }
          : { provide: ACTOR_RESOLVER, useValue: options.resolver },
        { provide: FILE_STORE, useValue: options.fileStore ?? null },
        PgService,
        VibangRepo,
        ActorGuard,
      ],
    };
  }
}
