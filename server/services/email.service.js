const { Resend } = require('resend');
const logger = require('../utils/logger');

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function getRetryDelay(headers, attempt) {
  const retryAfter = headers?.['retry-after'];
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const delay = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(delay) && delay > 0) return Math.min(delay, 15000);
  }
  return Math.min(1000 * (2 ** attempt), 8000);
}

async function sendPasswordResetEmail({ to, resetUrl, idempotencyKey }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM;
  if (!apiKey || !from) {
    throw new Error('Password reset email service is not fully configured');
  }

  const safeResetUrl = String(resetUrl)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const text = [
    'We received a request to reset your RedVeg admin password.',
    '',
    `Reset your password using this link: ${resetUrl}`,
    '',
    'This link expires in 30 minutes. If you did not request this change, you can ignore this email.'
  ].join('\n');
  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;background:#f7f4f0;color:#241916;font-family:Arial,Helvetica,sans-serif">
    <main style="max-width:560px;margin:32px auto;padding:32px 24px;background:#fff;border:1px solid #eee5df;border-radius:16px">
      <p style="margin:0 0 12px;color:#b4212b;font-size:12px;font-weight:700;letter-spacing:2px">REDVEG CONTROL ROOM</p>
      <h1 style="margin:0 0 16px;font-size:26px">Reset your password</h1>
      <p style="margin:0 0 24px;line-height:1.6">We received a request to reset your RedVeg admin password. Use the button below to choose a new password.</p>
      <p style="margin:0 0 24px"><a href="${safeResetUrl}" style="display:inline-block;padding:14px 22px;border-radius:8px;background:#b4212b;color:#fff;font-weight:700;text-decoration:none">Reset password</a></p>
      <p style="margin:0 0 12px;color:#645b57;font-size:14px;line-height:1.6">This link expires in 30 minutes and can only be used once.</p>
      <p style="margin:0;color:#645b57;font-size:14px;line-height:1.6">If you did not request this change, you can ignore this email.</p>
    </main>
  </body>
</html>`;

  const resend = new Resend(apiKey);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error, headers } = await resend.emails.send({
      from,
      to: [to],
      subject: 'Reset your RedVeg admin password',
      html,
      text
    }, {
      idempotencyKey,
      signal: AbortSignal.timeout(10000)
    });

    if (!error) {
      logger.info(`Password reset email accepted by Resend (email id: ${data.id})`);
      return data;
    }

    const retryable = error.statusCode === null || error.statusCode === 429 || error.statusCode >= 500;
    if (!retryable || attempt === 2) {
      logger.error(`Password reset email rejected by Resend (${error.statusCode ?? 'network'}): ${error.message}`);
      throw new Error('Password reset email provider request failed');
    }

    await sleep(getRetryDelay(headers, attempt));
  }
}

async function sendEmployeePasswordRequestEmail({ to, employeeName, employeeEmail, employeeUsername, requestedAt, idempotencyKey }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM;
  if (!apiKey || !from) throw new Error('Password reset email service is not fully configured');
  const safe = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const baseUrl = String(process.env.APP_PUBLIC_URL || 'https://redveg.in').replace(/\/+$/, '');
  const staffUrl = `${baseUrl}/admin/staff`;
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f7f4f0;color:#241916;font-family:Arial,Helvetica,sans-serif"><main style="max-width:560px;margin:32px auto;padding:32px 24px;background:#fff;border:1px solid #eee5df;border-radius:16px"><p style="margin:0 0 12px;color:#b4212b;font-size:12px;font-weight:700;letter-spacing:2px">REDVEG CONTROL ROOM</p><h1 style="margin:0 0 16px;font-size:24px">Employee password change requested</h1><p style="line-height:1.6">An employee asked the Owner to change their sign-in password. Review the account and set a new password in Employees &amp; access.</p><p><strong>Name:</strong> ${safe(employeeName)}<br><strong>Username:</strong> ${safe(employeeUsername)}<br><strong>Email:</strong> ${safe(employeeEmail)}<br><strong>Requested:</strong> ${safe(requestedAt)}</p><p><a href="${staffUrl}" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#b4212b;color:#fff;font-weight:700;text-decoration:none">Open employee accounts</a></p><p style="color:#645b57;font-size:13px">No password is included in this email. Verify the request with the employee before changing their password.</p></main></body></html>`;
  const text = `An employee requested a password change.\n\nName: ${employeeName}\nUsername: ${employeeUsername}\nEmail: ${employeeEmail}\nRequested: ${requestedAt}\n\nReview and set a new password: ${staffUrl}\n\nNo password is included in this email.`;
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject: 'RedVeg employee password change request',
    html,
    text
  }, { idempotencyKey, signal: AbortSignal.timeout(10000) });
  if (error) {
    logger.error(`Employee password request email rejected by Resend (${error.statusCode ?? 'network'}): ${error.message}`);
    throw new Error('Password request email provider request failed');
  }
  logger.info(`Employee password request email accepted by Resend (email id: ${data.id})`);
  return data;
}

module.exports = { sendPasswordResetEmail, sendEmployeePasswordRequestEmail };
