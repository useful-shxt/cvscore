import nodemailer from "nodemailer";
import type { FastScoreResult } from "@shared/schema";

// In production: swap for SendGrid/Resend/SES transporter
// For now: uses SMTP env vars (works with Gmail App Password, Resend SMTP, etc.)
function getTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587");

  if (!user || !pass) {
    console.warn("[email] SMTP not configured — emails will be skipped");
    return null;
  }

  return nodemailer.createTransport({ host, port, secure: false, auth: { user, pass } });
}

const FROM = process.env.SMTP_FROM || "CVScore <hello@cvscore.app>";

function scoreColor(score: number) {
  if (score >= 75) return "#10B981";
  if (score >= 50) return "#F59E0B";
  return "#EF4444";
}

function scoreLabel(score: number) {
  if (score >= 75) return "Strong Match";
  if (score >= 50) return "Good Start";
  return "Needs Work";
}

// ─── Welcome + score summary email ────────────────────────────────────────────
export async function sendScoreEmail(
  to: string,
  name: string,
  result: FastScoreResult,
  sessionId: string,
  isNew: boolean
) {
  const transporter = getTransporter();
  if (!transporter) return;

  const color = scoreColor(result.overallScore);
  const label = scoreLabel(result.overallScore);
  const topCategories = result.categories
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const bottomCategories = result.categories
    .sort((a, b) => a.score - b.score)
    .slice(0, 2);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="margin-bottom:24px;">
      <span style="font-size:20px;font-weight:700;color:#F0F4FF;">CV</span><span style="font-size:20px;font-weight:700;color:#3B82F6;">Score</span>
    </div>

    <!-- Greeting -->
    <p style="color:#8895B3;font-size:15px;margin:0 0 24px;">
      ${isNew ? `Welcome, ${name} 👋` : `Hey ${name} — your latest results are in.`}
    </p>

    <!-- Score card -->
    <div style="background:#0F1629;border:1px solid #2A3558;border-radius:16px;padding:28px;margin-bottom:20px;text-align:center;">
      <div style="font-size:72px;font-weight:800;color:${color};line-height:1;">${result.overallScore}</div>
      <div style="font-size:13px;color:#8895B3;margin:4px 0 8px;">/ 100</div>
      <span style="display:inline-block;padding:4px 14px;border-radius:100px;font-size:12px;font-weight:600;background:${color}20;color:${color};border:1px solid ${color}40;">${label}</span>
      <p style="color:#8895B3;font-size:13px;line-height:1.6;margin:16px 0 0;">${result.summary}</p>
    </div>

    <!-- Top strengths -->
    <div style="background:#0F1629;border:1px solid #2A3558;border-radius:12px;padding:20px;margin-bottom:16px;">
      <p style="color:#10B981;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 12px;">Your Strengths</p>
      ${topCategories.map(c => `
        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="color:#F0F4FF;font-size:13px;">${c.name}</span>
            <span style="color:#10B981;font-size:13px;font-weight:600;">${c.score}</span>
          </div>
          <div style="background:#1A2340;border-radius:4px;height:6px;">
            <div style="background:#10B981;border-radius:4px;height:6px;width:${c.score}%;"></div>
          </div>
        </div>
      `).join("")}
    </div>

    <!-- Top actions -->
    <div style="background:#0F1629;border:1px solid #2A3558;border-radius:12px;padding:20px;margin-bottom:16px;">
      <p style="color:#F59E0B;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 12px;">Top Actions</p>
      ${result.topActions.map((a, i) => `
        <div style="display:flex;gap:10px;margin-bottom:8px;">
          <span style="color:#3B82F6;font-weight:700;font-size:13px;flex-shrink:0;">${i + 1}.</span>
          <span style="color:#8895B3;font-size:13px;line-height:1.5;">${a}</span>
        </div>
      `).join("")}
    </div>

    <!-- Missing keywords callout -->
    <div style="background:#EF444410;border:1px solid #EF444430;border-radius:12px;padding:16px;margin-bottom:24px;">
      <p style="color:#EF4444;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 8px;">Missing Keywords</p>
      <p style="color:#8895B3;font-size:13px;margin:0;">${result.keywords.missing.slice(0, 6).join(", ")}${result.keywords.missing.length > 6 ? ` +${result.keywords.missing.length - 6} more` : ""}</p>
    </div>

    <!-- Free access banner -->
    <div style="background:linear-gradient(135deg,#3B82F615,#8B5CF615);border:1px solid #3B82F630;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
      <p style="color:#F0F4FF;font-size:14px;font-weight:600;margin:0 0 6px;">🚀 Free Early Access — until 29 July 2026</p>
      <p style="color:#8895B3;font-size:13px;margin:0;">CV Rewrite and Cover Letters are free right now. Go back and generate yours before the launch window closes.</p>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:32px;">
      <a href="${process.env.APP_URL || "https://cvscore.app"}/" style="display:inline-block;background:#3B82F6;color:#fff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;">View Full Results &amp; Rewrite</a>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #1A2340;padding-top:20px;text-align:center;">
      <p style="color:#8895B3;font-size:11px;margin:0;">You're receiving this because you used CVScore. <a href="#" style="color:#3B82F6;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: `Your CV scored ${result.overallScore}/100 — ${label}`,
      html,
    });
    console.log(`[email] Score email sent to ${to}`);
  } catch (err) {
    console.error(`[email] Failed to send score email:`, err);
  }
}

// ─── Re-engagement: rewrite ready ─────────────────────────────────────────────
export async function sendRewriteReadyEmail(to: string, name: string, jobTitle?: string) {
  const transporter = getTransporter();
  if (!transporter) return;

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#080D1A;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="margin-bottom:24px;">
      <span style="font-size:20px;font-weight:700;color:#F0F4FF;">CV</span><span style="font-size:20px;font-weight:700;color:#3B82F6;">Score</span>
    </div>
    <div style="background:#0F1629;border:1px solid #2A3558;border-radius:16px;padding:28px;margin-bottom:20px;">
      <p style="color:#F0F4FF;font-size:18px;font-weight:600;margin:0 0 10px;">Your optimised CV is ready, ${name}</p>
      <p style="color:#8895B3;font-size:14px;line-height:1.6;margin:0 0 20px;">
        We've rewritten your CV to be ATS-optimised${jobTitle ? ` for the ${jobTitle} role` : ""}. Head back to copy it, download it, or generate your cover letters.
      </p>
      <a href="${process.env.APP_URL || "https://cvscore.app"}/" style="display:inline-block;background:#3B82F6;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">View Rewritten CV</a>
    </div>
    <div style="background:#8B5CF610;border:1px solid #8B5CF630;border-radius:12px;padding:16px;margin-bottom:24px;">
      <p style="color:#A78BFA;font-size:13px;font-weight:600;margin:0 0 6px;">While you're here — generate cover letters too</p>
      <p style="color:#8895B3;font-size:13px;margin:0;">3 tones, perfectly tailored to the role. Free during early access.</p>
    </div>
    <p style="color:#8895B3;font-size:11px;text-align:center;margin:0;">You're receiving this because you used CVScore. <a href="#" style="color:#3B82F6;">Unsubscribe</a></p>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: `Your optimised CV is ready — copy it now`,
      html,
    });
    console.log(`[email] Rewrite ready email sent to ${to}`);
  } catch (err) {
    console.error(`[email] Failed to send rewrite email:`, err);
  }
}

// ─── Re-engagement: weekly nudge (for cron) ───────────────────────────────────
export async function sendWeeklyNudge(to: string, name: string, lastScore: number) {
  const transporter = getTransporter();
  if (!transporter) return;

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#080D1A;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="margin-bottom:24px;">
      <span style="font-size:20px;font-weight:700;color:#F0F4FF;">CV</span><span style="font-size:20px;font-weight:700;color:#3B82F6;">Score</span>
    </div>
    <p style="color:#F0F4FF;font-size:16px;font-weight:600;margin:0 0 8px;">Hey ${name} — updated your CV this week?</p>
    <p style="color:#8895B3;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Your last score was <strong style="color:#F0F4FF;">${lastScore}/100</strong>. The job market moves fast — a few tweaks to your keywords can make a big difference. Run a new score now, it's free.
    </p>
    <a href="${process.env.APP_URL || "https://cvscore.app"}/" style="display:inline-block;background:#3B82F6;color:#fff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;">Re-score My CV</a>
    <p style="color:#8895B3;font-size:11px;margin:24px 0 0;text-align:center;"><a href="#" style="color:#3B82F6;">Unsubscribe</a></p>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: `Time to beat ${lastScore}/100 — re-score your CV`,
      html,
    });
  } catch (err) {
    console.error(`[email] Failed to send nudge:`, err);
  }
}
