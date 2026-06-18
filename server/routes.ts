import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { nanoid } from "nanoid";
import multer from "multer";
import { sendScoreEmail, sendRewriteReadyEmail, sendWelcomeEmail, sendPersonalisedWeeklyNudge } from "./email";
import type { FastScoreResult } from "@shared/schema";
import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import rateLimit from "express-rate-limit";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const PPLX_API = "https://api.perplexity.ai/chat/completions";
const PPLX_KEY = process.env.PPLX_API_KEY || "";

// ─── Text length caps ──────────────────────────────────────────────────────────
const MAX_CV_LEN   = 50_000;
const MAX_JD_LEN   = 20_000;
const MAX_LI_LEN   = 30_000;
const MAX_NAME_LEN = 200;
const MAX_EMAIL_LEN = 320;

// ─── Rate limiters ────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit reached on AI routes. Please wait a few minutes." },
});

// ─── Retry helper ─────────────────────────────────────────────────────────────
async function callPerplexity(
  model: string,
  messages: { role: string; content: string }[],
  retries = 4,
  useSearch = false
): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const body: any = { model, messages, max_tokens: 4096 };
    if (useSearch) body.search_mode = "auto";

    const res = await fetch(PPLX_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PPLX_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json() as any;
      return data.choices[0].message.content as string;
    }

    if ([529, 503, 502].includes(res.status) && attempt < retries) {
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    const errText = await res.text();
    throw new Error(`Perplexity API error ${res.status}: ${errText}`);
  }
  throw new Error("Perplexity API: max retries exceeded");
}

function extractJSON(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
}

export async function registerRoutes(httpServer: Server, app: Express) {
  // ── Health ──────────────────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // ── User registration ───────────────────────────────────────────────────────
  app.post("/api/user/register", generalLimiter, async (req, res) => {
    try {
      const { email, name } = req.body;
      if (!email || !name) return res.status(400).json({ error: "email and name required" });
      if (typeof email !== "string" || typeof name !== "string")
        return res.status(400).json({ error: "Invalid input types" });
      if (email.length > MAX_EMAIL_LEN) return res.status(400).json({ error: "Email too long" });
      if (name.length > MAX_NAME_LEN) return res.status(400).json({ error: "Name too long" });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        return res.status(400).json({ error: "Invalid email format" });

      const normalised = email.toLowerCase().trim();
      let user = await storage.getUserByEmail(normalised);
      const isNew = !user;

      if (!user) {
        user = await storage.createUser({ id: nanoid(), email: normalised, name: name.trim(), runCount: 0 });
        sendWelcomeEmail(normalised, name.trim()).catch(() => {});
      } else {
        await storage.touchLastSeen(user.id);
      }

      const { email: _email, ...safeUser } = user as any;
      res.json({ user: safeUser, isNew });
    } catch (err: any) {
      console.error("Register error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Get user (own data only) ────────────────────────────────────────────────
  app.get("/api/user/:id", generalLimiter, async (req, res) => {
    try {
      const requestingUserId = req.query.userId as string | undefined;
      if (!requestingUserId || requestingUserId !== req.params.id)
        return res.status(403).json({ error: "Forbidden" });

      const user = await storage.getUserById(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      res.json({
        user: { id: user.id, name: user.name, runCount: user.runCount, createdAt: user.createdAt, lastSeenAt: user.lastSeenAt },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── PDF Upload ──────────────────────────────────────────────────────────────
  app.post("/api/cv/upload", generalLimiter, upload.single("file"), async (req, res) => {
    const tmpFile = join(tmpdir(), `cv-${nanoid()}.pdf`);
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      writeFileSync(tmpFile, req.file.buffer);
      const text = execFileSync("pdftotext", ["-layout", tmpFile, "-"], {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      }).toString("utf-8").trim();

      if (!text || text.length < 20)
        return res.status(422).json({ error: "Could not extract text from PDF. The file may be image-based. Please paste your CV text instead." });

      res.json({ text: text.slice(0, MAX_CV_LEN) });
    } catch (err: any) {
      console.error("PDF parse error:", err);
      res.status(500).json({ error: "Failed to parse PDF. Please paste your CV text instead." });
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  // ── Company Intel ───────────────────────────────────────────────────────────
  app.post("/api/company-intel", aiLimiter, async (req, res) => {
    try {
      const { jdText } = req.body;
      if (!jdText || typeof jdText !== "string") return res.status(400).json({ error: "jdText required" });
      if (jdText.length < 50) return res.status(400).json({ error: "jdText too short" });
      if (jdText.length > MAX_JD_LEN) return res.status(400).json({ error: "jdText too long" });

      const prompt = `Search the web and analyse this job description. Return ONLY a valid JSON object (no markdown fences).

JOB DESCRIPTION:
${jdText.slice(0, 2000)}

Return this exact JSON:
{
  "companyName": "<company name>",
  "jobTitle": "<job title>",
  "overview": "<2-3 sentence company overview>",
  "culture": "<what this company values in employees>",
  "recentNews": "<1-2 notable recent developments>",
  "techStack": "<technologies mentioned in JD or associated with company>",
  "hiringSignals": "<what this role reveals about company direction>"
}`;

      const raw = await callPerplexity("sonar", [
        { role: "system", content: "You are a company research analyst. Return valid JSON only." },
        { role: "user", content: prompt },
      ], 3, true);

      res.json(JSON.parse(extractJSON(raw)));
    } catch (err: any) {
      console.error("Company intel error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── LinkedIn Analysis ───────────────────────────────────────────────────────
  app.post("/api/linkedin/analyse", aiLimiter, async (req, res) => {
    try {
      const { linkedinText, jdText, cvText, sessionId } = req.body;
      if (!linkedinText || !jdText) return res.status(400).json({ error: "linkedinText and jdText required" });
      if (typeof linkedinText !== "string" || typeof jdText !== "string")
        return res.status(400).json({ error: "Invalid input types" });
      if (linkedinText.length < 50) return res.status(400).json({ error: "LinkedIn text too short" });
      if (linkedinText.length > MAX_LI_LEN) return res.status(400).json({ error: "LinkedIn text too long" });
      if (jdText.length > MAX_JD_LEN) return res.status(400).json({ error: "JD text too long" });
      if (cvText && typeof cvText === "string" && cvText.length > MAX_CV_LEN)
        return res.status(400).json({ error: "CV text too long" });

      const cvSection = cvText ? `\nCANDIDATE'S CV:\n${(cvText as string).slice(0, 2000)}` : "";

      const prompt = `Analyse this LinkedIn profile against the job description. Return ONLY valid JSON.

LINKEDIN PROFILE:
${linkedinText.slice(0, 3000)}

JOB DESCRIPTION:
${jdText.slice(0, 1500)}
${cvSection}

Return this exact JSON:
{
  "overallScore": <0-100>,
  "headlineScore": <0-100>, "headlineFeedback": "<feedback>",
  "summaryScore": <0-100>, "summaryFeedback": "<feedback>",
  "skillsScore": <0-100>, "skillsFeedback": "<feedback>",
  "experienceScore": <0-100>, "experienceFeedback": "<feedback>",
  "gaps": ["<gap>"],
  "extras": ["<strength>"],
  "topActions": ["<action 1>", "<action 2>", "<action 3>"],
  "keywordsMissing": ["<keyword>"]
}`;

      const raw = await callPerplexity("sonar-pro", [
        { role: "system", content: "You are a LinkedIn optimisation expert. Return valid JSON only." },
        { role: "user", content: prompt },
      ]);

      const parsed = JSON.parse(extractJSON(raw));

      if (sessionId && typeof sessionId === "string") {
        await storage.updateSession(sessionId, { linkedinText, linkedinAnalysis: JSON.stringify(parsed) });
      }

      res.json(parsed);
    } catch (err: any) {
      console.error("LinkedIn analyse error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── JD Tracker ──────────────────────────────────────────────────────────────
  app.get("/api/tracker/:userId", generalLimiter, async (req, res) => {
    try {
      const sessions = await storage.getRecentSessionsByUser(req.params.userId, 5);
      const entries = sessions.map((s) => ({
        sessionId: s.id,
        jobTitle: s.jobTitle || "Unknown Role",
        companyName: s.companyName || "Unknown Company",
        score: s.score!,
        createdAt: s.createdAt?.toISOString() || new Date().toISOString(),
        keywords: s.keywords ? JSON.parse(s.keywords) : null,
        topActions: s.actions ? JSON.parse(s.actions) : [],
      }));
      res.json({ entries });
    } catch (err: any) {
      console.error("Tracker error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Phase 1: Fast score ─────────────────────────────────────────────────────
  app.post("/api/score/fast", aiLimiter, async (req, res) => {
    try {
      const { cvText, jdText, userId, jobTitle, companyName } = req.body;
      if (!cvText || !jdText) return res.status(400).json({ error: "cvText and jdText required" });
      if (typeof cvText !== "string" || typeof jdText !== "string")
        return res.status(400).json({ error: "Invalid input types" });
      if (cvText.length < 50) return res.status(400).json({ error: "CV text too short" });
      if (cvText.length > MAX_CV_LEN) return res.status(400).json({ error: "CV text too long" });
      if (jdText.length < 50) return res.status(400).json({ error: "JD text too short" });
      if (jdText.length > MAX_JD_LEN) return res.status(400).json({ error: "JD text too long" });

      const prompt = `You are an expert CV/resume analyst and ATS specialist. Analyse this CV against the job description and return ONLY a valid JSON object (no markdown fences).

CV:
${cvText}

JOB DESCRIPTION:
${jdText}

Return this exact JSON:
{
  "overallScore": <0-100>,
  "summary": "<2-3 sentence executive summary>",
  "categories": [
    { "name": "Keyword Alignment", "score": <0-100>, "feedback": "<observation>", "suggestion": "<fix>" },
    { "name": "CV Structure & Format", "score": <0-100>, "feedback": "<observation>", "suggestion": "<fix>" },
    { "name": "Experience Relevance", "score": <0-100>, "feedback": "<observation>", "suggestion": "<fix>" },
    { "name": "Quantified Impact", "score": <0-100>, "feedback": "<observation>", "suggestion": "<fix>" },
    { "name": "ATS Compatibility", "score": <0-100>, "feedback": "<observation>", "suggestion": "<fix>" },
    { "name": "Narrative Clarity", "score": <0-100>, "feedback": "<observation>", "suggestion": "<fix>" }
  ],
  "keywords": { "matched": ["<keyword>"], "missing": ["<keyword>"] },
  "topActions": ["<action 1>", "<action 2>", "<action 3>"]
}`;

      const raw = await callPerplexity("sonar", [
        { role: "system", content: "You are a professional CV scoring AI. Return valid JSON only." },
        { role: "user", content: prompt },
      ]);

      const parsed = JSON.parse(extractJSON(raw)) as FastScoreResult;
      const sessionId = nanoid();

      await storage.createSession({
        id: sessionId,
        userId: userId || null,
        cvText,
        jdText,
        jobTitle: jobTitle || null,
        companyName: companyName || null,
        score: parsed.overallScore,
        categories: JSON.stringify(parsed.categories),
        keywords: JSON.stringify(parsed.keywords),
        actions: JSON.stringify(parsed.topActions),
      });

      if (userId && typeof userId === "string") {
        const user = await storage.getUserById(userId);
        await storage.incrementRunCount(userId);
        if (user) {
          sendScoreEmail(user.email, user.name, parsed, sessionId, user.runCount === 0).catch(() => {});
        }
      }

      res.json({ ...parsed, sessionId });
    } catch (err: any) {
      console.error("Fast score error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Phase 2: Deep analysis ──────────────────────────────────────────────────
  app.post("/api/score/deep", aiLimiter, async (req, res) => {
    try {
      const { cvText, jdText, sessionId } = req.body;
      if (!cvText || !jdText) return res.status(400).json({ error: "cvText and jdText required" });
      if (typeof cvText !== "string" || typeof jdText !== "string")
        return res.status(400).json({ error: "Invalid input types" });
      if (cvText.length > MAX_CV_LEN) return res.status(400).json({ error: "CV text too long" });
      if (jdText.length > MAX_JD_LEN) return res.status(400).json({ error: "JD text too long" });

      const prompt = `You are a senior career coach. Provide deep analysis. Return ONLY valid JSON.

CV:
${cvText}

JOB DESCRIPTION:
${jdText}

Return this exact JSON:
{
  "upskilling": [
    { "skill": "<skill>", "reason": "<why it matters>", "resource": "<specific course/cert>" },
    { "skill": "<skill>", "reason": "<reason>", "resource": "<resource>" },
    { "skill": "<skill>", "reason": "<reason>", "resource": "<resource>" }
  ],
  "interviewPrep": [
    { "question": "<question>", "hint": "<how to answer>" },
    { "question": "<question>", "hint": "<hint>" },
    { "question": "<question>", "hint": "<hint>" },
    { "question": "<question>", "hint": "<hint>" },
    { "question": "<question>", "hint": "<hint>" }
  ],
  "competitiveInsights": "<paragraph about strong candidates for this role and how this CV compares>"
}`;

      const raw = await callPerplexity("sonar-pro", [
        { role: "system", content: "You are a senior career coach. Return valid JSON only." },
        { role: "user", content: prompt },
      ]);

      const parsed = JSON.parse(extractJSON(raw));

      if (sessionId && typeof sessionId === "string") {
        await storage.updateSession(sessionId, { deepAnalysis: JSON.stringify(parsed) });
      }

      res.json(parsed);
    } catch (err: any) {
      console.error("Deep score error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── CV Rewrite ──────────────────────────────────────────────────────────────
  app.post("/api/rewrite", aiLimiter, async (req, res) => {
    try {
      const { cvText, jdText, sessionId, userId, companyIntel } = req.body;
      if (!cvText || !jdText) return res.status(400).json({ error: "cvText and jdText required" });
      if (typeof cvText !== "string" || typeof jdText !== "string")
        return res.status(400).json({ error: "Invalid input types" });
      if (cvText.length > MAX_CV_LEN) return res.status(400).json({ error: "CV text too long" });
      if (jdText.length > MAX_JD_LEN) return res.status(400).json({ error: "JD text too long" });

      const intelContext = companyIntel ? `\nCOMPANY CONTEXT:\n${companyIntel}` : "";

      const prompt = `Rewrite this CV to be perfectly optimised for the job description. Return ONLY valid JSON.

ORIGINAL CV:
${cvText}

TARGET JOB DESCRIPTION:
${jdText}
${intelContext}

Return this exact JSON:
{
  "name": "<candidate full name>",
  "tagline": "<powerful one-line tagline for this role>",
  "contact": "<email | phone | LinkedIn | location>",
  "summary": "<3-4 sentence professional summary for this role>",
  "skills": ["<skill>"],
  "experience": [
    { "title": "<title>", "company": "<company>", "dates": "<start – end>", "bullets": ["<achievement with metric>"] }
  ],
  "education": [{ "degree": "<qualification>", "institution": "<institution>", "dates": "<year>" }],
  "extras": ["<certification or notable item>"]
}`;

      const [rewriteRaw, companyRaw] = await Promise.all([
        callPerplexity("sonar-pro", [
          { role: "system", content: "You are an expert CV writer. Return valid JSON only." },
          { role: "user", content: prompt },
        ]),
        companyIntel
          ? Promise.resolve(companyIntel)
          : callPerplexity("sonar", [
              { role: "system", content: "You are a research assistant. Be concise." },
              { role: "user", content: `Search the web and provide a brief 3-4 sentence overview of the company in this JD.\n\nJOB DESCRIPTION:\n${jdText.slice(0, 1000)}` },
            ], 3, true),
      ]);

      const rewrite = JSON.parse(extractJSON(rewriteRaw));

      if (sessionId && typeof sessionId === "string") {
        await storage.updateSession(sessionId, {
          rewrite: JSON.stringify(rewrite),
          companyIntel: typeof companyRaw === "string" ? companyRaw : null,
        });
      }

      if (userId && typeof userId === "string") {
        const user = await storage.getUserById(userId);
        if (user) sendRewriteReadyEmail(user.email, user.name).catch(() => {});
      }

      res.json({ rewrite, companyIntel: companyRaw });
    } catch (err: any) {
      console.error("Rewrite error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Cover Letters ───────────────────────────────────────────────────────────
  app.post("/api/cover-letters", aiLimiter, async (req, res) => {
    try {
      const { cvText, jdText, sessionId } = req.body;
      if (!cvText || !jdText) return res.status(400).json({ error: "cvText and jdText required" });
      if (typeof cvText !== "string" || typeof jdText !== "string")
        return res.status(400).json({ error: "Invalid input types" });
      if (cvText.length > MAX_CV_LEN) return res.status(400).json({ error: "CV text too long" });
      if (jdText.length > MAX_JD_LEN) return res.status(400).json({ error: "JD text too long" });

      const prompt = `Write 3 cover letter variations with distinct tones. Return ONLY valid JSON.

CV:
${cvText}

JOB DESCRIPTION:
${jdText}

Return exactly this JSON:
{
  "coverLetters": [
    {
      "tone": "Direct & Confident",
      "desc": "Gets straight to the point. Bold claims, strong verbs.",
      "salutation": "Dear Hiring Manager,",
      "paragraphs": ["<p1>", "<p2>", "<p3>"],
      "sign": "Best regards,\\n<name>"
    },
    {
      "tone": "Warm & Collaborative",
      "desc": "Emphasises teamwork, culture fit, and enthusiasm.",
      "salutation": "Dear Hiring Team,",
      "paragraphs": ["<p1>", "<p2>", "<p3>"],
      "sign": "Warmly,\\n<name>"
    },
    {
      "tone": "Strategic & Data-Led",
      "desc": "Leads with metrics, market insight, and strategic value.",
      "salutation": "Dear Hiring Manager,",
      "paragraphs": ["<p1>", "<p2>", "<p3>"],
      "sign": "Regards,\\n<name>"
    }
  ]
}`;

      const raw = await callPerplexity("sonar-pro", [
        { role: "system", content: "You are an expert cover letter writer. Return valid JSON only." },
        { role: "user", content: prompt },
      ]);

      const parsed = JSON.parse(extractJSON(raw));

      if (sessionId && typeof sessionId === "string") {
        await storage.updateSession(sessionId, { coverLetters: JSON.stringify(parsed.coverLetters) });
      }

      res.json(parsed);
    } catch (err: any) {
      console.error("Cover letters error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Cron: weekly personalised nudge ────────────────────────────────────────
  app.post("/api/cron/weekly-nudge", async (req, res) => {
    const secret = req.headers["x-admin-secret"];
    if (!secret || secret !== process.env.ADMIN_SECRET)
      return res.status(401).json({ error: "Unauthorised" });

    try {
      // Fetch users active in last 30 days with their last session
      const active = await storage.getActiveUsersWithLastSession(30);
      console.log(`[cron] Weekly nudge: ${active.length} active users to email`);

      let sent = 0;
      let skipped = 0;

      for (const { user, session } of active) {
        try {
          // Parse categories to find weakest area
          let weakestCategory = null;
          let missingKeywords: string[] = [];
          let topAction: string | null = null;

          if (session.categories) {
            const cats = JSON.parse(session.categories) as Array<{
              name: string; score: number; feedback: string; suggestion: string;
            }>;
            const sorted = [...cats].sort((a, b) => a.score - b.score);
            weakestCategory = sorted[0] || null;
          }

          if (session.keywords) {
            const kws = JSON.parse(session.keywords) as { matched: string[]; missing: string[] };
            missingKeywords = kws.missing || [];
          }

          if (session.actions) {
            const actions = JSON.parse(session.actions) as string[];
            topAction = actions[0] || null;
          }

          const daysSince = Math.floor(
            (Date.now() - new Date(session.createdAt).getTime()) / (1000 * 60 * 60 * 24)
          );

          await sendPersonalisedWeeklyNudge(user.email, {
            name: user.name,
            score: session.score!,
            jobTitle: session.jobTitle,
            companyName: session.companyName,
            weakestCategory,
            missingKeywords,
            topAction,
            daysSinceLastScore: daysSince,
            totalRuns: user.runCount,
          });

          sent++;
          // Small delay between sends to avoid Gmail rate limits
          await new Promise((r) => setTimeout(r, 300));
        } catch (err) {
          console.error(`[cron] Failed for user ${user.id}:`, err);
          skipped++;
        }
      }

      res.json({ ok: true, sent, skipped, total: active.length });
    } catch (err: any) {
      console.error("[cron] Weekly nudge error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Admin ───────────────────────────────────────────────────────────────────
  app.get("/api/admin/users", async (req, res) => {
    const secret = req.headers["x-admin-secret"];
    if (!secret || secret !== process.env.ADMIN_SECRET)
      return res.status(401).json({ error: "Unauthorised" });

    try {
      const allUsers = await storage.getAllUsers();
      res.json({
        total: allUsers.length,
        users: allUsers.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          runs: u.runCount,
          joined: u.createdAt,
          lastSeen: u.lastSeenAt,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
