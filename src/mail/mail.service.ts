import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as path from 'path';
import * as fs from 'fs';

/**
 * OTP emails use the same SMTP/Ethereal setup as broadcasts.
 * Dev testing: leave SMTP_* unset — Ethereal creates a fake inbox and logs a preview URL.
 * Optional: OTP_DEV_EMAIL — always receive a copy (useful with real SMTP too).
 */
@Injectable()
export class MailService implements OnModuleInit {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  async onModuleInit() {
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        tls: {
          // Do not fail on invalid certs
          rejectUnauthorized: false
        },
      });
      this.logger.log(`OTP mailer: SMTP configured (${process.env.SMTP_USER})`);
    } else {
      this.logger.warn('OTP mailer: no SMTP credentials — using Ethereal test inbox (preview URL in logs).');
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
      this.logger.log('OTP mailer: Ethereal test account ready.');
    }
  }

  private getLogoAttachment() {
    return {
      filename: 'kogi-logo.jpg',
      path: path.resolve(process.cwd(), 'src/assets/kogi-logo.jpg'),
      cid: 'kogi_logo'
    };
  }

  private generateHtmlTemplate(title: string, bodyContent: string, footerText: string = '', hasLogo: boolean = true) {
    return `
      <div style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
        <div style="background-color: #0A1128; padding: 32px 24px; text-align: center; border-bottom: 4px solid #FEBE10;">
          ${hasLogo 
            ? `<img src="cid:kogi_logo" alt="Kogi Ride" style="max-height: 80px; width: auto; border-radius: 12px; margin: 0 auto; display: block; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2);">`
            : `<h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 900; letter-spacing: 2px; font-family: sans-serif;">KOGI <span style="color: #FEBE10;">RIDE</span></h1>`
          }
        </div>
        <div style="padding: 40px 32px; background-color: #ffffff;">
          <h2 style="color: #0A1128; margin-top: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px;">${title}</h2>
          <div style="color: #4b5563; font-size: 16px; line-height: 1.7; font-weight: 500;">
            ${bodyContent}
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="margin: 0; font-size: 13px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">
            ${footerText ? footerText : '© ' + new Date().getFullYear() + ' Kogi Ride. All rights reserved.'}
          </p>
          <p style="margin: 8px 0 0 0; font-size: 11px; color: #94a3b8; font-weight: 500;">
            This is an automated system message. Please do not reply directly to this email.
          </p>
        </div>
      </div>
    `;
  }

  /** Sends the same 6-digit OTP sent via SMS for dual-channel verification. */
  async sendOtpEmail(to: string, otp: string, phoneHint: string): Promise<{ previewUrl?: string }> {
    const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@kogiride.com';
    const subject = 'Your Kogi Ride Verification Code';
    const text = `Your verification code is ${otp}. It is valid for 10 minutes.\nPhone: ${phoneHint}\n\nIf you did not request this, ignore this email.`;

    const htmlBody = `
      <p style="margin-bottom: 16px;">Hello,</p>
      <p style="margin-bottom: 24px;">Thank you for choosing Kogi Ride. Please use the following verification code to proceed securely. This code is valid for <strong>10 minutes</strong>.</p>
      <div style="background-color: #f1f5f9; border-left: 4px solid #DC2626; border-radius: 4px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 32px; font-weight: 900; letter-spacing: 4px; color: #0A1128;">${otp}</span>
      </div>
      <p style="margin-bottom: 8px;"><strong>Associated Phone:</strong> ${phoneHint}</p>
      <p style="color: #ef4444; font-size: 14px;">If you did not request this code, please ignore this email to keep your account secure.</p>
    `;

    const logoExists = false;
    const attachments: any[] = [];

    const info = await this.transporter.sendMail({
      from: `"Kogi Ride Support" <${fromAddr}>`,
      to,
      subject,
      text,
      html: this.generateHtmlTemplate('Action Required: Verify Account', htmlBody, '', logoExists),
      attachments
    });

    let previewUrl: string | undefined;
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
      if (previewUrl) {
        this.logger.log(`[OTP EMAIL] Preview (Ethereal): ${previewUrl}`);
      }
    }
    this.logger.log(`OTP email sent to ${to}, messageId=${info.messageId}`);
    return { previewUrl };
  }

  /** Sends a generic broadcast or notification email matching Kogi Ride's brand. */
  async sendGenericEmail(to: string, subject: string, headerTitle: string, messageContent: string): Promise<{ previewUrl?: string }> {
    const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@kogiride.com';
    
    // Convert newlines in messageContent to <br> for HTML or keep as is if already HTML.
    // Simple naive check to see if we should wrap in paragraphs:
    const htmlBody = messageContent.includes('<p>') ? messageContent : `<p style="margin-bottom: 16px;">${messageContent.replace(/\\n/g, '<br>')}</p>`;

    const logoExists = false;
    const attachments: any[] = [];

    const info = await this.transporter.sendMail({
      from: `"Kogi Ride Notifications" <${fromAddr}>`,
      to,
      subject,
      text: messageContent,
      html: this.generateHtmlTemplate(headerTitle, htmlBody, '', logoExists),
      attachments
    });

    let previewUrl: string | undefined;
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
      if (previewUrl) {
        this.logger.log(`[GENERIC EMAIL] Preview (Ethereal): ${previewUrl}`);
      }
    }
    this.logger.log(`Generic email sent to ${to}, messageId=${info.messageId}`);
    return { previewUrl };
  }
}
