import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import { z } from 'zod';
import type { AuthenticatedActor } from '../http/actor';
import { ActorGuard, CurrentActor } from '../http/actor.guard';
import { statusFor } from '../vibang/status';
import { AuthService, SESSION_COOKIE } from './auth.service';
import { hashPassword, MAX_PASSWORD_LENGTH, passwordPolicyError } from './password';
import { readCookie } from './session.resolver';

interface HeaderSink {
  setHeader(name: string, value: string | string[]): unknown;
}
interface HeaderSource {
  headers: IncomingHttpHeaders;
}

const loginBody = z
  .object({
    tenantId: z.string().uuid(),
    email: z.string().min(3).max(254),
    password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  })
  .strict();
const passwordBody = z
  .object({ email: z.string().min(3).max(254), password: z.string().max(MAX_PASSWORD_LENGTH) })
  .strict();

const LOCK_SECONDS = 15 * 60;

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  private cookie(value: string, maxAgeSeconds: number): string {
    const secure = this.auth.config.secureCookie ? '; Secure' : '';
    return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() raw: unknown, @Res({ passthrough: true }) res: HeaderSink) {
    const parsed = loginBody.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Dữ liệu đăng nhập không hợp lệ');
    const { tenantId, email, password } = parsed.data;
    const result = await this.auth.login(tenantId, email, password);
    if (result.status === 'locked') {
      res.setHeader('Retry-After', String(LOCK_SECONDS));
      throw new HttpException(
        { code: 'ACCOUNT_LOCKED', label: null },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (result.status === 'invalid') {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', label: null });
    }
    res.setHeader(
      'Set-Cookie',
      this.cookie(result.cookieValue, this.auth.config.sessionTtlMinutes * 60),
    );
    res.setHeader('Cache-Control', 'no-store');
    return { code: 'ALLOWED', label: null };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: HeaderSource, @Res({ passthrough: true }) res: HeaderSink) {
    const parsed = AuthService.parseCookieValue(readCookie(req.headers, SESSION_COOKIE));
    if (parsed) await this.auth.logout(parsed.tenantId, parsed.token);
    res.setHeader('Set-Cookie', this.cookie('', 0));
    return { code: 'ALLOWED', label: null };
  }

  /** Người dùng hiện tại và các vai ở từng văn phòng (để web chọn menu; quyền thật vẫn do DB kiểm). */
  @Get('me')
  @UseGuards(ActorGuard)
  async me(@CurrentActor() a: AuthenticatedActor, @Res({ passthrough: true }) res: HeaderSink) {
    res.setHeader('Cache-Control', 'no-store');
    return {
      userId: a.userId,
      tenantId: a.tenantId,
      memberships: await this.auth.memberships(a.tenantId, a.userId),
      branches: await this.auth.branches(a.tenantId, a.userId),
    };
  }

  /** Chỉ Admin: đặt hoặc đổi mật khẩu cho một người dùng; thu hồi các phiên cũ của họ. */
  @Put('users/:id/password')
  @UseGuards(ActorGuard)
  async setPassword(
    @CurrentActor() a: AuthenticatedActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() raw: unknown,
  ) {
    const parsed = passwordBody.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Dữ liệu không hợp lệ');
    const weak = passwordPolicyError(parsed.data.password);
    if (weak)
      throw new HttpException(
        { code: 'WEAK_PASSWORD', label: weak },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const op = await this.auth.setPassword(
      a.tenantId,
      a.userId,
      id,
      parsed.data.email,
      await hashPassword(parsed.data.password),
    );
    const reply = { code: op.code, label: op.label };
    const status = statusFor(op);
    if (status >= 400) throw new HttpException(reply, status);
    return reply;
  }
}
