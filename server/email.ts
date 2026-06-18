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

const FROM = process.env.SMTP_FROM || `CVScore <${process.env.SMTP_USER || "hello@cvscore.app"}>`;

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

// ─── Welcome email (new user) ────────────────────────────────────────────────
export async function sendWelcomeEmail(to: string, name: string) {
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
    <p style="color:#F0F4FF;font-size:22px;font-weight:700;margin:0 0 12px;">Welcome to CVScore, ${name} 👋</p>
    <p style="color:#8895B3;font-size:14px;line-height:1.7;margin:0 0 24px;">
      You've just unlocked free access to AI-powered CV scoring, company intel, LinkedIn analysis, and full CV rewrites — all free until <strong style="color:#F0F4FF;">29 July 2026</strong>.
    </p>
    <div style="background:#0F1629;border:1px solid #2A3558;border-radius:16px;padding:24px;margin-bottom:20px;">
      <p style="color:#A8B8D0;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 14px;">What you can do right now</p>
      ${[
        { icon: "📊", title: "Score your CV", desc: "ATS keyword match against any job description — instant results" },
        { icon: "🔍", title: "Company Intel", desc: "Auto-fetches company culture, news, and hiring signals from your JD" },
        { icon: "✍️", title: "CV Rewrite", desc: "Fully rewritten, ATS-optimised version tailored to the role" },
        { icon: "💼", title: "Cover Letters", desc: "3 tones — Direct, Warm, and Strategic — all ready to copy" },
        { icon: "🔗", title: "LinkedIn Analyser", desc: "Score your LinkedIn profile against the same JD" },
      ].map(f => `
        <div style="display:flex;gap:12px;margin-bottom:14px;align-items:flex-start;">
          <span style="font-size:18px;flex-shrink:0;">${f.icon}</span>
          <div>
            <p style="color:#F0F4FF;font-size:13px;font-weight:600;margin:0 0 2px;">${f.title}</p>
            <p style="color:#8895B3;font-size:12px;margin:0;">${f.desc}</p>
          </div>
        </div>
      `).join("")}
    </div>
    <div style="text-align:center;margin-bottom:28px;">
      <a href="${process.env.APP_URL || "https://cvscore.usefulshxt.com"}" style="display:inline-block;background:#3B82F6;color:#fff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;">Start Scoring My CV</a>
    </div>
    <div style="background:#10B98110;border:1px solid #10B98130;border-radius:12px;padding:16px;margin-bottom:24px;text-align:center;">
      <p style="color:#10B981;font-size:13px;font-weight:600;margin:0 0 4px;">🎉 Free early access window open</p>
      <p style="color:#8895B3;font-size:12px;margin:0;">Everything is free until 29 July 2026. No credit card needed.</p>
    </div>
    <p style="color:#8895B3;font-size:11px;text-align:center;margin:0;">You're receiving this because you signed up to CVScore. <a href="#" style="color:#3B82F6;">Unsubscribe</a></p>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: `Welcome to CVScore, ${name} — your free access is live`,
      html,
    });
    console.log(`[email] Welcome email sent to ${to}`);
  } catch (err) {
    console.error(`[email] Failed to send welcome email:`, err);
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

// ─── Weekly personalised nudge ─────────────────────────────────────────────────
interface WeeklyNudgeData {
  name: string;
  score: number;
  jobTitle: string | null;
  companyName: string | null;
  weakestCategory: { name: string; score: number; feedback: string; suggestion: string } | null;
  missingKeywords: string[];
  topAction: string | null;
  daysSinceLastScore: number;
  totalRuns: number;
}

export async function sendPersonalisedWeeklyNudge(to: string, data: WeeklyNudgeData) {
  const transporter = getTransporter();
  if (!transporter) return;

  const color = scoreColor(data.score);
  const label = scoreLabel(data.score);
  const appUrl = process.env.APP_URL || "https://cvscore.usefulshxt.com";

  // Personalised subject line based on score band
  let subject: string;
  if (data.score >= 75) {
    subject = `${data.name}, you're at ${data.score}/100 — here's how to hit 90+`;
  } else if (data.score >= 50) {
    subject = `${data.name}, your CV is a Good Start — 3 tweaks to get you shortlisted`;
  } else {
    subject = `${data.name}, your CV scored ${data.score}/100 — let's fix that this week`;
  }

  // Personalised tip based on weakest area
  const tipSection = data.weakestCategory ? `
    <div style="background:#0F1629;border-left:3px solid #3B82F6;border-radius:0 12px 12px 0;padding:20px;margin-bottom:16px;">
      <p style="color:#A8B8D0;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 8px;">This week's tip — ${data.weakestCategory.name} (${data.weakestCategory.score}/100)</p>
      <p style="color:#F0F4FF;font-size:14px;line-height:1.6;margin:0 0 8px;">${data.weakestCategory.feedback}</p>
      <p style="color:#3B82F6;font-size:13px;font-weight:600;margin:0;">→ ${data.weakestCategory.suggestion}</p>
    </div>
  ` : "";

  // Missing keywords section
  const keywordsSection = data.missingKeywords.length > 0 ? `
    <div style="background:#EF444408;border:1px solid #EF444425;border-radius:12px;padding:16px;margin-bottom:16px;">
      <p style="color:#EF4444;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px;">Still missing from your CV</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${data.missingKeywords.slice(0, 8).map(kw => `
          <span style="display:inline-block;padding:3px 10px;background:#EF444415;border:1px solid #EF444430;border-radius:100px;color:#EF4444;font-size:12px;">${kw}</span>
        `).join("")}
        ${data.missingKeywords.length > 8 ? `<span style="color:#8895B3;font-size:12px;align-self:center;">+${data.missingKeywords.length - 8} more</span>` : ""}
      </div>
      <p style="color:#8895B3;font-size:12px;margin:10px 0 0;">Adding these naturally into your CV can meaningfully increase your score and ATS pass rate.</p>
    </div>
  ` : "";

  // Role context
  const roleContext = (data.jobTitle || data.companyName)
    ? `<p style="color:#8895B3;font-size:13px;margin:0 0 20px;">Last scored against: <strong style="color:#F0F4FF;">${[data.jobTitle, data.companyName].filter(Boolean).join(" at ")}</strong></p>`
    : "";

  // Streak / engagement line
  const streakLine = data.totalRuns > 1
    ? `<p style="color:#8895B3;font-size:12px;margin:0 0 4px;">You've scored ${data.totalRuns} role${data.totalRuns > 1 ? "s" : ""} so far — keep the momentum going.</p>`
    : `<p style="color:#8895B3;font-size:12px;margin:0 0 4px;">You're just getting started — the more you score, the sharper your CV gets.</p>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#080D1A;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="margin-bottom:28px;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <span style="font-size:20px;font-weight:700;color:#F0F4FF;">CV</span><span style="font-size:20px;font-weight:700;color:#3B82F6;">Score</span>
      </div>
      <span style="font-size:11px;color:#8895B3;">Weekly update</span>
    </div>

    <!-- Score hero -->
    <div style="background:#0F1629;border:1px solid #2A3558;border-radius:16px;padding:24px;margin-bottom:20px;text-align:center;">
      <p style="color:#8895B3;font-size:13px;margin:0 0 8px;">Hey ${data.name} — your last CV score</p>
      <div style="font-size:64px;font-weight:800;color:${color};line-height:1;">${data.score}</div>
      <div style="font-size:13px;color:#8895B3;margin:4px 0 8px;">/ 100</div>
      <span style="display:inline-block;padding:4px 14px;border-radius:100px;font-size:12px;font-weight:600;background:${color}20;color:${color};border:1px solid ${color}40;">${label}</span>
      ${roleContext}
      ${streakLine}
      <p style="color:#8895B3;font-size:12px;margin:0;">Scored ${data.daysSinceLastScore === 0 ? "today" : data.daysSinceLastScore === 1 ? "yesterday" : `${data.daysSinceLastScore} days ago`}</p>
    </div>

    <!-- Personalised tip -->
    ${tipSection}

    <!-- Missing keywords -->
    ${keywordsSection}

    <!-- Top action -->
    ${data.topAction ? `
    <div style="background:#3B82F608;border:1px solid #3B82F625;border-radius:12px;padding:16px;margin-bottom:20px;">
      <p style="color:#3B82F6;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 8px;">Your #1 priority this week</p>
      <p style="color:#F0F4FF;font-size:14px;line-height:1.6;margin:0;">${data.topAction}</p>
    </div>
    ` : ""}

    <!-- Free access banner -->
    <div style="background:linear-gradient(135deg,#10B98110,#3B82F610);border:1px solid #10B98125;border-radius:12px;padding:16px;margin-bottom:24px;text-align:center;">
      <p style="color:#10B981;font-size:13px;font-weight:600;margin:0 0 4px;">⏳ Free access closes 29 July 2026</p>
      <p style="color:#8895B3;font-size:12px;margin:0;">CV Rewrite, Cover Letters and LinkedIn Analysis are all free right now. Get them before the window closes.</p>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:32px;">
      <a href="${appUrl}" style="display:inline-block;background:#3B82F6;color:#fff;font-size:14px;font-weight:600;padding:14px 32px;border-radius:10px;text-decoration:none;margin-bottom:12px;">Re-score My CV This Week</a>
      <p style="color:#8895B3;font-size:12px;margin:8px 0 0;">Takes 2 minutes. Free. No credit card.</p>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #1A2340;padding-top:20px;text-align:center;">
      <p style="color:#8895B3;font-size:11px;margin:0;">You're receiving this because you used CVScore. <a href="#" style="color:#3B82F6;">Unsubscribe</a></p>
    </div>

  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
    console.log(`[email] Weekly nudge sent to ${to}`);
  } catch (err) {
    console.error(`[email] Weekly nudge failed for ${to}:`, err);
  }
}
