import { Controller, Get, Post, Param, Body, Req, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('messages')
  @ApiOperation({ summary: 'Send a message in the order chat' })
  async sendMessage(
    @Req() req: any,
    @Body() data: { orderId: string; text: string }
  ) {
    return this.chatService.saveMessage({
      orderId: data.orderId,
      senderId: req.user.id,
      senderRole: req.user.role.toUpperCase(),
      text: data.text,
    });
  }

  @Get('messages/:orderId')
  @ApiOperation({ summary: 'Get all messages for an order' })
  async getMessages(@Param('orderId') orderId: string) {
    return this.chatService.getMessagesForOrder(orderId);
  }
}
