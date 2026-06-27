import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { nanoid } from "nanoid";
import multer from "multer";
import { sendScoreEmail, sendRewriteReadyEmail, sendWelcomeEmail, sendPersonalisedWeeklyNudge } from "./email";
import type { FastScoreResult } from "@shared/schema";
import { PDFParse } from "pdf-parse";
import rateLimit from "express-rate-limit";
import { callClaude, callClaudeHaiku, callClaudeSonnet, fetchPageText } from "./claude";
import supabase from "./supabase";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { parseLinkedInExport } from "./linkedinParser";

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
  useSearch = false,
  maxTokens = 4096
): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const body: any = { model, messages, max_tokens: maxTokens };

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
  let s = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
  // Find outermost JSON object or array
  const objStart = s.indexOf("{");
  const arrStart = s.indexOf("[");
  const start = objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart);
  if (start > 0) s = s.slice(start);
  const lastObj = s.lastIndexOf("}");
  const lastArr = s.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);
  if (end !== -1 && end < s.length - 1) s = s.slice(0, end + 1);
  // Remove trailing commas before ] or }
  s = s.replace(/,\s*([\]}])/g, "$1");
  return s;
}

function extractJobTitle(jd: string): string | null {
  const SKIP = /^about the job(\s+at\b)?/i;
  const TITLE_KEYWORDS = /\b(manager|director|engineer|analyst|designer|developer|lead|head of|vp|vice president|senior|junior|associate|coordinator|specialist|consultant|architect|scientist|executive|officer|president|recruiter|advisor|strategist)\b/i;
  const EXPLICIT_PREFIX = /^(job title|role|position|title)\s*[:\-]\s*/i;

  const lines = jd.split("\n").slice(0, 20).map(l => l.trim()).filter(Boolean);

  // Pass 1: explicit prefix label
  for (const line of lines) {
    if (EXPLICIT_PREFIX.test(line)) {
      const title = line.replace(EXPLICIT_PREFIX, "").replace(/[^a-zA-Z0-9 &,\-\/]/g, "").trim().slice(0, 60);
      if (title.length > 2) return title;
    }
  }

  // Pass 2: short line with a known title keyword, not a skip phrase
  for (const line of lines) {
    if (SKIP.test(line)) continue;
    if (line.length < 4 || line.length > 80) continue;
    if (line.includes("http") || line.includes("@")) continue;
    if (TITLE_KEYWORDS.test(line)) {
      return line.replace(/[^a-zA-Z0-9 &,\-\/]/g, "").trim().slice(0, 60) || null;
    }
  }

  // Pass 3: first short capitalised line that is not a skip phrase
  for (const line of lines) {
    if (SKIP.test(line)) continue;
    if (line.length < 4 || line.length > 60) continue;
    if (line.includes("http") || line.includes("@")) continue;
    if (/^[A-Z]/.test(line)) {
      return line.replace(/[^a-zA-Z0-9 &,\-\/]/g, "").trim().slice(0, 60) || null;
    }
  }

  return null;
}

function extractCompanyName(jd: string): string | null {
  // Match "at/join/@ CompanyName" but stop at first verb, comma, or clause
  const match = jd.match(/(?:(?:working\s+)?at|join(?:ing)?|@|company[:\s]+)\s+([A-Z][a-zA-Z0-9 &.'-]{1,35})/m);
  if (!match) return null;
  // Truncate at first comma, verb indicator, or punctuation that signals a clause
  const raw = match[1].trim();
  const truncated = raw.split(/[,;]|(?:\s+(?:is|are|was|were|has|have|will|means|helps|makes|builds|offers|provides|enables|allows)\b)/)[0].trim();
  return truncated.slice(0, 40) || null;
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
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const parser = new PDFParse({ data: req.file.buffer });
      const result = await parser.getText();
      const text = result.text.trim();

      if (!text || text.length < 20)
        return res.status(422).json({ error: "Could not extract text from PDF. The file may be image-based — please paste your CV text instead." });

      res.json({ text: text.slice(0, MAX_CV_LEN) });
    } catch (err: any) {
      console.error("PDF parse error:", err);
      res.status(500).json({ error: "Failed to parse PDF. Please paste your CV text instead." });
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

  // ── LinkedIn analyse (updated: screenshot + Use my CV + copy-ready output) ───
  app.post("/api/linkedin/analyse", aiLimiter, async (req, res) => {
    try {
      const { linkedinText, jdText, cvText, sessionId, useCV, screenshotBase64 } = req.body;
      if (!jdText || typeof jdText !== "string")
        return res.status(400).json({ error: "jdText required" });
      if (jdText.length > MAX_JD_LEN)
        return res.status(400).json({ error: "JD text too long" });

      const hasText = linkedinText && typeof linkedinText === "string" && linkedinText.length >= 50;
      const hasShot = screenshotBase64 && typeof screenshotBase64 === "string" && screenshotBase64.length > 200;
      const hasCV   = cvText && typeof cvText === "string" && cvText.length > 100;
      const cvMode  = useCV === true || (!hasText && !hasShot);

      if (!hasText && !hasShot && !hasCV) {
        return res.status(400).json({
          error: "Provide LinkedIn text, a screenshot, or score your CV first to use the CV option.",
        });
      }

      const cvSection = hasCV ? `\nCANDIDATE CV:\n${(cvText as string).slice(0, 2500)}` : "";
      const mode = hasShot ? "screenshot" : hasText && !cvMode ? "profile_text" : "cv_based";

      const system = `You are a LinkedIn profile expert. Goal: make this person's LinkedIn attract ${jdText.slice(0, 100)} opportunities — the entire space of roles matching their skills and trajectory, not one specific job. Return valid JSON only.`;

      const prompt = `Mode: ${mode}
${mode === "screenshot" ? "Analyse every visible element in the attached screenshot." : mode === "profile_text" ? `LINKEDIN PROFILE:\n${(linkedinText as string).slice(0, 3500)}` : "No profile provided — generate optimised content from their CV only."}

JOB DESCRIPTION (directional — target this role space broadly):
${jdText.slice(0, 1500)}
${cvSection}

STRICT GROUNDING RULE: All headline rewrites, about section rewrites, experience rewrites, and skill recommendations must be based only on what exists in the CV or LinkedIn profile provided. Do not add languages, qualifications, or skills the candidate has not listed. Do not imply future intentions. Do not invent achievements. Rewrite what exists — make it stronger — but never fabricate.

Return ONLY valid JSON:
{
  "mode": "${mode}",
  "overallScore": <0-100>,
  "targetSpace": "<role category + industry to position for>",
  "sectionScores": [
    {"section":"Headline","score":<0-100>,"current":"<current/estimated>","issue":"<specific issue>"},
    {"section":"About","score":<0-100>,"current":"<summary>","issue":"<issue>"},
    {"section":"Experience","score":<0-100>,"current":"<observation>","issue":"<issue>"},
    {"section":"Skills","score":<0-100>,"current":"<observation>","issue":"<issue>"},
    {"section":"Photo & Banner","score":<0-100>,"current":"<observation>","issue":"<issue>"}
  ],
  "headline": "<optimised headline max 220 chars — no cliches>",
  "headlineAlternatives": ["<alt 1>","<alt 2>"],
  "about": "<full rewritten About — first person, real achievements, 1200 chars max>",
  "experienceRewrites": [
    {"role":"<most recent role>","before":"<weak bullet>","after":"<rewritten with metric>"},
    {"role":"<role>","before":"<bullet>","after":"<rewritten>"}
  ],
  "skillsToAdd": ["<skill>","<skill>","<skill>","<skill>","<skill>"],
  "recruiterKeywords": ["<keyword>","<keyword>","<keyword>","<keyword>","<keyword>"],
  "featuredSection": "<specific Featured section idea>",
  "bannerIdea": "<specific banner concept>",
  "creatorMode": "<yes/no + specific reason>",
  "posts": [
    {"hook":"<scroll-stopping first line>","angle":"Insight","body":"<full 150-200 word post>"},
    {"hook":"<hook>","angle":"Story","body":"<body>"},
    {"hook":"<hook>","angle":"Lesson","body":"<body>"},
    {"hook":"<hook>","angle":"Framework","body":"<body>"},
    {"hook":"<hook>","angle":"Contrarian","body":"<body>"}
  ],
  "priorityActions": ["<most impactful first>","<second>","<third>"],
  "gapAnalysis": "<2-3 sentences on gaps vs strong candidate in this space>"
}`;

      let raw: string;
      if (hasShot) {
        raw = await callClaudeSonnet(prompt, system, screenshotBase64 as string);
      } else {
        raw = await callClaudeSonnet(prompt, "You are an expert CV and career analyst. Return valid JSON only. Never invent experience or qualifications not present in the provided CV.");
      }

      const parsed = JSON.parse(extractJSON(raw));
      if (sessionId && typeof sessionId === "string")
        await storage.updateSession(sessionId, { linkedinText: linkedinText || "cv_based", linkedinAnalysis: JSON.stringify(parsed) });

      res.json(parsed);
    } catch (err: any) {
      console.error("LinkedIn analyse error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── LinkedIn Export ZIP Analyser ─────────────────────────────────────────────
  app.post("/api/linkedin/analyse-export", aiLimiter, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const fileName = (req.file.originalname || "").toLowerCase();
      const mime = (req.file.mimetype || "").toLowerCase();
      const isZip = mime === "application/zip" || mime === "application/x-zip-compressed"
        || mime === "application/octet-stream" || fileName.endsWith(".zip");
      if (!isZip) return res.status(400).json({ error: "File must be a ZIP archive (.zip)" });

      const email = typeof req.body.email === "string" ? req.body.email.trim() : undefined;

      let exportData: Awaited<ReturnType<typeof parseLinkedInExport>>;
      try {
        exportData = await parseLinkedInExport(req.file.buffer);
      } catch (parseErr: any) {
        return res.status(422).json({ error: "Could not read ZIP — make sure it is an unmodified LinkedIn data export." });
      }

      const hasData =
        exportData.profile.firstName ||
        exportData.positions.length > 0 ||
        exportData.network.totalCount > 0 ||
        exportData.skills.length > 0;

      if (!hasData) {
        return res.status(422).json({ error: "No parseable LinkedIn data found in this ZIP. Download a fresh export from LinkedIn Settings → Data Privacy → Get a copy of your data." });
      }

      const dataSnapshot = JSON.stringify({
        profile: exportData.profile,
        positions: exportData.positions.slice(0, 10),
        education: exportData.education.slice(0, 5),
        skills: exportData.skills.slice(0, 30),
        certifications: exportData.certifications.slice(0, 10),
        endorsements: exportData.endorsements.slice(0, 15),
        recommendations: exportData.recommendations.slice(0, 5),
        languages: exportData.languages,
        courses: exportData.courses.slice(0, 10),
        honors: exportData.honors.slice(0, 5),
        savedJobs: exportData.savedJobs.slice(0, 10),
        network: exportData.network,
      });

      const system = "You are a senior LinkedIn career strategist and recruiter. Analyse LinkedIn export data and return a structured JSON assessment. Return valid JSON only — no prose, no markdown fences.";

      const prompt = `Analyse this LinkedIn profile export data and return an 8-section JSON assessment:

LINKEDIN EXPORT DATA:
${dataSnapshot.slice(0, 12000)}

Return ONLY this JSON structure:
{
  "overallScore": <0-100 integer>,
  "fullName": "<first + last name from profile, or 'LinkedIn User' if missing>",
  "tagline": "<one sentence positioning statement for this person>",
  "sections": [
    {
      "key": "careerPositioning",
      "title": "Career Positioning",
      "score": <0-100>,
      "summary": "<2-3 sentence assessment>",
      "strengths": ["<strength 1>", "<strength 2>"],
      "improvements": ["<specific improvement>", "<specific improvement>"]
    },
    {
      "key": "networkStrength",
      "title": "Network Strength",
      "score": <0-100>,
      "summary": "<assessment of network size and quality — mention connection count, top industries/roles>",
      "strengths": ["<strength>"],
      "improvements": ["<improvement>"]
    },
    {
      "key": "profileCompleteness",
      "title": "Profile Completeness",
      "score": <0-100>,
      "summary": "<which sections are strong, which are missing>",
      "strengths": ["<what's well filled out>"],
      "improvements": ["<what's missing or thin>"]
    },
    {
      "key": "experienceImpact",
      "title": "Experience Impact",
      "score": <0-100>,
      "summary": "<assessment of experience depth, progression, and description quality>",
      "strengths": ["<strong career moves or achievements>"],
      "improvements": ["<how to make experience bullets stronger>"]
    },
    {
      "key": "skillsEndorsements",
      "title": "Skills & Endorsements",
      "score": <0-100>,
      "summary": "<assessment of skill breadth, depth, and endorsement social proof>",
      "strengths": ["<top endorsed skills or valuable skills>"],
      "improvements": ["<skills gaps or missing endorsements>"]
    },
    {
      "key": "educationCredentials",
      "title": "Education & Credentials",
      "score": <0-100>,
      "summary": "<assessment of education, certifications, courses, and honours>",
      "strengths": ["<strong credentials>"],
      "improvements": ["<certifications to add or courses to highlight>"]
    },
    {
      "key": "socialProof",
      "title": "Social Proof",
      "score": <0-100>,
      "summary": "<assessment of recommendations, endorsements, and credibility signals>",
      "strengths": ["<strong social proof elements>"],
      "improvements": ["<how to get more or better recommendations>"]
    },
    {
      "key": "recruitmentReadiness",
      "title": "Recruitment Readiness",
      "score": <0-100>,
      "summary": "<overall assessment — how ready is this person to be found and selected by recruiters>",
      "strengths": ["<strong hiring signals>"],
      "improvements": ["<what would make recruiters act faster>"]
    }
  ],
  "topActions": [
    "<highest impact action — be very specific>",
    "<second priority action>",
    "<third priority action>",
    "<fourth priority action>",
    "<fifth priority action>"
  ]
}`;

      const raw = await callClaude(prompt, system, "claude-sonnet-4-6", 4000);
      const analysisResult = JSON.parse(extractJSON(raw));

      await logToken(email, "linkedin_export");

      res.json({ ...analysisResult, exportMeta: {
        connectionsCount: exportData.network.totalCount,
        positionsCount: exportData.positions.length,
        skillsCount: exportData.skills.length,
        endorsementsCount: exportData.endorsements.reduce((s, e) => s + e.count, 0),
        recommendationsCount: exportData.recommendations.length,
        certificationsCount: exportData.certifications.length,
      }});
    } catch (err: any) {
      console.error("LinkedIn export analyse error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── JD Tracker ──────────────────────────────────────────────────────────────
  app.get("/api/tracker/:userId", generalLimiter, async (req, res) => {
    try {
      const sessions = await storage.getRecentSessionsByUser(req.params.userId, 5);
      const entries = sessions.map((s) => {
        const actionsRaw = s.actions ? JSON.parse(s.actions) : null;
        const topActions = Array.isArray(actionsRaw) ? actionsRaw : (actionsRaw?.topActions || []);
        return {
          sessionId: s.id,
          jobTitle: s.jobTitle || "Unknown Role",
          companyName: s.companyName || "Unknown Company",
          score: s.score!,
          createdAt: s.createdAt?.toISOString() || new Date().toISOString(),
          keywords: s.keywords ? JSON.parse(s.keywords) : null,
          topActions,
          categories: s.categories ? (JSON.parse(s.categories) as { name: string; score: number; feedback: string; suggestion: string }[]).map(c => ({ name: c.name, score: c.score })) : null,
          cvText: s.cvText ? s.cvText.slice(0, 5000) : "",
          jdText: s.jdText || "",
        };
      });
      res.json({ entries });
    } catch (err: any) {
      console.error("Tracker error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Session restore ──────────────────────────────────────────────────────────
  app.get("/api/session/:sessionId", generalLimiter, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.sessionId as string);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const actionsRaw = session.actions ? JSON.parse(session.actions) : null;
      const topActions = Array.isArray(actionsRaw) ? actionsRaw : (actionsRaw?.topActions || []);
      const summary = !Array.isArray(actionsRaw) && actionsRaw ? (actionsRaw.summary || null) : null;
      const domainMatch = !Array.isArray(actionsRaw) && actionsRaw ? (actionsRaw.domainMatch || null) : null;

      res.json({
        sessionId: session.id,
        overallScore: session.score,
        categories: session.categories ? JSON.parse(session.categories) : [],
        keywords: session.keywords ? JSON.parse(session.keywords) : { matched: [], missing: [] },
        topActions,
        summary: summary || `Score: ${session.score}/100`,
        domainMatch: domainMatch || undefined,
        cvText: session.cvText ? session.cvText.slice(0, 5000) : "",
        jdText: session.jdText || "",
        rewrite: session.rewrite ? JSON.parse(session.rewrite) : null,
        coverLetters: session.coverLetters ? JSON.parse(session.coverLetters) : null,
      });
    } catch (err: any) {
      console.error("Session fetch error:", err);
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

SCORING HIERARCHY (apply in this order):
- Direct industry experience (same sector as JD): full weight
- Transferable role experience (same function, different industry): partial weight — e.g. a CSM in SaaS applying for CSM in real estate scores higher than no CS experience, but lower than direct real estate CS experience
- Adjacent skills (tools, methodologies, soft skills from JD): minor weight only
- No relevant experience: heavy penalty

SCORE BANDS:
- 80-100: Strong match — direct industry AND role experience, most JD requirements met
- 65-79: Good match — strong transferable experience, minor gaps
- 50-64: Partial match — relevant role but different industry, or right industry but different role
- 35-49: Weak match — limited transferable experience, significant gaps
- Below 35: Poor match — little to no relevant experience

DOMAIN MISMATCH RULE: If the candidate has zero direct industry experience for this specific sector, the overallScore must not exceed 72.

domainMatch values:
- "strong": candidate has direct experience in the same industry as the JD
- "partial": candidate has the same role/function but in a different industry
- "weak": candidate has no relevant industry or role experience

CONTENT GROUNDING RULE: Only reference skills, experience, and achievements that exist in the candidate's CV. Never mention languages, qualifications, future intentions, or soft skills not evidenced in the CV. A shorter honest output is better than a padded one.

CV:
${cvText}

JOB DESCRIPTION:
${jdText}

Return this exact JSON:
{
  "overallScore": <0-100 — apply scoring hierarchy and domain mismatch cap>,
  "domainMatch": "<strong|partial|weak>",
  "summary": "<2-3 sentence honest assessment — reference only what is in the CV>",
  "categories": [
    { "name": "Keyword Alignment", "score": <0-100>, "feedback": "<observation>", "suggestion": "<fix>" },
    { "name": "CV Structure & Format", "score": <0-100>, "feedback": "<observation>", "suggestion": "<fix>" },
    { "name": "Experience Relevance", "score": <0-100>, "feedback": "<observation>", "suggestion": "<fix>" },
    { "name": "Quantified Impact", "score": <0-100>, "feedback": "<observation>", "suggestion": "<fix>" },
    { "name": "ATS Compatibility", "score": <0-100>, "feedback": "<observation>", "suggestion": "<fix>" },
    { "name": "Narrative Clarity", "score": <0-100>, "feedback": "<observation>", "suggestion": "<fix>" }
  ],
  "keywords": { "matched": ["<keyword from CV>"], "missing": ["<keyword from JD not in CV>"] },
  "topActions": ["<action 1>", "<action 2>", "<action 3>"]
}`;

      const raw = await callClaudeSonnet(prompt, "You are an expert CV and career analyst. Return valid JSON only. Never invent experience or qualifications not present in the provided CV.");

      const parsed = JSON.parse(extractJSON(raw)) as FastScoreResult;
      const sessionId = nanoid();

      await storage.createSession({
        id: sessionId,
        userId: userId || null,
        cvText,
        jdText,
        jobTitle: jobTitle || extractJobTitle(jdText) || null,
        companyName: companyName || extractCompanyName(jdText) || null,
        score: parsed.overallScore,
        categories: JSON.stringify(parsed.categories),
        keywords: JSON.stringify(parsed.keywords),
        actions: JSON.stringify({ topActions: parsed.topActions, summary: parsed.summary, domainMatch: parsed.domainMatch }),
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

      const prompt = `You are a senior career coach. Deep analysis. Return ONLY valid JSON.

UPSKILLING HIERARCHY — recommend in this order:
1. Skills that strengthen the candidate's ROLE and FUNCTION broadly — e.g. for a CSM: advanced CRM certifications, data analytics for customer success, stakeholder management frameworks, product-led growth
2. Genuinely transferable skills across industries — SQL, Excel, project management (PMP/PRINCE2), AI tools directly relevant to their role
3. Industry-specific qualifications ONLY if the role legally requires a licence to practise — e.g. CeMAP for mortgage advisors, FCA authorisation for financial advisors, SQE for solicitors
NEVER recommend industry courses just because the target company operates in that sector — a CSM applying to a real estate firm does not need a real estate course.
The "reason" field must explain why this skill helps their career broadly, not just for this one application.
The "resource" must be a specific reputable course or certification (Coursera, LinkedIn Learning, CIPD, PMI, etc.) — never a generic suggestion.
CONTENT GROUNDING: Only recommend upskilling for genuine gaps evidenced by comparing the CV to the JD. Do not invent missing skills.

CV:
${cvText}

JOB DESCRIPTION:
${jdText}

Return:
{
  "upskilling": [
    { "skill": "<skill>", "reason": "<why this helps their career broadly>", "resource": "<specific course/cert with provider>" },
    { "skill": "<skill>", "reason": "<reason>", "resource": "<resource>" },
    { "skill": "<skill>", "reason": "<reason>", "resource": "<resource>" }
  ],
  "interviewPrep": [
    { "category": "Behavioural", "question": "<Tell me about a time... specific to their CV>", "hint": "<STAR guidance using their actual experience>", "whyAsked": "<what interviewer tests>" },
    { "category": "Behavioural", "question": "<Describe a situation... different scenario>", "hint": "<specific guidance>", "whyAsked": "<motivation>" },
    { "category": "Role-Specific", "question": "<Technical question tied to JD>", "hint": "<how to show depth>", "whyAsked": "<competency assessed>" },
    { "category": "Role-Specific", "question": "<Second technical question — different aspect>", "hint": "<guidance>", "whyAsked": "<motivation>" },
    { "category": "Situational", "question": "<How would you handle... hypothetical>", "hint": "<show process not just outcome>", "whyAsked": "<what it reveals>" },
    { "category": "Culture & Motivation", "question": "<Why this company specifically?>", "hint": "<answer authentically, not generically>", "whyAsked": "<what a good answer signals>" },
    { "category": "Strengths & Gaps", "question": "<Probes a visible gap in their CV>", "hint": "<address honestly, show growth>", "whyAsked": "<what interviewer looks for>" },
    { "category": "Curve Ball", "question": "<Unexpected — case study, estimation, or creative>", "hint": "<show thinking process>", "whyAsked": "<what it actually tests>" }
  ],
  "questionsToAsk": [
    "<Smart question to ask interviewer — shows strategic thinking>",
    "<Shows research into the company/role>",
    "<Shows long-term thinking>"
  ],
  "competitiveInsights": "<Who else is in the room — strong candidates for this role — how this CV compares honestly>"
}`;

      const raw = await callClaudeSonnet(prompt, "You are an expert CV and career analyst. Return valid JSON only. Never invent experience or qualifications not present in the provided CV.");

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
      const { cvText, jdText, sessionId, userId, companyIntel, reason } = req.body;
      if (!cvText || !jdText) return res.status(400).json({ error: "cvText and jdText required" });
      if (typeof cvText !== "string" || typeof jdText !== "string")
        return res.status(400).json({ error: "Invalid input types" });
      if (cvText.length > MAX_CV_LEN) return res.status(400).json({ error: "CV text too long" });
      if (jdText.length > MAX_JD_LEN) return res.status(400).json({ error: "JD text too long" });

      const intelContext = companyIntel ? `\nCOMPANY CONTEXT:\n${companyIntel}` : "";
      const reasonContext = reason && typeof reason === "string" ? `\n\nAdditional instruction: ${String(reason).slice(0, 500)}` : "";

      const prompt = `Rewrite this CV to be perfectly optimised for the job description. Return ONLY valid JSON.

ORIGINAL CV:
${cvText}

TARGET JOB DESCRIPTION:
${jdText}
${intelContext}${reasonContext}

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

      const rewriteRaw = await callPerplexity("sonar-pro", [
        { role: "system", content: "You are an expert CV writer. Return valid JSON only." },
        { role: "user", content: prompt },
      ]);

      const rewrite = JSON.parse(extractJSON(rewriteRaw));

      if (sessionId && typeof sessionId === "string") {
        await storage.updateSession(sessionId, {
          rewrite: JSON.stringify(rewrite),
        });
      }

      if (userId && typeof userId === "string") {
        const user = await storage.getUserById(userId);
        if (user) sendRewriteReadyEmail(user.email, user.name).catch(() => {});
      }

      res.json({ rewrite });
    } catch (err: any) {
      console.error("Rewrite error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Cover Letters ───────────────────────────────────────────────────────────
  app.post("/api/cover-letters", aiLimiter, async (req, res) => {
    try {
      const { cvText, jdText, sessionId, reason } = req.body;
      if (!cvText || !jdText) return res.status(400).json({ error: "cvText and jdText required" });
      if (typeof cvText !== "string" || typeof jdText !== "string")
        return res.status(400).json({ error: "Invalid input types" });
      if (cvText.length > MAX_CV_LEN) return res.status(400).json({ error: "CV text too long" });
      if (jdText.length > MAX_JD_LEN) return res.status(400).json({ error: "JD text too long" });

      const coverReasonContext = reason && typeof reason === "string" ? `\n\nAdditional instruction: ${String(reason).slice(0, 500)}\n` : "";

      const prompt = `Write 3 cover letter variations. Return ONLY valid JSON. No markdown.

IMPORTANT JSON RULES:
- Use double quotes for all strings
- No newlines inside string values - use spaces
- No truncation - complete all paragraphs fully

STRICT GROUNDING RULE: Every claim in the cover letter must be traceable to the candidate's CV. Do not mention languages they have not listed, qualifications they do not hold, skills they have not demonstrated, or future aspirations. Do not pad with generic soft skills. Each paragraph must reference a specific achievement, role, or skill from the CV. If the CV is thin, write a shorter honest letter — do not invent content.

CV:
${cvText.slice(0, 3000)}

JOB DESCRIPTION:
${jdText.slice(0, 1500)}
${coverReasonContext}
Return exactly:
{
  "coverLetters": [
    {
      "tone": "Direct & Confident",
      "desc": "Gets straight to the point. Bold claims, strong verbs.",
      "salutation": "Dear Hiring Manager,",
      "paragraphs": ["<opening — specific achievement, why this role>", "<evidence — 2-3 accomplishments with numbers>", "<closing — confident ask>"],
      "sign": "Best regards,"
    },
    {
      "tone": "Warm & Collaborative",
      "desc": "Emphasises teamwork, culture fit, shared values.",
      "salutation": "Dear Hiring Team,",
      "paragraphs": ["<opening — genuine enthusiasm, specific company ref>", "<evidence — achievements through collaboration>", "<closing — warm, forward-looking>"],
      "sign": "Warmly,"
    },
    {
      "tone": "Strategic & Data-Led",
      "desc": "Leads with metrics, market insight, business impact.",
      "salutation": "Dear Hiring Manager,",
      "paragraphs": ["<opening — business context, their metric>", "<evidence — data-driven achievements>", "<closing — value as business outcome>"],
      "sign": "Regards,"
    }
  ]
}`;

      const raw = await callClaudeSonnet(prompt, "You are an expert CV and career analyst. Return valid JSON only. Never invent experience or qualifications not present in the provided CV.");

      let jsonStr = extractJSON(raw);
      jsonStr = jsonStr.replace(/,(\s*[}\]])/g, "$1");
      jsonStr = jsonStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
      jsonStr = jsonStr.replace(/:\s*"([^"]*?)"/g, (match, p1) => {
        return ': "' + p1.replace(/\n/g, ' ').replace(/\r/g, ' ') + '"';
      });
      const parsed = JSON.parse(jsonStr);
      if (!parsed.coverLetters || !Array.isArray(parsed.coverLetters))
        throw new Error("Invalid cover letter response");
      if (sessionId && typeof sessionId === "string")
        await storage.updateSession(sessionId, { coverLetters: JSON.stringify(parsed.coverLetters) });
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

  // ── Free period check ────────────────────────────────────────────────────────
  function isFreePeriod(): boolean {
    const until = process.env.FREE_UNTIL;
    if (!until) return true;
    return new Date() < new Date(until);
  }

  const TOKEN_COSTS: Record<string, number> = {
    cv_score: 2, cv_rewrite: 8, cover_letter: 5, interview_prep: 6,
    linkedin: 10, linkedin_export: 10, salary: 5, predict: 3, fitplan: 15, jd_fetch: 1, jd_extract: 1,
  };

  async function logToken(email: string | undefined, action: string) {
    if (!email) return;
    try {
      await supabase.from("token_usage").insert({
        id: nanoid(), email, action,
        token_cost: TOKEN_COSTS[action] || 1,
        is_free: isFreePeriod(),
        created_at: new Date().toISOString(),
      });
    } catch { /* non-critical */ }
  }

  // ── Token summary (soft counter) ─────────────────────────────────────────────
  app.get("/api/tokens/summary", generalLimiter, async (req, res) => {
    try {
      const email = req.query.email as string | undefined;
      let tokensUsed = 0;
      if (email) {
        const { data } = await supabase
          .from("token_usage")
          .select("token_cost")
          .eq("email", email);
        tokensUsed = (data || []).reduce((s: number, r: any) => s + r.token_cost, 0);
      }
      res.json({
        tokensUsed,
        isFree: isFreePeriod(),
        freeUntil: process.env.FREE_UNTIL || null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── JD URL fetch ──────────────────────────────────────────────────────────────
  app.post("/api/jd/fetch", generalLimiter, async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== "string") return res.status(400).json({ error: "url required" });
      const text = await fetchPageText(url);
      res.json({ text, charCount: text.length });
    } catch (err: any) {
      // Return fallback:true so client shows paste field instead
      res.status(422).json({ error: err.message, fallback: true });
    }
  });

  // ── JD URL fetch via Perplexity (structured extraction) ───────────────────────
  app.post("/api/jd/fetch-url", generalLimiter, async (req, res) => {
    try {
      const { url, email } = req.body;
      if (!url || typeof url !== "string") return res.status(400).json({ error: "url required" });
      if (!/^https?:\/\//i.test(url.trim())) return res.status(400).json({ error: "Invalid URL — must start with http:// or https://" });

      const raw = await callPerplexity("sonar-pro", [
        { role: "system", content: 'Extract the full job description from this URL. Return JSON only: { "title": string, "company": string, "location": string, "description": string }. The description should contain the full requirements, responsibilities, and qualifications. If you cannot access the page return { "error": string }.' },
        { role: "user", content: `Extract the job description from: ${url.trim()}` },
      ], 4, true, 2000);

      const data = JSON.parse(extractJSON(raw));
      if (data.error) return res.status(422).json({ error: "Couldn't extract the job description from this URL — try pasting the text instead" });
      if (!data.description) return res.status(422).json({ error: "Couldn't extract the job description from this URL — try pasting the text instead" });

      await logToken(email, "jd_fetch");
      return res.json({ title: data.title || "", company: data.company || "", location: data.location || "", description: data.description });
    } catch (err: any) {
      console.error("JD fetch-url error:", err);
      return res.status(422).json({ error: "Couldn't extract the job description from this URL — try pasting the text instead" });
    }
  });

  // ── JD screenshot extract (Claude vision, multi-image) ────────────────────────
  app.post("/api/jd/extract-screenshot", generalLimiter, upload.array("images", 4), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) return res.status(400).json({ error: "At least one image required" });

      const oversized = files.filter((f) => f.size > 5 * 1024 * 1024);
      if (oversized.length > 0) return res.status(400).json({ error: "Images must be under 5 MB each" });

      const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error("ANTHROPIC_API_KEY not set");

      const imageBlocks = files.map((f) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: f.mimetype as "image/png" | "image/jpeg" | "image/webp",
          data: f.buffer.toString("base64"),
        },
      }));

      const userContent = [
        ...imageBlocks,
        { type: "text" as const, text: "Extract the job description from these screenshots." },
      ];

      const apiRes = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": key,
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          system: 'Extract the complete job description from these screenshot(s) of a job listing. They may be sequential screenshots of the same listing — combine all text. Return JSON only: { "title": string, "company": string, "location": string, "description": string }. If text is unreadable return { "error": string }.',
          messages: [{ role: "user", content: userContent }],
        }),
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        throw new Error(`Claude API error ${apiRes.status}: ${errText}`);
      }

      const apiData = (await apiRes.json()) as any;
      const rawText = (apiData.content as any[]).filter((b: any) => b.type === "text").map((b: any) => b.text as string).join("");

      const data = JSON.parse(extractJSON(rawText));
      if (data.error) return res.status(422).json({ error: "Couldn't read the screenshots clearly — try pasting the text instead" });
      if (!data.description) return res.status(422).json({ error: "Couldn't read the screenshots clearly — try pasting the text instead" });

      const { email } = req.body;
      await logToken(email, "jd_extract");
      return res.json({ title: data.title || "", company: data.company || "", location: data.location || "", description: data.description });
    } catch (err: any) {
      console.error("JD extract-screenshot error:", err);
      return res.status(422).json({ error: "Couldn't read the screenshots clearly — try pasting the text instead" });
    }
  });

  // ── LinkedIn profile URL fetch via Perplexity ────────────────────────────────
  app.post("/api/linkedin/fetch-url", generalLimiter, async (req, res) => {
    try {
      const { url, email } = req.body;
      if (!url || typeof url !== "string") return res.status(400).json({ error: "url required" });
      if (!/^https?:\/\//i.test(url.trim())) return res.status(400).json({ error: "Invalid URL — must start with http:// or https://" });

      const raw = await callPerplexity("sonar-pro", [
        { role: "system", content: 'Extract the full LinkedIn profile text from this URL. Return JSON only: { "profileText": string }. The profileText should include the person\'s headline, about section, all work experience entries with descriptions, education, skills, certifications, and any other visible profile content. If you cannot access the page return { "error": string }.' },
        { role: "user", content: `Extract the LinkedIn profile text from: ${url.trim()}` },
      ], 4, true, 3000);

      const data = JSON.parse(extractJSON(raw));
      if (data.error) return res.status(422).json({ error: "Couldn't extract the profile from this URL — try pasting the text instead" });
      if (!data.profileText) return res.status(422).json({ error: "Couldn't extract the profile from this URL — try pasting the text instead" });

      await logToken(email, "jd_fetch");
      return res.json({ profileText: data.profileText });
    } catch (err: any) {
      console.error("LinkedIn fetch-url error:", err);
      return res.status(422).json({ error: "Couldn't extract the profile from this URL — try pasting the text instead" });
    }
  });

  // ── LinkedIn profile screenshot extract (Claude vision, multi-image) ──────────
  app.post("/api/linkedin/extract-screenshot", generalLimiter, upload.array("images", 4), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) return res.status(400).json({ error: "At least one image required" });

      const oversized = files.filter((f) => f.size > 5 * 1024 * 1024);
      if (oversized.length > 0) return res.status(400).json({ error: "Images must be under 5 MB each" });

      const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error("ANTHROPIC_API_KEY not set");

      const imageBlocks = files.map((f) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: f.mimetype as "image/png" | "image/jpeg" | "image/webp",
          data: f.buffer.toString("base64"),
        },
      }));

      const userContent = [
        ...imageBlocks,
        { type: "text" as const, text: "Extract the LinkedIn profile text from these screenshots." },
      ];

      const apiRes = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": key,
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 3000,
          system: 'Extract the full LinkedIn profile text from these screenshot(s). They may be sequential screenshots of the same profile — combine all content. Include the headline, about section, all work experience entries with descriptions, education, skills, certifications, and any other visible profile sections. Return JSON only: { "profileText": string }. If text is unreadable return { "error": string }.',
          messages: [{ role: "user", content: userContent }],
        }),
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        throw new Error(`Claude API error ${apiRes.status}: ${errText}`);
      }

      const apiData = (await apiRes.json()) as any;
      const rawText = (apiData.content as any[]).filter((b: any) => b.type === "text").map((b: any) => b.text as string).join("");

      const data = JSON.parse(extractJSON(rawText));
      if (data.error) return res.status(422).json({ error: "Couldn't read the screenshots clearly — try pasting the text instead" });
      if (!data.profileText) return res.status(422).json({ error: "Couldn't read the screenshots clearly — try pasting the text instead" });

      const { email } = req.body;
      await logToken(email, "jd_extract");
      return res.json({ profileText: data.profileText });
    } catch (err: any) {
      console.error("LinkedIn extract-screenshot error:", err);
      return res.status(422).json({ error: "Couldn't read the screenshots clearly — try pasting the text instead" });
    }
  });

  // ── LinkedIn PDF export ───────────────────────────────────────────────────────
  app.post("/api/linkedin/export", generalLimiter, async (req, res) => {
    try {
      const { analysis, candidateName } = req.body;
      if (!analysis) return res.status(400).json({ error: "analysis required" });
      const a = typeof analysis === "string" ? JSON.parse(analysis) : analysis;
      const name = candidateName || "Your Profile";
      const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

      const scoreColor = (s: number) => s >= 75 ? "#16A34A" : s >= 50 ? "#0A66C2" : "#DC2626";

      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>LinkedIn Optimisation — ${name}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Georgia,serif;color:#1a1a2e;background:#fff;font-size:11pt;line-height:1.65}
.page{max-width:780px;margin:0 auto;padding:48px 52px}
.header{border-bottom:3px solid #0A66C2;padding-bottom:20px;margin-bottom:28px}
.header-row{display:flex;justify-content:space-between;align-items:flex-start}
.brand{font-size:12px;font-weight:700;color:#0A66C2;letter-spacing:.06em;text-transform:uppercase}
.title{font-size:22pt;font-weight:700;margin:8px 0 4px;line-height:1.2}
.subtitle{font-size:10pt;color:#666}
.badge{background:#0A66C2;color:#fff;border-radius:50%;width:64px;height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0}
.badge-num{font-size:20pt;font-weight:700;line-height:1}
.badge-lbl{font-size:7pt;letter-spacing:.04em}
.sec{margin-bottom:28px}
.sec-title{font-size:9pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#0A66C2;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin-bottom:14px}
.hl-box{background:#EFF6FF;border-left:4px solid #0A66C2;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:10px}
.hl-text{font-size:13pt;font-weight:600;margin-bottom:4px}
.hl-alt{font-size:10pt;color:#555;padding:5px 0;border-bottom:1px solid #f0f0f0}
.about{font-size:10.5pt;color:#333;line-height:1.8;background:#f9fafb;padding:16px;border-radius:8px;white-space:pre-wrap}
.rw-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.rw-role{font-size:9pt;font-weight:600;color:#555;margin-bottom:6px}
.rw-lbl{font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px}
.rw-before{background:#FEF2F2;border:1px solid #FECACA;padding:10px 12px;border-radius:6px}
.rw-before .rw-lbl{color:#DC2626}
.rw-after{background:#F0FDF4;border:1px solid #BBF7D0;padding:10px 12px;border-radius:6px}
.rw-after .rw-lbl{color:#16A34A}
.rw-text{font-size:9.5pt;color:#333;line-height:1.5}
.pills{display:flex;flex-wrap:wrap;gap:6px}
.pill{background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;padding:3px 10px;border-radius:100px;font-size:9pt;font-weight:600}
.pill.kw{background:#F0FDF4;color:#15803D;border-color:#BBF7D0}
.actions{list-style:none}
.actions li{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:10.5pt}
.actions li:last-child{border-bottom:none}
.act-num{font-weight:700;color:#0A66C2;flex-shrink:0}
.post-card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:10px}
.post-angle{font-size:8pt;font-weight:700;color:#0A66C2;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.post-hook{font-weight:700;color:#1a1a2e;margin-bottom:6px;font-size:10.5pt}
.post-body{font-size:9.5pt;color:#444;line-height:1.65}
.scores{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
.sc{text-align:center;background:#f9fafb;border-radius:8px;padding:10px 6px}
.sc-num{font-size:16pt;font-weight:700}
.sc-lbl{font-size:7.5pt;color:#666;margin-top:2px}
.gap-box{background:#FFFBEB;border:1px solid #FDE68A;padding:12px 16px;border-radius:8px;font-size:10.5pt;line-height:1.65}
.footer{border-top:1px solid #e5e7eb;margin-top:40px;padding-top:12px;display:flex;justify-content:space-between;font-size:8.5pt;color:#999}
@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><div class="page">

<div class="header"><div class="header-row">
<div><div class="brand">usefulshxt · LinkedIn Optimisation</div>
<div class="title">${name}</div>
<div class="subtitle">Target: ${a.targetSpace || ""} · ${date}</div></div>
<div class="badge"><div class="badge-num">${a.overallScore || "—"}</div><div class="badge-lbl">/100</div></div>
</div></div>

${a.sectionScores ? `<div class="sec"><div class="sec-title">Section Scores</div><div class="scores">
${a.sectionScores.map((s: any) => `<div class="sc"><div class="sc-num" style="color:${scoreColor(s.score)}">${s.score}</div><div class="sc-lbl">${s.section}</div></div>`).join("")}
</div></div>` : ""}

<div class="sec"><div class="sec-title">Optimised Headline</div>
<div class="hl-box"><div class="hl-text">${a.headline || ""}</div></div>
${(a.headlineAlternatives || []).map((h: string) => `<div class="hl-alt">Alt: ${h}</div>`).join("")}
</div>

<div class="sec"><div class="sec-title">Rewritten About Section</div>
<div class="about">${a.about || ""}</div></div>

${a.experienceRewrites?.length ? `<div class="sec"><div class="sec-title">Experience Rewrites</div>
${a.experienceRewrites.map((r: any) => `<div class="rw-role">${r.role}</div><div class="rw-grid">
<div class="rw-before"><div class="rw-lbl">Before</div><div class="rw-text">${r.before}</div></div>
<div class="rw-after"><div class="rw-lbl">After</div><div class="rw-text">${r.after}</div></div>
</div>`).join("")}</div>` : ""}

<div class="sec"><div class="sec-title">Skills to Add</div><div class="pills">
${(a.skillsToAdd || []).map((s: string) => `<div class="pill">${s}</div>`).join("")}
</div></div>

<div class="sec"><div class="sec-title">Recruiter Keywords</div><div class="pills">
${(a.recruiterKeywords || []).map((k: string) => `<div class="pill kw">${k}</div>`).join("")}
</div></div>

${a.gapAnalysis ? `<div class="sec"><div class="sec-title">Gap Analysis</div><div class="gap-box">${a.gapAnalysis}</div></div>` : ""}

<div class="sec"><div class="sec-title">Priority Actions</div><ul class="actions">
${(a.priorityActions || []).map((p: string, i: number) => `<li><span class="act-num">${i + 1}.</span><span>${p}</span></li>`).join("")}
</ul></div>

${a.posts?.length ? `<div class="sec"><div class="sec-title">5 LinkedIn Posts</div>
${a.posts.map((p: any) => `<div class="post-card"><div class="post-angle">${p.angle}</div><div class="post-hook">${p.hook}</div><div class="post-body">${p.body}</div></div>`).join("")}
</div>` : ""}

${a.featuredSection ? `<div class="sec"><div class="sec-title">Featured Section Idea</div><div class="gap-box">${a.featuredSection}</div></div>` : ""}

<div class="footer"><span>usefulshxt.com</span><span>${date}</span></div>
</div></body></html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="linkedin-${Date.now()}.html"`);
      res.send(html);
    } catch (err: any) {
      console.error("LinkedIn export error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── CV analysis PDF export ────────────────────────────────────────────────────
  app.post("/api/cv/export", generalLimiter, async (req, res) => {
    try {
      const { sessionId, candidateName } = req.body;
      if (!sessionId) return res.status(400).json({ error: "sessionId required" });

      const session = await storage.getSession(sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const name = candidateName || "Your CV";
      const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const score = session.score || 0;
      const cats: any[] = session.categories ? JSON.parse(session.categories) : [];
      const kw: any = session.keywords ? JSON.parse(session.keywords) : { matched: [], missing: [] };
      const actions: string[] = session.actions ? JSON.parse(session.actions) : [];
      const deep: any = session.deepAnalysis ? JSON.parse(session.deepAnalysis) : null;

      const scoreColor = (s: number) => s >= 75 ? "#16A34A" : s >= 50 ? "#D97706" : "#DC2626";
      const scoreLabel = (s: number) => s >= 75 ? "Strong Match" : s >= 50 ? "Good Start" : "Needs Work";

      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>CV Analysis — ${name}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Georgia,serif;color:#1a1a2e;background:#fff;font-size:11pt;line-height:1.65}
.page{max-width:780px;margin:0 auto;padding:48px 52px}
.header{border-bottom:3px solid #3B82F6;padding-bottom:20px;margin-bottom:28px}
.header-row{display:flex;justify-content:space-between;align-items:flex-start}
.brand{font-size:12px;font-weight:700;color:#3B82F6;letter-spacing:.06em;text-transform:uppercase}
.title{font-size:22pt;font-weight:700;margin:8px 0 4px}
.subtitle{font-size:10pt;color:#666}
.badge{border-radius:50%;width:80px;height:80px;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;border:4px solid ${scoreColor(score)}}
.badge-num{font-size:24pt;font-weight:700;color:${scoreColor(score)};line-height:1}
.badge-lbl{font-size:8pt;color:#666}
.sec{margin-bottom:28px}
.sec-title{font-size:9pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#3B82F6;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin-bottom:14px}
.verdict{background:#EFF6FF;border-left:4px solid #3B82F6;padding:14px 18px;border-radius:0 8px 8px 0;font-size:11pt;color:#1a1a2e;margin-bottom:14px}
.cat-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cat{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px}
.cat-name{font-size:9pt;font-weight:700;color:#1a1a2e;margin-bottom:4px}
.cat-score{font-size:14pt;font-weight:700;margin-bottom:4px}
.cat-feedback{font-size:9pt;color:#555;line-height:1.5}
.bar-wrap{background:#e5e7eb;border-radius:100px;height:6px;margin:6px 0}
.bar-fill{height:100%;border-radius:100px}
.pills{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.pill{padding:3px 10px;border-radius:100px;font-size:9pt;font-weight:600}
.pill-green{background:#F0FDF4;color:#15803D;border:1px solid #BBF7D0}
.pill-red{background:#FEF2F2;color:#DC2626;border:1px solid #FECACA}
.pill-blue{background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE}
.actions{list-style:none}
.actions li{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:10.5pt}
.actions li:last-child{border-bottom:none}
.act-num{font-weight:700;color:#3B82F6;flex-shrink:0}
.q-card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:10px}
.q-cat{font-size:8pt;font-weight:700;color:#3B82F6;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.q-text{font-weight:700;color:#1a1a2e;margin-bottom:6px;font-size:10.5pt}
.q-hint{font-size:9.5pt;color:#555;line-height:1.6;margin-bottom:4px}
.q-why{font-size:9pt;color:#888;font-style:italic}
.skill-card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px}
.skill-name{font-weight:700;color:#1a1a2e;margin-bottom:3px}
.skill-reason{font-size:9.5pt;color:#555;margin-bottom:3px}
.skill-resource{font-size:9pt;color:#3B82F6}
.footer{border-top:1px solid #e5e7eb;margin-top:40px;padding-top:12px;display:flex;justify-content:space-between;font-size:8.5pt;color:#999}
@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><div class="page">

<div class="header"><div class="header-row">
<div><div class="brand">usefulshxt · CV Analysis Report</div>
<div class="title">${name}</div>
<div class="subtitle">${session.jobTitle ? `${session.jobTitle}${session.companyName ? ` at ${session.companyName}` : ""}` : "CV Analysis"} · ${date}</div></div>
<div class="badge"><div class="badge-num">${score}</div><div class="badge-lbl">${scoreLabel(score)}</div></div>
</div></div>

${cats.length ? `<div class="sec"><div class="sec-title">Score Breakdown</div>
<div class="cat-grid">${cats.map((c: any) => `
<div class="cat">
<div class="cat-name">${c.name}</div>
<div class="cat-score" style="color:${scoreColor(c.score)}">${c.score}/100</div>
<div class="bar-wrap"><div class="bar-fill" style="width:${c.score}%;background:${scoreColor(c.score)}"></div></div>
<div class="cat-feedback">${c.feedback || ""}</div>
</div>`).join("")}</div></div>` : ""}

${kw.missing?.length ? `<div class="sec"><div class="sec-title">Keywords</div>
<div style="margin-bottom:8px"><strong style="font-size:9pt;color:#15803D">Matched</strong></div>
<div class="pills">${(kw.matched || []).slice(0, 12).map((k: string) => `<div class="pill pill-green">${k}</div>`).join("")}</div>
<div style="margin:10px 0 8px"><strong style="font-size:9pt;color:#DC2626">Missing from JD</strong></div>
<div class="pills">${(kw.missing || []).slice(0, 12).map((k: string) => `<div class="pill pill-red">${k}</div>`).join("")}</div>
</div>` : ""}

${actions.length ? `<div class="sec"><div class="sec-title">Priority Actions</div><ul class="actions">
${actions.map((a: string, i: number) => `<li><span class="act-num">${i + 1}.</span><span>${a}</span></li>`).join("")}
</ul></div>` : ""}

${deep?.upskilling?.length ? `<div class="sec"><div class="sec-title">Upskilling Recommendations</div>
${deep.upskilling.map((s: any) => `<div class="skill-card">
<div class="skill-name">${s.skill}</div>
<div class="skill-reason">${s.reason}</div>
<div class="skill-resource">→ ${s.resource}</div>
</div>`).join("")}</div>` : ""}

${deep?.interviewPrep?.length ? `<div class="sec"><div class="sec-title">Interview Preparation</div>
${deep.interviewPrep.map((q: any) => `<div class="q-card">
<div class="q-cat">${q.category || "Question"}</div>
<div class="q-text">${q.question}</div>
<div class="q-hint">${q.hint}</div>
${q.whyAsked ? `<div class="q-why">Why asked: ${q.whyAsked}</div>` : ""}
</div>`).join("")}</div>` : ""}

${deep?.questionsToAsk?.length ? `<div class="sec"><div class="sec-title">Questions to Ask the Interviewer</div><ul class="actions">
${deep.questionsToAsk.map((q: string, i: number) => `<li><span class="act-num">${i + 1}.</span><span>${q}</span></li>`).join("")}
</ul></div>` : ""}

${deep?.competitiveInsights ? `<div class="sec"><div class="sec-title">Competitive Landscape</div>
<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;font-size:10.5pt;line-height:1.7">${deep.competitiveInsights}</div></div>` : ""}

<div class="footer"><span>usefulshxt.com</span><span>${date}</span></div>
</div></body></html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="cv-analysis-${sessionId}.html"`);
      res.send(html);
    } catch (err: any) {
      console.error("CV export error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── FitPlan PDF export ────────────────────────────────────────────────────────
  app.post("/api/fitplan/export", generalLimiter, async (req, res) => {
    try {
      const { plan, targets, intake, candidateName } = req.body;
      if (!plan) return res.status(400).json({ error: "plan required" });

      const name = candidateName || "Your Plan";
      const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const t = targets || {};
      const p = typeof plan === "string" ? JSON.parse(plan) : plan;

      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>FitPlan — ${name}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Georgia,serif;color:#1a1a2e;background:#fff;font-size:11pt;line-height:1.65}
.page{max-width:780px;margin:0 auto;padding:48px 52px}
.header{border-bottom:3px solid #10B981;padding-bottom:20px;margin-bottom:28px}
.brand{font-size:12px;font-weight:700;color:#10B981;letter-spacing:.06em;text-transform:uppercase}
.title{font-size:22pt;font-weight:700;margin:8px 0 4px}
.subtitle{font-size:10pt;color:#666}
.sec{margin-bottom:28px}
.sec-title{font-size:9pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#10B981;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin-bottom:14px}
.macro-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:8px}
.macro{text-align:center;background:#f9fafb;border-radius:8px;padding:12px}
.macro-val{font-size:18pt;font-weight:700}
.macro-unit{font-size:9pt;color:#1a1a2e}
.macro-lbl{font-size:8pt;color:#666;margin-top:2px}
.day-card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:10px}
.day-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #e5e7eb}
.day-name{font-weight:700;font-size:12pt}
.day-meta{font-size:9pt;color:#666}
.meal{margin-bottom:8px}
.meal-name{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#10B981;margin-bottom:2px}
.meal-desc{font-size:10pt;color:#333;line-height:1.5}
.meal-meta{font-size:8.5pt;color:#888;margin-top:2px}
.quality-badge{display:inline-block;background:#F0FDF4;color:#15803D;border:1px solid #BBF7D0;padding:1px 7px;border-radius:100px;font-size:8pt;font-weight:700;margin-left:6px}
.ex-card{margin-bottom:8px;padding:8px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:6px}
.ex-name{font-weight:700;font-size:10.5pt;margin-bottom:2px}
.ex-meta{font-size:9pt;color:#10B981;font-weight:600;margin-bottom:2px}
.ex-note{font-size:9pt;color:#666}
.grocery-cat{margin-bottom:12px}
.grocery-cat-name{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#10B981;margin-bottom:6px}
.grocery-item{display:flex;justify-content:space-between;align-items:flex-start;padding:5px 0;border-bottom:1px solid #f5f5f5;font-size:10pt}
.grocery-item:last-child{border-bottom:none}
.grocery-note{font-size:8.5pt;color:#888;margin-top:1px}
.grocery-price{font-weight:600;color:#1a1a2e;flex-shrink:0;margin-left:12px}
.total-cost{background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:14px;text-align:center}
.total-cost-val{font-size:18pt;font-weight:700;color:#15803D}
.total-cost-lbl{font-size:10pt;color:#555;margin-top:4px}
.total-cost-note{font-size:9pt;color:#888;margin-top:6px}
.tip-list{list-style:none}
.tip-list li{display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #f0f0f0;font-size:10.5pt}
.tip-list li:last-child{border-bottom:none}
.tip-num{font-weight:700;color:#10B981;flex-shrink:0}
.footer{border-top:1px solid #e5e7eb;margin-top:40px;padding-top:12px;display:flex;justify-content:space-between;font-size:8.5pt;color:#999}
@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><div class="page">

<div class="header">
<div class="brand">usefulshxt · FitPlan</div>
<div class="title">${name}</div>
<div class="subtitle">Goal: ${intake?.goal?.replace(/_/g, " ") || "Personal"} · ${date}</div>
</div>

${p.summary ? `<div class="sec"><div class="sec-title">Your Plan Summary</div>
<div style="background:#F0FDF4;border-left:4px solid #10B981;padding:14px 18px;border-radius:0 8px 8px 0;font-size:11pt;line-height:1.7">${p.summary}</div></div>` : ""}

<div class="sec"><div class="sec-title">Daily Targets</div>
<div class="macro-grid">
<div class="macro"><div class="macro-val" style="color:#D97706">${t.targetCalories || "—"}</div><div class="macro-unit">kcal</div><div class="macro-lbl">Calories</div></div>
<div class="macro"><div class="macro-val" style="color:#10B981">${t.macros?.proteinG || "—"}</div><div class="macro-unit">g</div><div class="macro-lbl">Protein</div></div>
<div class="macro"><div class="macro-val" style="color:#3B82F6">${t.macros?.carbsG || "—"}</div><div class="macro-unit">g</div><div class="macro-lbl">Carbs</div></div>
<div class="macro"><div class="macro-val" style="color:#8B5CF6">${t.macros?.fatG || "—"}</div><div class="macro-unit">g</div><div class="macro-lbl">Fat</div></div>
</div></div>

${p.weeklyMeals?.length ? `<div class="sec"><div class="sec-title">7-Day Meal Plan</div>
${p.weeklyMeals.map((day: any) => `<div class="day-card">
<div class="day-header">
<div class="day-name">${day.day}</div>
<div class="day-meta">${day.totalCalories} kcal · ${day.totalProteinG}g protein · Est. ${day.estimatedDayCost || "—"}</div>
</div>
${day.meals.map((m: any) => `<div class="meal">
<div class="meal-name">${m.name}${m.qualityScore ? `<span class="quality-badge">★ ${m.qualityScore}/10</span>` : ""}</div>
<div class="meal-desc">${m.description}</div>
<div class="meal-meta">${m.calories} kcal · ${m.proteinG}g protein${m.estimatedCost ? ` · ${m.estimatedCost}` : ""}${m.qualityNotes ? ` · ${m.qualityNotes}` : ""}</div>
</div>`).join("")}
</div>`).join("")}</div>` : ""}

${p.weeklyTraining?.length ? `<div class="sec"><div class="sec-title">Training Split</div>
${p.weeklyTraining.map((day: any) => `<div class="day-card">
<div class="day-header">
<div class="day-name">${day.day}</div>
<div class="day-meta">${day.type}${day.focus ? ` · ${day.focus}` : ""}${day.duration ? ` · ${day.duration}` : ""}</div>
</div>
${(day.exercises || []).map((ex: any) => `<div class="ex-card">
<div class="ex-name">${ex.name}</div>
<div class="ex-meta">${ex.sets} sets × ${ex.reps} · Rest: ${ex.rest}</div>
${ex.notes ? `<div class="ex-note">${ex.notes}</div>` : ""}
</div>`).join("")}
</div>`).join("")}</div>` : ""}

${p.groceryList ? `<div class="sec"><div class="sec-title">Weekly Grocery List</div>
${Object.entries(p.groceryList).map(([cat, items]: [string, any]) => `
<div class="grocery-cat">
<div class="grocery-cat-name">${cat}</div>
${(items as any[]).map((item: any) => `<div class="grocery-item">
<div><div>${item.item || item}</div>${item.qualityNote ? `<div class="grocery-note">${item.qualityNote}</div>` : ""}</div>
${item.estimatedPrice ? `<div class="grocery-price">${item.estimatedPrice}</div>` : ""}
</div>`).join("")}
</div>`).join("")}

${p.estimatedWeeklyCost ? `<div class="total-cost">
<div class="total-cost-val">${p.estimatedWeeklyCost}</div>
<div class="total-cost-lbl">Estimated weekly grocery cost</div>
${p.costBreakdown ? `<div class="total-cost-note">${p.costBreakdown}</div>` : ""}
</div>` : ""}
</div>` : ""}

${p.progressionPlan ? `<div class="sec"><div class="sec-title">Progression Plan</div>
<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;font-size:10.5pt;line-height:1.7">${p.progressionPlan}</div></div>` : ""}

${p.keyTips?.length ? `<div class="sec"><div class="sec-title">Key Tips</div><ul class="tip-list">
${p.keyTips.map((t: string, i: number) => `<li><span class="tip-num">${i + 1}.</span><span>${t}</span></li>`).join("")}
</ul></div>` : ""}

<div class="footer"><span>usefulshxt.com</span><span>${date}</span></div>
</div></body></html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="fitplan-${Date.now()}.html"`);
      res.send(html);
    } catch (err: any) {
      console.error("FitPlan export error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Predict ───────────────────────────────────────────────────────────────────
  app.get("/api/predict/:sport", generalLimiter, async (req, res) => {
    try {
      const sport = req.params.sport;
      const validSports = ["worldcup", "premier_league", "ipl"];
      if (!validSports.includes(sport))
        return res.status(400).json({ error: "Invalid sport" });

      const today = new Date().toISOString().split("T")[0];

      // Check Supabase cache — one prediction per sport per day
      const { data: cached } = await supabase
        .from("predictions")
        .select("*")
        .eq("sport", sport)
        .eq("match_date", today)
        .order("created_at", { ascending: false })
        .limit(1);

      if (cached && cached.length > 0) {
        const c = cached[0];
        return res.json({
          match: { homeTeam: c.home_team, awayTeam: c.away_team, matchDate: c.match_date, competition: c.competition, venue: c.venue, kickoff: c.kickoff },
          prediction: { pick: c.pick, pickDescription: c.pick_description, confidence: c.confidence, reasoning: c.reasoning, keyFactors: JSON.parse(c.key_factors || "[]"), matchContext: c.match_context, riskNote: c.risk_note, alternativeAngle: c.alternative_angle, sport, predictionId: c.id },
          fromCache: true,
        });
      }

      const sportLabel = sport === "worldcup" ? "2026 FIFA World Cup" : sport === "premier_league" ? "English Premier League 2024/25" : "Indian Premier League 2025";

      // Step 1: Haiku — get today's fixtures
      const fixtureRaw = await callClaudeHaiku(
        `What ${sportLabel} matches are scheduled for ${today} or the next 24 hours? List up to 3. Return ONLY valid JSON: {"matches":[{"homeTeam":"<team>","awayTeam":"<team>","matchDate":"${today}","competition":"${sportLabel}","venue":"<venue>","kickoff":"<time>"}]} If none, return {"matches":[]}`,
        "You are a sports data expert. Return valid JSON only."
      );
      const fixtures = JSON.parse(extractJSON(fixtureRaw));
      const matches = fixtures.matches || [];

      if (!matches.length)
        return res.json({ prediction: null, message: "No matches scheduled in the next 24 hours." });

      const match = matches[0];

      // Step 2: Sonnet — deep prediction
      const predRaw = await callClaudeSonnet(
        `You are the world's most respected sports analyst making your single highest-conviction prediction.

MATCH: ${match.homeTeam} vs ${match.awayTeam}
COMPETITION: ${match.competition}
DATE: ${match.matchDate}
VENUE: ${match.venue || "TBC"}

Analyse: current form (last 5), head-to-head, key injuries, tactical matchup, pressure/stakes. Make ONE decisive pick.

Return ONLY valid JSON:
{
  "pick": "<exact team name or Draw>",
  "pickDescription": "<e.g. England to win or Under 2.5 goals>",
  "confidence": <60-95>,
  "reasoning": "<3-4 sentences specific evidence>",
  "keyFactors": ["<specific factor with data>","<factor>","<factor>"],
  "matchContext": "<1-2 sentences on what this match means>",
  "riskNote": "<honest risk>",
  "alternativeAngle": "<if you had to bet the other side>"
}`,
        "You are the world's most respected sports analyst. Be specific. Evidence-based. Decisive. Return valid JSON only."
      );
      const pred = JSON.parse(extractJSON(predRaw));

      // Store in Supabase
      const predId = nanoid();
      await supabase.from("predictions").insert({
        id: predId, sport,
        home_team: match.homeTeam, away_team: match.awayTeam,
        match_date: match.matchDate, competition: match.competition,
        venue: match.venue || null, kickoff: match.kickoff || null,
        pick: pred.pick, pick_description: pred.pickDescription,
        confidence: pred.confidence, reasoning: pred.reasoning,
        key_factors: JSON.stringify(pred.keyFactors),
        match_context: pred.matchContext, risk_note: pred.riskNote,
        alternative_angle: pred.alternativeAngle,
        created_at: new Date().toISOString(),
      });

      res.json({
        match: { homeTeam: match.homeTeam, awayTeam: match.awayTeam, matchDate: match.matchDate, competition: match.competition, venue: match.venue, kickoff: match.kickoff },
        prediction: { ...pred, sport, predictionId: predId },
        otherMatches: matches.slice(1).map((m: any) => ({ homeTeam: m.homeTeam, awayTeam: m.awayTeam, kickoff: m.kickoff })),
        fromCache: false,
      });
    } catch (err: any) {
      console.error("Predict error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Pick logging ──────────────────────────────────────────────────────────────
  app.post("/api/predict/pick", generalLimiter, async (req, res) => {
    try {
      const { email, predictionId, sport, homeTeam, awayTeam, matchDate, userPick, claudePick, claudeConfidence } = req.body;
      if (!email || !userPick || !claudePick)
        return res.status(400).json({ error: "email, userPick, and claudePick required" });

      await supabase.from("user_picks").insert({
        id: nanoid(), email,
        prediction_id: predictionId || "",
        sport: sport || "unknown",
        home_team: homeTeam || "", away_team: awayTeam || "",
        match_date: matchDate || new Date().toISOString().split("T")[0],
        user_pick: userPick, claude_pick: claudePick,
        claude_confidence: claudeConfidence || 0,
        created_at: new Date().toISOString(),
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Accuracy stats
  app.get("/api/predict/accuracy", generalLimiter, async (req, res) => {
    try {
      const { data: picks } = await supabase
        .from("user_picks")
        .select("claude_outcome, user_outcome")
        .neq("claude_outcome", "pending");

      const total = (picks || []).length;
      const claudeCorrect = (picks || []).filter((p: any) => p.claude_outcome === "correct").length;
      const userCorrect = (picks || []).filter((p: any) => p.user_outcome === "correct").length;

      res.json({
        claudeAccuracy: total ? Math.round((claudeCorrect / total) * 100) : null,
        userAccuracy: total ? Math.round((userCorrect / total) * 100) : null,
        totalPredictions: total,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── FitPlan generate ──────────────────────────────────────────────────────────
  app.post("/api/fitplan/generate", aiLimiter, async (req, res) => {
    try {
      const { goal, ageYears, heightCm, weightKg, targetWeightKg, activityLevel, trainingDaysPerWeek, equipment, dietaryRestrictions, healthNotes, email } = req.body;
      if (!goal || !ageYears || !heightCm || !weightKg || !activityLevel || !trainingDaysPerWeek || !equipment)
        return res.status(400).json({ error: "Missing required fields" });

      const bmr = 10 * Number(weightKg) + 6.25 * Number(heightCm) - 5 * Number(ageYears) + 5;
      const mults: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
      const tdee = Math.round(bmr * (mults[activityLevel] || 1.55));
      const targetCalories = goal === "lose_fat" ? tdee - 400 : goal === "build_muscle" ? tdee + 250 : tdee;
      const proteinG = Math.round(Number(weightKg) * 2.0);
      const fatG = Math.round((targetCalories * 0.25) / 9);
      const carbsG = Math.round((targetCalories - proteinG * 4 - fatG * 9) / 4);
      const restrictions = Array.isArray(dietaryRestrictions) && dietaryRestrictions.length ? dietaryRestrictions.join(", ") : "None";
      const equipLabel = equipment === "none" ? "Bodyweight only" : equipment === "home_basic" ? "Dumbbells + bands" : equipment === "home_full" ? "Full home gym" : "Commercial gym";
      const goalLabel = goal === "lose_fat" ? "Fat Loss" : goal === "build_muscle" ? "Muscle Building" : goal === "maintain" ? "Maintenance" : goal === "improve_fitness" ? "General Fitness" : "Athletic Performance";

      const raw = await callClaudeSonnet(
        `You are an elite PT and dietitian. Create a fully personalised 7-day plan. Return ONLY valid JSON.

CLIENT: ${goalLabel} | ${ageYears}y | ${heightCm}cm | ${weightKg}kg${targetWeightKg ? ` → ${targetWeightKg}kg` : ""} | ${activityLevel} | ${trainingDaysPerWeek} days/week | ${equipLabel} | Restrictions: ${restrictions}${healthNotes ? ` | Health: ${healthNotes}` : ""}
TARGETS: ${targetCalories} kcal | ${proteinG}g protein | ${carbsG}g carbs | ${fatG}g fat (TDEE: ${tdee})

{
  "summary": "<2-3 sentences personalised to their situation>",
  "weeklyMeals": [
    {
      "day": "Monday",
      "meals": [
        {"name":"Breakfast","description":"<specific meal with quantities>","calories":<n>,"proteinG":<n>,"qualityScore":<1-10>,"qualityNotes":"<brief nutrition note>","estimatedCost":"<£X.XX>"},
        {"name":"Lunch","description":"<meal>","calories":<n>,"proteinG":<n>,"qualityScore":<1-10>,"qualityNotes":"<note>","estimatedCost":"<£X.XX>"},
        {"name":"Dinner","description":"<meal>","calories":<n>,"proteinG":<n>,"qualityScore":<1-10>,"qualityNotes":"<note>","estimatedCost":"<£X.XX>"},
        {"name":"Snack","description":"<snack>","calories":<n>,"proteinG":<n>,"qualityScore":<1-10>,"qualityNotes":"<note>","estimatedCost":"<£X.XX>"}
      ],
      "totalCalories":<sum>,"totalProteinG":<sum>,"estimatedDayCost":"<£X.XX>"
    }
    /* repeat for all 7 days */
  ],
  "weeklyTraining": [
    {
      "day": "Monday",
      "type": "<Push/Pull/Legs/Upper/Lower/Full Body/Cardio/Rest>",
      "focus": "<e.g. Chest Shoulders Triceps>",
      "exercises": [{"name":"<exact exercise>","sets":<n>,"reps":"<e.g. 8-12>","rest":"<e.g. 90s>","notes":"<form tip>"}],
      "duration": "<e.g. 50-60 min>"
    }
    /* all 7 days — ${trainingDaysPerWeek} training days, rest are Rest or Active Recovery */
  ],
  "groceryList": {
    "protein": [{"item":"<item + weekly qty>","estimatedPrice":"<£X.XX>","qualityNote":"<note>"}],
    "carbs": [{"item":"<item>","estimatedPrice":"<£X.XX>","qualityNote":"<note>"}],
    "fats": [{"item":"<item>","estimatedPrice":"<£X.XX>","qualityNote":"<note>"}],
    "vegetables": [{"item":"<item>","estimatedPrice":"<£X.XX>","qualityNote":"<note>"}],
    "other": [{"item":"<item>","estimatedPrice":"<£X.XX>","qualityNote":"<note>"}]
  },
  "estimatedWeeklyCost": "<£XX-XX>",
  "costBreakdown": "<how to reduce cost if needed>",
  "progressionPlan": "<specific week-by-week progression — exact numbers>",
  "keyTips": ["<specific tip>","<tip>","<tip>"]
}

CRITICAL: All 7 days in weeklyMeals. Exactly ${trainingDaysPerWeek} training days. Specific quantities in all meals. Respect restrictions: ${restrictions}. UK supermarket prices.`,
        "You are an elite personal trainer and dietitian. Specific, evidence-based. Return valid JSON only."
      );

      const fitplan = JSON.parse(extractJSON(raw));

      // Store in Supabase
      if (email) {
        await supabase.from("fit_plans").insert({
          id: nanoid(), email,
          goal, age_years: Number(ageYears), height_cm: Number(heightCm),
          weight_kg: Number(weightKg), target_weight_kg: targetWeightKg ? Number(targetWeightKg) : null,
          activity_level: activityLevel, training_days_per_week: Number(trainingDaysPerWeek),
          equipment, dietary_restrictions: restrictions, health_notes: healthNotes || null,
          tdee, target_calories: targetCalories,
          macros: JSON.stringify({ proteinG, carbsG, fatG, calories: targetCalories }),
          weekly_plan: JSON.stringify(fitplan),
          created_at: new Date().toISOString(),
        });
        await logToken(email, "fitplan");
      }

      res.json({
        intake: { goal, ageYears, heightCm, weightKg, targetWeightKg, activityLevel, trainingDaysPerWeek, equipment, dietaryRestrictions, healthNotes },
        targets: { tdee, targetCalories, macros: { proteinG, carbsG, fatG, calories: targetCalories } },
        plan: fitplan,
      });
    } catch (err: any) {
      console.error("FitPlan error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── FitPlan regenerate single day ─────────────────────────────────────────────
  app.post("/api/fitplan/regenerate-day", aiLimiter, async (req, res) => {
    try {
      const { day, targetCalories, proteinG, dietaryRestrictions } = req.body;
      if (!day || !targetCalories) return res.status(400).json({ error: "day and targetCalories required" });

      const raw = await callClaudeHaiku(
        `Create a NEW meal plan for ${day}. Different from typical. Targets: ${targetCalories} kcal, ${proteinG}g protein. Restrictions: ${dietaryRestrictions || "None"}. UK prices.
Return ONLY valid JSON:
{"day":"${day}","meals":[{"name":"Breakfast","description":"<specific>","calories":<n>,"proteinG":<n>,"qualityScore":<1-10>,"qualityNotes":"<note>","estimatedCost":"<£X.XX>"},{"name":"Lunch","description":"<meal>","calories":<n>,"proteinG":<n>,"qualityScore":<1-10>,"qualityNotes":"<note>","estimatedCost":"<£X.XX>"},{"name":"Dinner","description":"<meal>","calories":<n>,"proteinG":<n>,"qualityScore":<1-10>,"qualityNotes":"<note>","estimatedCost":"<£X.XX>"},{"name":"Snack","description":"<snack>","calories":<n>,"proteinG":<n>,"qualityScore":<1-10>,"qualityNotes":"<note>","estimatedCost":"<£X.XX>"}],"totalCalories":<sum>,"totalProteinG":<sum>,"estimatedDayCost":"<£X.XX>"}`,
        "Return valid JSON only."
      );
      res.json(JSON.parse(extractJSON(raw)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── CV score differential ─────────────────────────────────────────────────────
  app.post("/api/cv/differential", aiLimiter, async (req, res) => {
    try {
      const { originalCV, optimisedCV, jobDescription } = req.body;
      if (!originalCV || !optimisedCV || !jobDescription)
        return res.status(400).json({ error: "originalCV, optimisedCV, and jobDescription required" });

      const raw = await callClaudeHaiku(
        `Score these two CVs against the same JD. Return before/after comparison.

JD: ${jobDescription.slice(0, 1500)}
ORIGINAL CV: ${originalCV.slice(0, 2500)}
OPTIMISED CV: ${optimisedCV.slice(0, 2500)}

Return ONLY valid JSON:
{
  "original": {"overall":<0-100>,"categories":[{"name":"Keyword Alignment","score":<0-100>},{"name":"CV Structure","score":<0-100>},{"name":"Experience Relevance","score":<0-100>},{"name":"Quantified Impact","score":<0-100>},{"name":"ATS Compatibility","score":<0-100>},{"name":"Narrative Clarity","score":<0-100>}]},
  "optimised": {"overall":<0-100>,"categories":[{"name":"Keyword Alignment","score":<0-100>},{"name":"CV Structure","score":<0-100>},{"name":"Experience Relevance","score":<0-100>},{"name":"Quantified Impact","score":<0-100>},{"name":"ATS Compatibility","score":<0-100>},{"name":"Narrative Clarity","score":<0-100>}]},
  "delta":<optimised.overall - original.overall>,
  "biggestGain":"<category with highest improvement>",
  "summary":"<1-2 sentences on what changed most>"
}`,
        "Return valid JSON only."
      );
      res.json(JSON.parse(extractJSON(raw)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Application Q&A ─────────────────────────────────────────────────────────
  app.post("/api/qa/generate", aiLimiter, async (req, res) => {
    try {
      const { cvText, jdText, questions, sessionId } = req.body as {
        cvText: string;
        jdText: string;
        questions: Array<{
          id: string;
          text: string;
          wordLimit?: number;
          bulletPoints?: string[];
        }>;
        sessionId?: string;
      };

      if (!cvText || typeof cvText !== "string" || cvText.trim().length < 50)
        return res.status(400).json({ error: "Please paste your CV before generating answers" });
      if (!jdText || typeof jdText !== "string" || jdText.trim().length < 50)
        return res.status(400).json({ error: "Please paste the job description before generating answers" });
      if (!questions || !Array.isArray(questions) || questions.length === 0)
        return res.status(400).json({ error: "Add at least one application question" });
      if (questions.length > 10)
        return res.status(400).json({ error: "Maximum 10 questions per session" });
      if (cvText.length > MAX_CV_LEN)
        return res.status(400).json({ error: "CV text too long" });
      if (jdText.length > MAX_JD_LEN)
        return res.status(400).json({ error: "JD text too long" });

      const questionBlocks = questions
        .map((q, i) => {
          const limit = q.wordLimit ? ` (word limit: ${q.wordLimit} words)` : "";
          const bullets = q.bulletPoints?.filter(Boolean) ?? [];
          const bulletBlock =
            bullets.length > 0
              ? `\nContext the applicant wants to include:\n${bullets.map((b) => `  • ${b}`).join("\n")}`
              : "";
          return `QUESTION ${i + 1}${limit}:\n"${q.text}"${bulletBlock}`;
        })
        .join("\n\n");

      const prompt = `You are an expert job application writer. Generate specific, compelling answers to application form questions based on this candidate's CV and the target role.

CV:
${cvText.slice(0, 3000)}

JOB DESCRIPTION:
${jdText.slice(0, 1500)}

APPLICATION QUESTIONS:
${questionBlocks}

RULES:
- Each answer must draw directly from the CV — use real job titles, real companies, real achievements
- Never invent experience that isn't in the CV
- If a word limit is given, stay within 10% of it
- If the applicant provided bullet points, weave them naturally into the answer
- Match the tone of the JD — formal organisation = formal answer
- Lead with impact, not with "I am applying because..."
- Each answer must feel distinct — no repetition across answers
- whyAsked should explain what the hiring manager is actually testing

Return ONLY valid JSON:
{
  "answers": [
    {
      "questionId": "<same id from input>",
      "question": "<the original question text>",
      "answer": "<full recommended answer — ready to paste>",
      "wordCount": <actual word count of answer>,
      "withinLimit": <true|false — true if no limit specified>,
      "whyAsked": "<1-2 sentences: what this question tests and what a strong answer signals>",
      "alternativeLine": "<one alternative opening line if they want a different angle>",
      "strengthsUsed": ["<specific CV achievement or skill this answer draws on>"]
    }
  ],
  "overallAdvice": "<2-3 sentences of advice specific to this application set — patterns, gaps, what to watch>"
}`;

      const raw = await callClaudeSonnet(prompt,
        "You are an expert job application writer. Draw only from the provided CV. Return valid JSON only. Never invent experience."
      );

      const parsed = JSON.parse(extractJSON(raw));

      if (!parsed.answers || !Array.isArray(parsed.answers))
        throw new Error("Invalid Q&A response structure");

      if (sessionId && typeof sessionId === "string") {
        await storage.updateSession(sessionId, {
          qaAnswers: JSON.stringify(parsed.answers),
        });
      }

      res.json(parsed);
    } catch (err: any) {
      console.error("Q&A generate error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Q&A single regenerate ───────────────────────────────────────────────────
  app.post("/api/qa/regenerate", aiLimiter, async (req, res) => {
    try {
      const { cvText, jdText, question, wordLimit, bulletPoints, previousAnswer, feedback } = req.body as {
        cvText: string;
        jdText: string;
        question: string;
        wordLimit?: number;
        bulletPoints?: string[];
        previousAnswer: string;
        feedback?: string;
      };

      if (!cvText || !jdText || !question || !previousAnswer)
        return res.status(400).json({ error: "Missing required fields" });

      const limit = wordLimit ? ` Stay within ${wordLimit} words.` : "";
      const bullets = (bulletPoints ?? []).filter(Boolean);
      const bulletBlock = bullets.length > 0
        ? `\nInclude this context: ${bullets.map((b) => `• ${b}`).join(" | ")}`
        : "";
      const feedbackBlock = feedback ? `\nFeedback to address: ${feedback}` : "";

      const raw = await callClaudeSonnet(
        `Rewrite this application answer with a different angle.${limit}${bulletBlock}${feedbackBlock}

QUESTION: "${question}"
PREVIOUS ANSWER: ${previousAnswer}

CV (for reference): ${cvText.slice(0, 2000)}
JD (for reference): ${jdText.slice(0, 800)}

Return ONLY valid JSON:
{
  "answer": "<rewritten answer>",
  "wordCount": <word count>,
  "changesMade": "<1 sentence on what changed and why>"
}`,
        "You are an expert application writer. Draw only from the provided CV. Return valid JSON only."
      );

      const parsed = JSON.parse(extractJSON(raw));
      res.json(parsed);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── CV Word export (.docx) ──────────────────────────────────────────────────
  app.post("/api/cv/export-docx", generalLimiter, async (req, res) => {
    try {
      const { rewrittenCV: cv, candidateName } = req.body as { rewrittenCV: any; candidateName?: string };
      if (!cv) return res.status(400).json({ error: "rewrittenCV required" });

      const name = (candidateName || cv.name || "CV").replace(/[^a-z0-9 ]/gi, "").trim();

      const sectionHeader = (text: string) =>
        new Paragraph({
          children: [new TextRun({ text, bold: true, size: 20, allCaps: true, color: "2563EB" })],
          spacing: { before: 280, after: 80 },
          border: { bottom: { style: "single", size: 4, color: "BFDBFE", space: 1 } },
        });

      const children: any[] = [
        new Paragraph({
          children: [new TextRun({ text: cv.name || "", bold: true, size: 36 })],
          spacing: { after: 80 },
        }),
        ...(cv.tagline ? [new Paragraph({
          children: [new TextRun({ text: cv.tagline, size: 24, color: "2563EB" })],
          spacing: { after: 80 },
        })] : []),
        ...(cv.contact ? [new Paragraph({
          children: [new TextRun({ text: cv.contact, size: 20, color: "666666" })],
          spacing: { after: 300 },
        })] : []),
        sectionHeader("Professional Summary"),
        new Paragraph({
          children: [new TextRun({ text: cv.summary || "", size: 22 })],
          spacing: { after: 200 },
        }),
        sectionHeader("Skills"),
        new Paragraph({
          children: [new TextRun({ text: (cv.skills as string[] || []).join(" • "), size: 22 })],
          spacing: { after: 200 },
        }),
        sectionHeader("Experience"),
        ...(cv.experience as any[] || []).flatMap((exp: any) => [
          new Paragraph({
            children: [
              new TextRun({ text: exp.title || "", bold: true, size: 22 }),
              new TextRun({ text: "  |  " + (exp.company || ""), size: 22 }),
              new TextRun({ text: "  " + (exp.dates || ""), size: 20, color: "888888" }),
            ],
            spacing: { after: 60 },
          }),
          ...(exp.bullets as string[] || []).map((b: string) =>
            new Paragraph({
              children: [new TextRun({ text: "•  " + b, size: 20 })],
              indent: { left: 360 },
              spacing: { after: 60 },
            })
          ),
          new Paragraph({ children: [], spacing: { after: 120 } }),
        ]),
        sectionHeader("Education"),
        ...(cv.education as any[] || []).map((e: any) =>
          new Paragraph({
            children: [
              new TextRun({ text: e.degree || "", bold: true, size: 22 }),
              new TextRun({ text: "  |  " + (e.institution || ""), size: 22 }),
              new TextRun({ text: "  " + (e.dates || ""), size: 20, color: "888888" }),
            ],
            spacing: { after: 120 },
          })
        ),
        ...((cv.extras as string[] || []).length > 0 ? [
          sectionHeader("Additional"),
          ...(cv.extras as string[]).map((e: string) =>
            new Paragraph({
              children: [new TextRun({ text: "•  " + e, size: 20 })],
              indent: { left: 360 },
              spacing: { after: 60 },
            })
          ),
        ] : []),
      ];

      const doc = new Document({ sections: [{ properties: {}, children }] });
      const buffer = await Packer.toBuffer(doc);
      const safeName = name.toLowerCase().replace(/\s+/g, "-").slice(0, 40);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="cv-${safeName}.docx"`);
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Cover letter Word export (.docx) ────────────────────────────────────────
  app.post("/api/cover-letter/export-docx", generalLimiter, async (req, res) => {
    try {
      const { coverLetterText, tone, candidateName } = req.body as { coverLetterText: string; tone?: string; candidateName?: string };
      if (!coverLetterText) return res.status(400).json({ error: "coverLetterText required" });

      const lines = coverLetterText.split("\n");
      const children: any[] = [
        new Paragraph({ children: [], spacing: { after: 600 } }),
        ...lines.map((line: string) =>
          new Paragraph({
            children: [new TextRun({ text: line, size: 22 })],
            spacing: { after: line.trim() === "" ? 0 : 200 },
          })
        ),
      ];

      const doc = new Document({ sections: [{ properties: {}, children }] });
      const buffer = await Packer.toBuffer(doc);
      const safeTone = (tone || "cover-letter").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="cover-letter-${safeTone}.docx"`);
      res.send(buffer);
    } catch (err: any) {
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
