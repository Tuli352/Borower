import { Module } from '@nestjs/common';
import { RidePreferencesController } from './ride-preferences.controller';
import { RidePreferencesService } from './ride-preferences.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RidePreferencesController],
  providers: [RidePreferencesService],
  exports: [RidePreferencesService],
})
export class RidePreferencesModule {}
