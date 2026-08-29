import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BroadcastService } from '../broadcast/broadcast.service';

async function testBroadcast() {
  console.log('--- BROADCAST TEST START ---');
  const app = await NestFactory.createApplicationContext(AppModule);
  const broadcastService = app.get(BroadcastService);

  const adminEmail = process.env.SMTP_USER || 'redacted@example.com';
  console.log(`Sending test broadcast to: ${adminEmail}`);

  try {
    const result = await broadcastService.sendBroadcast(
      adminEmail,
      'Final Test: Broadcast Logic Fix',
      'This email verifies that the BCC logic and HTML template are working correctly from within the NestJS app context.'
    );

    console.log('Result:', result);
    if (result.success) {
      console.log('--- BROADCAST TEST SUCCESS ---');
    } else {
      console.log('--- BROADCAST TEST FAILED ---');
    }
  } catch (error) {
    console.error('--- BROADCAST TEST CRASHED ---');
    console.error(error);
  } finally {
    await app.close();
  }
}

testBroadcast();
