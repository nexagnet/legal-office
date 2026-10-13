import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { AppModule } from './app.module';
import { resolverFromEnv } from './http/actor';
import { fileStoreFromEnv } from './storage/file-store';
import { DEFAULT_RATE_RULES, rateLimit, securityHeaders } from './http/hardening';

async function bootstrap(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const app = await NestFactory.create(
    AppModule.register({
      fileStore: fileStoreFromEnv(),
      pool: new pg.Pool({ connectionString: url }),
      resolver: process.env.AUTH_MODE === 'password' ? 'session' : resolverFromEnv(),
      auth: {
        sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES ?? 720),
        secureCookie: process.env.NODE_ENV === 'production',
        allowedOrigins: (process.env.WEB_ORIGIN ?? '')
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      },
    }),
  );
  const proxy = process.env.TRUST_PROXY;
  if (proxy) {
    // Số = số tầng proxy tin cậy; chuỗi khác (vd "loopback") chuyển nguyên cho Express.
    app
      .getHttpAdapter()
      .getInstance()
      .set('trust proxy', /^\d+$/.test(proxy) ? Number(proxy) : proxy);
  }
  app.use(securityHeaders(), rateLimit(DEFAULT_RATE_RULES));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3001));
}

void bootstrap();
