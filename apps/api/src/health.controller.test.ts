import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns {"status":"ok"}', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });
});
