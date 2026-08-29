import { SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import { AppType } from '../dto/auth-context.dto';
import { AppContextGuard } from '../app-context.guard';
import { AuthGuard } from '@nestjs/passport';

export const AppContext = (...appTypes: AppType[]) => {
  return applyDecorators(
    SetMetadata('appTypes', appTypes),
    UseGuards(AuthGuard('jwt'), AppContextGuard),
  );
};
