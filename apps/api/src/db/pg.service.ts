import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type pg from 'pg';

export const PG_POOL = Symbol('PG_POOL');

/** Mọi truy vấn chạy trong một transaction có `app.tenant_id`; thiếu ngữ cảnh thì RLS không cho thấy dòng nào. */
@Injectable()
export class PgService implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async withTenant<T>(tenantId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
