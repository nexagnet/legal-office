import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { SyntheticHeaderResolver } from '../http/actor';
import { rateLimit, securityHeaders } from '../http/hardening';

// Kiểm tra middleware thật khi gắn vào ứng dụng Nest (HTTP thật). Không cần dữ liệu trong DB.
const URL_ = process.env.DATABASE_URL;

describe.skipIf(!URL_)('HTTP hardening wired into the app', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let base = '';

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL_, max: 1 });
    app = await NestFactory.create(
      AppModule.register({ pool, resolver: new SyntheticHeaderResolver() }),
      { logger: false },
    );
    app.use(securityHeaders(), rateLimit([{ prefix: '', limit: 3, windowMs: 60_000 }]));
    await app.listen(0);
    base = (await app.getUrl()).replace('[::1]', 'localhost');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('sends security headers and limits request rate with a JSON 429', async () => {
    const first = await fetch(`${base}/vibang/cases`);
    expect(first.headers.get('x-content-type-options')).toBe('nosniff');
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(first.headers.get('x-powered-by')).toBeNull();
    await fetch(`${base}/vibang/cases`);
    await fetch(`${base}/vibang/cases`);
    const blocked = await fetch(`${base}/vibang/cases`);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).not.toBeNull();
    expect(await blocked.json()).toEqual({ code: 'RATE_LIMITED', label: null });
  });
});
