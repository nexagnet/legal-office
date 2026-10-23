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
import { AuthService, CHALLENGE_COOKIE, SESSION_COOKIE } from './auth.service';
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
const emailLoginBody = z
  .object({ tenantId: z.string().uuid(), email: z.string().min(3).max(254) })
  .strict();
const linkBody = z
  .object({ tenantId: z.string().uuid(), token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
const codeBody = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
const passwordBody = z
  .object({ email: z.string().min(3).max(254), password: z.string().max(MAX_PASSWORD_LENGTH) })
  .strict();

const LOCK_SECONDS = 15 * 60;
const CHALLENGE_COOKIE_SECONDS = 25 * 60;

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  private cookie(value: string, maxAgeSeconds: number): string {
    const secure = this.auth.config.secureCookie ? '; Secure' : '';
    return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
  }

  private challengeCookie(value: string, maxAgeSeconds: number): string {
    const secure = this.auth.config.secureCookie ? '; Secure' : '';
    return `${CHALLENGE_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
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
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Set-Cookie',
      this.cookie(result.cookieValue, this.auth.config.sessionTtlMinutes * 60),
    );
    return { code: 'ALLOWED', label: null };
  }

  /**
   * Admin đăng nhập bằng email, không cần mật khẩu: gửi link (xem `AuthService.loginByEmail`). Luôn trả cùng một
   * phản hồi và cùng loại cookie, bất kể email có hợp lệ hay không.
   */
  @Post('login/email')
  @HttpCode(HttpStatus.OK)
  async loginByEmail(@Body() raw: unknown, @Res({ passthrough: true }) res: HeaderSink) {
    const parsed = emailLoginBody.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Dữ liệu đăng nhập không hợp lệ');
    const { challengeCookie } = await this.auth.loginByEmail(
      parsed.data.tenantId,
      parsed.data.email,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Set-Cookie', this.challengeCookie(challengeCookie, CHALLENGE_COOKIE_SECONDS));
    return { code: 'VERIFICATION_REQUIRED', label: null };
  }

  /** Bấm link trong email: trả mã 6 số một lần (không cần phiên). */
  @Post('verify-link')
  @HttpCode(HttpStatus.OK)
  async verifyLink(@Body() raw: unknown, @Res({ passthrough: true }) res: HeaderSink) {
    const parsed = linkBody.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Link không hợp lệ');
    const result = await this.auth.redeemLink(parsed.data.tenantId, parsed.data.token);
    res.setHeader('Cache-Control', 'no-store');
    if (result.status !== 'ok') {
      throw new HttpException(
        { code: 'LINK_INVALID', label: null },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return {
      code: 'ALLOWED',
      label: null,
      verificationCode: result.code,
      validMinutes: result.validMinutes,
    };
  }

  /** Nhập mã 6 số ở trình duyệt đã yêu cầu link qua email; đúng thì mở phiên. */
  @Post('login/verify')
  @HttpCode(HttpStatus.OK)
  async verifyLogin(
    @Body() raw: unknown,
    @Req() req: HeaderSource,
    @Res({ passthrough: true }) res: HeaderSink,
  ) {
    const parsed = codeBody.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Mã xác thực không hợp lệ');
    const cookie = AuthService.parseCookieValue(readCookie(req.headers, CHALLENGE_COOKIE));
    res.setHeader('Cache-Control', 'no-store');
    if (!cookie) {
      throw new UnauthorizedException({ code: 'CHALLENGE_INVALID', label: null });
    }
    const result = await this.auth.verifyCode(cookie.tenantId, cookie.token, parsed.data.code);
    if (result.status === 'ok') {
      res.setHeader('Set-Cookie', [
        this.cookie(result.cookieValue, this.auth.config.sessionTtlMinutes * 60),
        this.challengeCookie('', 0),
      ]);
      return { code: 'ALLOWED', label: null };
    }
    const status =
      result.status === 'CODE_NOT_ISSUED' ? HttpStatus.CONFLICT : HttpStatus.UNAUTHORIZED;
    throw new HttpException({ code: result.status, label: null }, status);
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
