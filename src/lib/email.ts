import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// ─── Shared layout helpers ────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function priorityColor(priority: string) {
  if (priority === 'HIGH') return '#ef4444';
  if (priority === 'LOW')  return '#22c55e';
  return '#f59e0b';
}

function formatDeadline(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function truncate(text: string, max = 320) {
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

function shell(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:24px 12px;background:#050505;font-family:'Courier New',Courier,monospace;">
  <div style="max-width:560px;margin:0 auto;">

    <div style="height:4px;background:#FF9900;"></div>

    <div style="background:#0d0d0d;border:2px solid #2d2d2d;border-top:none;padding:32px 32px 28px;">

      <div style="padding-bottom:20px;margin-bottom:28px;border-bottom:1px solid #1e1e1e;">
        <span style="color:#FF9900;font-size:13px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;">
          AWSSBG Internal Dashboard
        </span><br>
        <span style="color:#aaa;font-size:11px;letter-spacing:1px;">
          @AWSSBG &middot; SRM Institute of Science and Technology
        </span>
      </div>

      ${body}

    </div>

    <div style="background:#0a0a0a;border:2px solid #1e1e1e;border-top:none;padding:10px 20px;text-align:center;">
      <span style="color:#888;font-size:10px;letter-spacing:2px;text-transform:uppercase;">
        AWS Student Builder Group &middot; SRMIST &middot; Strictly Internal
      </span>
    </div>

  </div>
</body>
</html>`;
}

function metaRow(label: string, value: string, valueColor = '#f0f0f0') {
  return `
  <tr>
    <td style="padding:6px 0;color:#aaa;font-size:11px;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;vertical-align:top;">
      ${label}
    </td>
    <td style="padding:6px 0 6px 20px;color:${valueColor};font-size:12px;font-weight:bold;vertical-align:top;">
      ${value}
    </td>
  </tr>`;
}

function ctaButton(href: string, label: string) {
  return `
  <div style="margin-top:28px;">
    <a href="${href}"
       style="display:inline-block;background:#FF9900;color:#000;text-decoration:none;
              font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;
              padding:12px 28px;border:2px solid #FF9900;">
      ${label} →
    </a>
  </div>`;
}

// ─── OTP Email ────────────────────────────────────────────────────────────────

export async function sendOTPEmail(email: string, otp: string, name = 'Member') {
  const body = `
    <p style="color:#aaa;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 20px;">
      Authentication Request
    </p>

    <p style="color:#f0f0f0;font-size:15px;font-weight:bold;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px;">
      Hello, ${escHtml(name)}.
    </p>
    <p style="color:#f0f0f0;font-size:13px;margin:0 0 28px;">
      Your one-time sign-in code for the AWSSBG Internal Dashboard:
    </p>

    <div style="background:#050505;border:2px solid #FF9900;padding:28px;text-align:center;margin-bottom:24px;">
      <span style="font-size:48px;font-weight:bold;letter-spacing:14px;color:#FF9900;">${escHtml(otp)}</span>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      ${metaRow('Expires in', '5 minutes', '#f59e0b')}
      ${metaRow('Sent to', escHtml(email))}
    </table>

    <p style="color:#aaa;font-size:11px;margin:0;border-top:1px solid #1e1e1e;padding-top:16px;">
      If you did not request this code, ignore this email.
      Do not share this OTP with anyone.
    </p>`;

  await transporter.sendMail({
    from: `"AWSSBG Internal Dashboard" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `[${otp}] Your sign-in OTP — AWSSBG Dashboard`,
    html: shell('Sign-In OTP', body),
  });
}

// ─── Task Assignment Email ────────────────────────────────────────────────────

export async function sendTaskAssignmentEmail(
  email: string,
  name: string,
  taskTitle: string,
  taskDescription: string,
  deadline: string,
  priority: string,
  assignedByName: string,
  taskUrl: string,
  scopeLabel: string,
) {
  const pColor = priorityColor(priority);

  const body = `
    <p style="color:#aaa;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 20px;">
      New Task Assigned
    </p>

    <p style="color:#f0f0f0;font-size:15px;font-weight:bold;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px;">
      Hello, ${escHtml(name)}.
    </p>
    <p style="color:#f0f0f0;font-size:13px;margin:0 0 24px;">
      A new task has been assigned to you on the AWSSBG Internal Dashboard.
    </p>

    <div style="background:#050505;border:2px solid #2d2d2d;border-left:4px solid #FF9900;padding:20px 20px 18px;margin-bottom:24px;">
      <p style="color:#f0f0f0;font-size:16px;font-weight:bold;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">
        ${escHtml(taskTitle)}
      </p>
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;">
        <span style="color:${pColor};font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;
                     background:${pColor}1a;border:1px solid ${pColor}40;padding:3px 10px;">
          ${escHtml(priority)}
        </span>
        <span style="color:#f0f0f0;font-size:11px;letter-spacing:1px;">
          DUE &nbsp;${formatDeadline(deadline)}
        </span>
      </div>
    </div>

    <p style="color:#aaa;font-size:10px;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">
      Description
    </p>
    <p style="color:#f0f0f0;font-size:13px;line-height:1.7;margin:0 0 24px;padding-left:12px;border-left:2px solid #2d2d2d;">
      ${escHtml(truncate(taskDescription))}
    </p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
      ${metaRow('Assigned by', escHtml(assignedByName))}
      ${metaRow('Scope', escHtml(scopeLabel))}
      ${metaRow('Deadline', formatDeadline(deadline), '#FF9900')}
    </table>

    ${ctaButton(taskUrl, 'View Task')}`;

  await transporter.sendMail({
    from: `"AWSSBG Internal Dashboard" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `[NEW TASK] ${taskTitle} — AWSSBG Dashboard`,
    html: shell('New Task Assigned', body),
  });
}

// ─── Delegate Review Email ────────────────────────────────────────────────────

export async function sendDelegateReviewEmail(
  email: string,
  name: string,
  taskTitle: string,
  delegatedByName: string,
  taskUrl: string,
) {
  const body = `
    <p style="color:#aaa;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 20px;">
      Review Delegation
    </p>

    <p style="color:#f0f0f0;font-size:15px;font-weight:bold;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px;">
      Hello, ${escHtml(name)}.
    </p>
    <p style="color:#f0f0f0;font-size:13px;margin:0 0 24px;">
      You have been assigned as a delegated reviewer for the following task on the AWSSBG Internal Dashboard.
    </p>

    <div style="background:#050505;border:2px solid #2d2d2d;border-left:4px solid #FF9900;padding:20px 20px 18px;margin-bottom:24px;">
      <p style="color:#f0f0f0;font-size:16px;font-weight:bold;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">
        ${escHtml(taskTitle)}
      </p>
      <span style="color:#FF9900;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">
        REVIEW DELEGATED TO YOU
      </span>
    </div>

    <p style="color:#f0f0f0;font-size:13px;margin:0 0 24px;">
      You can now review, approve, reject, or request revisions for all submissions on this task on behalf of
      <strong style="color:#FF9900;">${escHtml(delegatedByName)}</strong>.
    </p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
      ${metaRow('Delegated by', escHtml(delegatedByName))}
      ${metaRow('Task', escHtml(taskTitle))}
    </table>

    ${ctaButton(taskUrl, 'Open Task')}`;

  await transporter.sendMail({
    from: `"AWSSBG Internal Dashboard" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `[REVIEW DELEGATED] ${taskTitle} — AWSSBG Dashboard`,
    html: shell('Review Delegation', body),
  });
}

// ─── Task Reminder Email ──────────────────────────────────────────────────────

export async function sendTaskReminderEmail(
  email: string,
  name: string,
  taskTitle: string,
  deadline: string,
  taskUrl: string,
) {
  const body = `
    <p style="color:#aaa;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 20px;">
      Submission Reminder
    </p>

    <p style="color:#f0f0f0;font-size:15px;font-weight:bold;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px;">
      Hello, ${escHtml(name)}.
    </p>
    <p style="color:#f0f0f0;font-size:13px;margin:0 0 24px;">
      You haven't submitted your work yet for the following task:
    </p>

    <div style="background:#050505;border:2px solid #f59e0b;padding:20px 20px 18px;margin-bottom:24px;">
      <p style="color:#f0f0f0;font-size:16px;font-weight:bold;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">
        ${escHtml(taskTitle)}
      </p>
      <span style="color:#f59e0b;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">
        ⚠ DEADLINE &nbsp;${formatDeadline(deadline)}
      </span>
    </div>

    <p style="color:#f0f0f0;font-size:13px;margin:0 0 4px;">
      Complete your submission before the deadline to avoid missing out.
    </p>

    ${ctaButton(taskUrl, 'Submit Now')}`;

  await transporter.sendMail({
    from: `"AWSSBG Internal Dashboard" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `[REMINDER] "${taskTitle}" is due soon — AWSSBG Dashboard`,
    html: shell('Task Deadline Reminder', body),
  });
}
