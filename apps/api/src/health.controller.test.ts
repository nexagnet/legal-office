import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('GET /health returns {"status":"ok"}', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });

  it('is routed at /health with GET', () => {
    expect(Reflect.getMetadata('path', HealthController)).toBe('health');
  });
});
