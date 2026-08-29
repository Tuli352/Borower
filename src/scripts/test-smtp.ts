import * as nodemailer from 'nodemailer';
import 'dotenv/config';

async function testSmtp() {
  console.log('--- SMTP TEST START ---');
  console.log(`User: ${process.env.SMTP_USER}`);
  console.log(`Host: ${process.env.SMTP_HOST}`);
  console.log(`Port: ${process.env.SMTP_PORT}`);

  const transporter = nodemailer.createTransport({
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
    },
    debug: true, // Enable debug
    logger: true // Enable logger
  });

  try {
    console.log('Verifying connection...');
    await transporter.verify();
    console.log('Connection verified successfully!');

    console.log('Sending test email...');
    const info = await transporter.sendMail({
      from: `"Kogi SMTP Test" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER, // Send to self
      subject: 'SMTP Connection Test',
      text: 'This is a test email from Kogi Rider backend.',
      html: '<b>This is a test email from Kogi Rider backend.</b>',
    });

    console.log('Email sent successfully!');
    console.log(`Message ID: ${info.messageId}`);
    console.log(`Response: ${info.response}`);
  } catch (error) {
    console.error('--- SMTP TEST FAILED ---');
    console.error(error);
  }
}

testSmtp();
