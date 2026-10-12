import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import type { ActorResolver, AuthenticatedActor } from './actor';

export const ACTOR_RESOLVER = Symbol('ACTOR_RESOLVER');
const KEY = 'legalOfficeActor';
type ActorRequest = { headers: IncomingHttpHeaders; [KEY]?: AuthenticatedActor };

@Injectable()
export class ActorGuard implements CanActivate {
  constructor(@Inject(ACTOR_RESOLVER) private readonly resolver: ActorResolver) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<ActorRequest>();
    const actor = this.resolver.resolve(req.headers);
    if (!actor) throw new UnauthorizedException();
    req[KEY] = actor;
    return true;
  }
}

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<ActorRequest>();
  const actor = req[KEY];
  if (!actor) throw new UnauthorizedException();
  return actor;
});
