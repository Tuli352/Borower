import { Module } from '@nestjs/common';
import { AiMonitoringController } from './ai-monitoring.controller';
import { AiMonitoringService } from './ai-monitoring.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AiMonitoringController],
  providers: [AiMonitoringService],
  exports: [AiMonitoringService],
})
export class AiMonitoringModule {}
