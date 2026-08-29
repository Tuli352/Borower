import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BroadcastService } from '../broadcast/broadcast.service';
import { TrackingModule } from '../tracking/tracking.module';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';

@Module({
  imports: [PrismaModule, TrackingModule],
  controllers: [MessagesController, ChatController],
  providers: [MessagesService, BroadcastService, ChatService],
  exports: [MessagesService, ChatService],
})
export class MessagesModule {}
