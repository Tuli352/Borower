import { Controller, Post, Body, Logger, Req } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly prisma: PrismaService) {}

  @ApiOperation({ summary: 'Handle inbound email webhooks (Mailgun/SendGrid)' })
  @ApiBody({ schema: { type: 'object', description: 'Webhook payload' } })
  @Post('inbound-email')
  async handleInboundEmail(@Body() body: any, @Req() req: any) {
    this.logger.log('Intercepted inbound email webhook payload globally');
    
    // Parse generic inbound SMTP structure (Mailgun/SendGrid compatible)
    const sender = body.sender || body.From || body.from || 'Unknown Inbound Sender';
    const subject = body.subject || body.Subject || 'Support Reply';
    const content = body['stripped-text'] || body.text || body.body || JSON.stringify(body).substring(0, 150);

    // Explicitly persist as an Unread Dashboard Bell Alert exclusively
    await this.prisma.notification.create({
      data: {
        title: `Reply from: ${sender}`,
        message: `Subject: ${subject}\n\n${content.substring(0, 200)}...`,
        type: 'alert',
        read: false,
      }
    });

    return { received: true, status: 'Inbound message synced to Notification bell natively.' };
  }
}
