import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BroadcastService implements OnModuleInit {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(BroadcastService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    if (process.env.SMTP_USER) {
      // Real SMTP configured (e.g. Gmail App Passwords)
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        tls: {
          minVersion: 'TLSv1.2',
          rejectUnauthorized: false,
          ciphers: 'HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA'
        }
      });
      this.logger.log(`SMTP live-transmission initialized for ${process.env.SMTP_USER}`);
    } else {
      // Fallback to Live Ethereal tests so dev preview links work natively
      this.logger.warn('No SMTP credentials in .env. Automatically generating a temporary Ethereal test inbox...');
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      this.logger.log(`Ethereal Test Mailer ready! Preview links will output to the console.`);
    }
  }

  async sendBroadcast(target: string, subject: string, message: string, skipMessageStorage: boolean = false) {
    let emails: string[] = [];
    const t = target ? target.toUpperCase() : '';
    
    if (t === 'ALL_RIDERS' || t === 'DRIVERS' || t === 'RIDERS') {
      const users = await this.prisma.rider.findMany({ select: { email: true } });
      emails = users.map((u: any) => u.email).filter(Boolean);
    } else if (t === 'ALL_CUSTOMERS' || t === 'CUSTOMERS') {
      const users = await this.prisma.customer.findMany({ select: { email: true } });
      emails = users.map((u: any) => u.email).filter(Boolean);
    } else if (t === 'ALL_VENDORS' || t === 'VENDORS') {
      const users = await this.prisma.vendor.findMany({ select: { email: true } });
      emails = users.map((u: any) => u.email).filter(Boolean);
    } else if (t === 'ALL_USERS' || t === 'ALL') {
      const [riders, customers, vendors] = await Promise.all([
        this.prisma.rider.findMany({ select: { email: true } }),
        this.prisma.customer.findMany({ select: { email: true } }),
        this.prisma.vendor.findMany({ select: { email: true } }),
      ]);
      emails = [...riders, ...customers, ...vendors].map((u: any) => u.email).filter(Boolean);
    } else if (target && target.includes('@')) {
      emails = [target];
    }

    if (emails.length === 0) {
      return { success: false, message: `No valid recipients found for target: ${target}.` };
    }

    // Deduplicate
    emails = [...new Set(emails)];

    // Send emails
    try {
      const logoPath = path.resolve(process.cwd(), 'src/assets/kogi-logo.jpg');
      const logoExists = fs.existsSync(logoPath);
      const htmlContent = this.wrapInTemplate(subject, message, logoExists);
      const attachments = logoExists 
        ? [{
            filename: 'kogi-logo.jpg',
            path: logoPath,
            cid: 'kogi_logo'
          }] 
        : [];
      
      const info = await this.transporter.sendMail({
        from: `"Kogi Ride Notifications" <${process.env.SMTP_USER || 'admin@kogiride.com'}>`,
        to: process.env.SMTP_USER || 'admin@kogiride.com', // Primary recipient is the sender
        bcc: emails, // All other recipients in BCC for privacy and deliverability
        subject: subject,
        text: message,
        html: htmlContent,
        attachments
      });
      
      this.logger.log(`Broadcast sent successfully to ${emails.length} recipients. MessageId: ${info.messageId}`);
      
      if (!process.env.SMTP_USER) {
        // Provide clickable link to view the fake email visually
        const previewUrl = nodemailer.getTestMessageUrl(info);
        this.logger.log(`[TEST INBOX] View your rendered broadcast email here: ${previewUrl}`);
      }
    } catch (e) {
      this.logger.error('Email broadcast transporter failed:', e);
      if (e.response) {
        this.logger.error(`SMTP Response: ${e.response}`);
      }
      return { success: false, message: `SMTP Failure: ${e.message}` };
    }
    
    // Save durable record to messages table natively (unless skipped)
    if (!skipMessageStorage) {
      await this.prisma.message.create({
        data: {
          sender: 'Admin',
          recipient: target,
          subject: subject,
          content: message,
          status: 'SENT',
          type: 'EMAIL',
        }
      });
    }

    // Also save to notifications feed for quick alerts
    await this.prisma.notification.create({
      data: {
        title: subject,
        message: message,
        type: 'alert',
        read: false,
      }
    });

    return { success: true, count: emails.length };
  }

  private wrapInTemplate(subject: string, message: string, hasLogo: boolean = true): string {
    const formattedMessage = message.replace(/\n/g, '<br/>');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #0A1128; }
            .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
            .header { background-color: #0A1128; padding: 32px 24px; text-align: center; border-bottom: 4px solid #FEBE10; }
            .logo { max-height: 80px; width: auto; border-radius: 12px; margin: 0 auto; display: block; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2); }
            .content { padding: 48px 40px; line-height: 1.8; font-size: 16px; color: #4b5563; font-weight: 500; }
            .content h2 { margin-top: 0; color: #0A1128; font-size: 24px; margin-bottom: 24px; font-weight: 900; letter-spacing: -0.5px; }
            .footer { background-color: #f8fafc; padding: 32px 40px; text-align: center; font-size: 13px; color: #64748b; border-top: 1px solid #e5e7eb; }
            .divider { height: 1px; background-color: #e5e7eb; margin: 40px 0; }
            .cta { display: inline-block; background-color: #DC2626; color: #ffffff !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; margin-top: 24px; }
            @media only screen and (max-width: 600px) {
              .container { margin: 0; border-radius: 0; }
              .content { padding: 32px 20px; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              ${hasLogo 
                ? `<img src="cid:kogi_logo" alt="Kogi Ride" class="logo" />`
                : `<h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 900; letter-spacing: 2px; font-family: sans-serif;">KOGI <span style="color: #FEBE10;">RIDE</span></h1>`
              }
            </div>
            <div class="content">
              <h2>${subject}</h2>
              <div>${formattedMessage}</div>
              <div class="divider"></div>
              <p style="margin-bottom: 0;">Warm regards,<br/><strong>The Kogi Ride Team</strong></p>
            </div>
            <div class="footer">
              <p style="font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">This message was sent from the Kogi Ride System.</p>
              <p style="margin-top: 8px;">© ${new Date().getFullYear()} Kogi Ride Technologies. All rights reserved.</p>
              <div style="margin-top: 16px;">
                <a href="#" style="color: #0A1128; text-decoration: none; font-weight: 600; margin: 0 10px;">Privacy Policy</a> | 
                <a href="#" style="color: #0A1128; text-decoration: none; font-weight: 600; margin: 0 10px;">Support</a>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}
