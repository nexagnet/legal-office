import { BadRequestException, HttpException } from '@nestjs/common';
import { z } from 'zod';
import { statusFor } from '../vibang/status';
import type { Op } from '../vibang/vibang.repo';

export const uuid = z.string().uuid();
export const DOMAINS = ['vibang', 'tongdat', 'xacminh', 'tochuc', 'vtden', 'vtdi', 'vtnb'] as const;
export const domain = z.enum(DOMAINS);

export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }
  return result.data;
}

export interface Reply {
  readonly code: string;
  readonly label: string | null;
}

/** Từ chối trong DB là kết quả; ở HTTP chuyển thành mã trạng thái (403/404/422/409). */
export function respond(op: Op): Reply {
  const status = statusFor(op);
  const reply = { code: op.code, label: op.label };
  if (status >= 400) throw new HttpException(reply, status);
  return reply;
}
