import { type DynamicModule, Module } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL, PgService } from './db/pg.service';
import { HealthController } from './health.controller';
import { type ActorResolver } from './http/actor';
import { ACTOR_RESOLVER, ActorGuard } from './http/actor.guard';
import { VibangController } from './vibang/vibang.controller';
import { VibangRepo } from './vibang/vibang.repo';

export interface AppOptions {
  readonly pool: pg.Pool;
  readonly resolver: ActorResolver;
}

@Module({})
export class AppModule {
  /** Phụ thuộc truyền vào rõ ràng (không đọc env ở đây) để test dựng được app với DB và người dùng giả lập. */
  static register(options: AppOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, VibangController],
      providers: [
        { provide: PG_POOL, useValue: options.pool },
        { provide: ACTOR_RESOLVER, useValue: options.resolver },
        PgService,
        VibangRepo,
        ActorGuard,
      ],
    };
  }
}
