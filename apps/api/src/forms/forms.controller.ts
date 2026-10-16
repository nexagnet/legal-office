import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { statusFor } from '../vibang/status';
import { VibangRepo } from '../vibang/vibang.repo';
import { FORM_CODES, FormInputError, type FormCode, renderFormDocx } from './index';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const bodySchema = z
  .object({
    officeId: z.string().uuid(),
    input: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

/**
 * Sinh bản NHÁP DOCX của biểu mẫu N-xx từ dữ liệu người dùng gửi lên (không đọc hồ sơ, không lưu tệp).
 * Quyền do hàm DB `of_form_authorize` quyết định và audit. Mọi tệp mang dòng "BẢN NHÁP", chữ ký để trống.
 */
@Controller('office/forms')
@UseGuards(ActorGuard)
export class FormsController {
  constructor(@Inject(VibangRepo) private readonly repo: VibangRepo) {}

  @Post(':code/draft')
  @HttpCode(HttpStatus.OK)
  async draft(
    @CurrentActor() a: AuthenticatedActor,
    @Param('code') code: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: { set(headers: Record<string, string>): unknown },
  ): Promise<StreamableFile> {
    if (!(FORM_CODES as readonly string[]).includes(code)) {
      throw new HttpException({ code: 'FORM_NOT_SUPPORTED', label: null }, 404);
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      );
    }
    const op = await this.repo.call(a.tenantId, 'of_form_authorize', [
      a.tenantId,
      a.userId,
      parsed.data.officeId,
      code,
    ]);
    const status = statusFor(op);
    if (status >= 400) throw new HttpException({ code: op.code, label: op.label }, status);
    try {
      const bytes = await renderFormDocx(code as FormCode, parsed.data.input as never);
      res.set({
        'content-type': DOCX,
        'content-disposition': `attachment; filename="ban-nhap-${code.toLowerCase()}.docx"`,
        'cache-control': 'private, no-store',
      });
      return new StreamableFile(bytes);
    } catch (e) {
      if (e instanceof FormInputError) {
        throw new HttpException({ code: 'FORM_INPUT_INVALID', label: e.message }, 400);
      }
      throw e;
    }
  }
}
