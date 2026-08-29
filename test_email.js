const nodemailer = require('nodemailer');

async function test() {
  console.log('Testing SMTP connection...');
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, 
      auth: {
        user: 'redacted@example.com',
        pass: 'iaciwxdotqalgtue',
      },
      tls: {
        rejectUnauthorized: false
      },
    });

    const info = await transporter.sendMail({
      from: '"Test" <redacted@example.com>',
      to: 'redacted@example.com',
      subject: 'Test OTP',
      text: 'Trying to debug why SMTP is failing.',
    });
    
    console.log('Success:', info.messageId);
  } catch (err) {
    console.error('Failed:', err.message);
  }
}

test();
