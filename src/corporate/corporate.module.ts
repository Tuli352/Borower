import { Module } from '@nestjs/common';
import { CorporateController } from './corporate.controller';
import { CorporateService } from './corporate.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CorporateController],
  providers: [CorporateService],
  exports: [CorporateService],
})
export class CorporateModule {}
