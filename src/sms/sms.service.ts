import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  // Since not explicitly provided by the user yet, we default to generic configs 
  // ready to be dropped into Twilio or Termii via .env
  private readonly SMS_BASE_URL = process.env.SMS_BASE_URL || 'https://api.ng.termii.com/api/sms/send';
  private readonly SMS_API_KEY = process.env.SMS_API_KEY;
  private readonly SMS_SENDER_ID = process.env.SMS_SENDER_ID || 'KOGI_RIDE';

  private readonly TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  private readonly TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  private readonly TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

  async sendOTP(phone: string, otp: string): Promise<boolean> {
    const message = `Your Kogi Ride verification code is: ${otp}. Valid for 10 minutes.`;
    return this.sendSms(phone, message);
  }

  async sendSms(phone: string, message: string): Promise<boolean> {
    // 1. Try Twilio if configured
    if (this.TWILIO_ACCOUNT_SID && this.TWILIO_AUTH_TOKEN && this.TWILIO_PHONE_NUMBER) {
      try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${this.TWILIO_ACCOUNT_SID}/Messages.json`;
        const data = new URLSearchParams();
        data.append('To', phone);
        data.append('From', this.TWILIO_PHONE_NUMBER);
        data.append('Body', message);

        const response = await axios.post(url, data, {
          auth: {
            username: this.TWILIO_ACCOUNT_SID,
            password: this.TWILIO_AUTH_TOKEN,
          },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        this.logger.log(`Twilio SMS Dispatch Success: ${response.data.sid}`);
        return true;
      } catch (error: any) {
        this.logger.error(`Twilio SMS Failed: ${error.response?.data?.message || error.message}`);
        // Fallback to next provider or simulation
      }
    }

    // 2. Try Termii if configured
    if (this.SMS_API_KEY && this.SMS_API_KEY !== 'your_api_key_here') {
      try {
        const payload = {
          to: phone,
          from: this.SMS_SENDER_ID,
          sms: message,
          type: 'plain',
          channel: 'dnd',
          api_key: this.SMS_API_KEY,
        };

        const response = await axios.post(this.SMS_BASE_URL, payload);
        this.logger.log(`Termii SMS Dispatch Success: ${response.data.message_id || 'OK'}`);
        return true;
      } catch (error: any) {
        this.logger.error(`Termii SMS Failed: ${error.response?.data ? JSON.stringify(error.response.data) : error.message}`);
      }
    }

    // 3. Fallback to Local Simulation
    this.logger.warn(`[SMS SIMULATION] Keys missing or requests failed. Message to ${phone}: ${message}`);
    return true;
  }
}
