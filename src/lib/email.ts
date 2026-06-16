import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendOTPEmail(email: string, otp: string, name: string = 'Member') {
  await transporter.sendMail({
    from: `"Internal Dashboard @AWSSBG-at-SRMIST" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `Your OTP: ${otp} — AWSSBG Internal Dashboard`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px;background:#0f172a;">
  <div style="background:#1e293b;border-radius:12px;padding:36px;box-shadow:0 4px 24px rgba(0,0,0,0.4);border:1px solid #334155;">
    <div style="text-align:center;margin-bottom:28px;">
      <div style="background:#FF9900;display:inline-block;padding:10px 22px;border-radius:8px;">
        <span style="color:white;font-size:16px;font-weight:bold;">Internal Dashboard</span>
      </div>
      <p style="color:#64748b;font-size:12px;margin:8px 0 0;">@AWSSBG · SRM Institute of Science and Technology</p>
    </div>
    <h2 style="color:#e2e8f0;margin-bottom:6px;">Hello, ${name}!</h2>
    <p style="color:#94a3b8;margin-bottom:28px;">Your one-time password to sign in to the AWSSBG Internal Dashboard:</p>
    <div style="text-align:center;background:#0f172a;border-radius:12px;padding:28px;margin-bottom:28px;border:2px dashed #FF9900;">
      <span style="font-size:44px;font-weight:bold;letter-spacing:10px;color:#FF9900;">${otp}</span>
    </div>
    <p style="color:#64748b;font-size:13px;text-align:center;">Expires in <strong style="color:#94a3b8;">5 minutes</strong>. Do not share this with anyone.</p>
    <hr style="border:none;border-top:1px solid #334155;margin:20px 0;"/>
    <p style="color:#475569;font-size:11px;text-align:center;">AWS Student Builder Group &middot; SRMIST &middot; Internal use only</p>
  </div>
</body>
</html>`,
  });
}
