import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Allows unauthenticated requests; if a valid Bearer token is present, attaches req.user. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return true;
    }
    return Promise.resolve(super.canActivate(context) as Promise<boolean>).catch(() => true);
  }

  handleRequest(err: unknown, user: any) {
    if (err || !user) return undefined;
    return user;
  }
}
