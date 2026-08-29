import { Module } from '@nestjs/common';
import { TransportCompaniesService } from './transport-companies.service';
import { TransportCompaniesController } from './transport-companies.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [TransportCompaniesController],
  providers: [TransportCompaniesService],
  exports: [TransportCompaniesService],
})
export class TransportCompaniesModule {}
