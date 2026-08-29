import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppType } from './dto/auth-context.dto';

@Injectable()
export class AppContextGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredAppTypes = this.reflector.getAllAndOverride<AppType[]>('appTypes', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredAppTypes || requiredAppTypes.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    
    if (!user || !user.appType) {
      throw new ForbiddenException('Access denied: Invalid application context');
    }

    if (!requiredAppTypes.includes(user.appType)) {
      throw new ForbiddenException(
        `Access denied: This endpoint is restricted to ${requiredAppTypes.join('/')} app context. You are using ${user.appType}.`
      );
    }

    return true;
  }
}
