import { type DynamicModule, Module } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL, PgService } from './db/pg.service';
import { ApprovalController } from './approval/approval.controller';
import { AuthController } from './auth/auth.controller';
import { AUTH_CONFIG, AuthService, type AuthConfig } from './auth/auth.service';
import { SessionResolver } from './auth/session.resolver';
import { AssetsController } from './assets/assets.controller';
import { EnforcementCaseController } from './enforcement/enforcement-case.controller';
import { HealthController } from './health.controller';
import { type ActorResolver } from './http/actor';
import { ACTOR_RESOLVER, ActorGuard } from './http/actor.guard';
import { ServiceOfDocumentsController } from './service-of-documents/service-of-documents.controller';
import { OfficeController } from './office/office.controller';
import { VerificationController } from './verification/verification.controller';
import { VibangController } from './vibang/vibang.controller';
import { VibangRepo } from './vibang/vibang.repo';

export interface AppOptions {
  readonly pool: pg.Pool;
  /** `session` = đăng nhập email + mật khẩu (cookie phiên). */
  readonly resolver: ActorResolver | 'session';
  readonly auth?: AuthConfig;
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
        ServiceOfDocumentsController,
        VerificationController,
        EnforcementCaseController,
        AssetsController,
        ApprovalController,
        OfficeController,
      ],
      providers: [
        { provide: PG_POOL, useValue: options.pool },
        { provide: AUTH_CONFIG, useValue: options.auth ?? DEFAULT_AUTH },
        AuthService,
        options.resolver === 'session'
          ? {
              provide: ACTOR_RESOLVER,
              useFactory: (auth: AuthService) => new SessionResolver(auth),
              inject: [AuthService],
            }
          : { provide: ACTOR_RESOLVER, useValue: options.resolver },
        PgService,
        VibangRepo,
        ActorGuard,
      ],
    };
  }
}
