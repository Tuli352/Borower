import { Module } from '@nestjs/common';
import { InterStateController } from './inter-state.controller';
import { InterStateService } from './inter-state.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InterStateController],
  providers: [InterStateService],
  exports: [InterStateService],
})
export class InterStateModule {}
