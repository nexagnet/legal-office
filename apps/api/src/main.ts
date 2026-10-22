import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { AppModule } from './app.module';
import { resolverFromEnv } from './http/actor';
import { fileStoreFromEnv } from './storage/file-store';
import { startReminderSchedule } from './reminders/reminder-schedule';
import { DEFAULT_RATE_RULES, rateLimit, securityHeaders } from './http/hardening';

async function bootstrap(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const pool = new pg.Pool({ connectionString: url });
  const app = await NestFactory.create(
    AppModule.register({
      fileStore: fileStoreFromEnv(),
      pool,
      resolver: process.env.AUTH_MODE === 'password' ? 'session' : resolverFromEnv(),
      auth: {
        sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES ?? 720),
        secureCookie: process.env.NODE_ENV === 'production',
        allowedOrigins: (process.env.WEB_ORIGIN ?? '')
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
        publicWebUrl: process.env.PUBLIC_WEB_URL || undefined,
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
  if (process.env.REMINDERS_SCHEDULE === 'on') {
    const stop = startReminderSchedule(pool, process.env, console);
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  }
  await app.listen(Number(process.env.PORT ?? 3001));
}

void bootstrap();
