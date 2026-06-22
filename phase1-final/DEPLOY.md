# Phase 1 — Complete Deployment Guide
# Written for non-developers. Every step is specific.
# Estimated time: 2-3 hours total.

═══════════════════════════════════════════════
BEFORE YOU START — READ THIS
═══════════════════════════════════════════════

You will touch exactly these files:
  ADD 2 new files to server/
  EDIT 3 existing files (routes.ts, schema.ts, App.tsx)
  ADD 3 new files to client/src/pages/
  ADD 1 new file to client/src/components/

Take it one step at a time. If anything goes wrong,
paste the Railway error log here and it'll be fixed in minutes.

═══════════════════════════════════════════════
STEP 1 — Railway environment variables (10 min)
═══════════════════════════════════════════════

Go to: railway.app → your project → your service → Variables

Add these (click New Variable for each):

  ANTHROPIC_API_KEY   →  sk-ant-... (from console.anthropic.com)
  FREE_UNTIL          →  2025-08-15  (6 weeks from launch — change this date)

Your existing variables stay as-is. Just add these two new ones.
Click Deploy after adding them.

═══════════════════════════════════════════════
STEP 2 — Add server/claude.ts (5 min)
═══════════════════════════════════════════════

1. Go to: github.com/useful-shxt/cvscore
2. Click the "server" folder
3. Click "Add file" → "Create new file"
4. Name it: claude.ts
5. Paste the ENTIRE content of phase1-final/server/claude.ts
6. Click "Commit new file" (green button)

═══════════════════════════════════════════════
STEP 3 — Edit server/routes.ts (30 min — most important step)
═══════════════════════════════════════════════

This file has 3 changes:

--- CHANGE A: Add import at top ---
1. Go to server/routes.ts in GitHub
2. Click pencil icon (Edit)
3. Find the LAST import line at the top (around line 12)
4. After it, add this new line:

   import { callClaude, callClaudeHaiku, callClaudeSonnet, fetchPageText } from "./claude";

5. Also find the line: import supabase from "./supabase";
   If it doesn't exist, add it after the imports:
   import supabase from "./supabase";

--- CHANGE B: Update callPerplexity to accept maxTokens ---
Find this function (around line 43):
   async function callPerplexity(
     model: string,
     messages: { role: string; content: string }[],
     retries = 4,
     useSearch = false

Change JUST the last parameter line and add maxTokens:
   async function callPerplexity(
     model: string,
     messages: { role: string; content: string }[],
     retries = 4,
     useSearch = false,
     maxTokens = 4096          ← ADD THIS LINE
   ): Promise<string> {
     for (let attempt = 0; attempt <= retries; attempt++) {
       const body: any = { model, messages, max_tokens: maxTokens };    ← CHANGE max_tokens: 4096 to max_tokens: maxTokens

--- CHANGE C: Replace cover letter route ---
Find: app.post("/api/cover-letters"
Select from that line all the way to the matching closing });
Replace the entire route with this:

  app.post("/api/cover-letters", aiLimiter, async (req, res) => {
    try {
      const { cvText, jdText, sessionId } = req.body;
      if (!cvText || !jdText) return res.status(400).json({ error: "cvText and jdText required" });
      if (typeof cvText !== "string" || typeof jdText !== "string")
        return res.status(400).json({ error: "Invalid input types" });
      if (cvText.length > MAX_CV_LEN) return res.status(400).json({ error: "CV text too long" });
      if (jdText.length > MAX_JD_LEN) return res.status(400).json({ error: "JD text too long" });

      const prompt = `Write 3 cover letter variations. Return ONLY valid JSON. No markdown. No truncation.
JSON RULES: double quotes only, no newlines in strings, complete all paragraphs.

CV:
${cvText.slice(0, 3000)}

JOB DESCRIPTION:
${jdText.slice(0, 1500)}

Return exactly:
{
  "coverLetters": [
    {"tone":"Direct & Confident","desc":"Gets straight to the point. Bold claims, strong verbs.","salutation":"Dear Hiring Manager,","paragraphs":["<opening — specific achievement from CV, why this role>","<evidence — 2-3 accomplishments with numbers from their CV>","<closing — confident ask, no generic phrases>"],"sign":"Best regards,"},
    {"tone":"Warm & Collaborative","desc":"Emphasises teamwork, culture fit, shared values.","salutation":"Dear Hiring Team,","paragraphs":["<opening — genuine enthusiasm, specific company reference>","<evidence — achievements framed through collaboration>","<closing — warm, forward-looking>"],"sign":"Warmly,"},
    {"tone":"Strategic & Data-Led","desc":"Leads with metrics, market insight, business impact.","salutation":"Dear Hiring Manager,","paragraphs":["<opening — business context or problem, their relevant metric>","<evidence — data-driven achievements, strategic value>","<closing — value proposition as business outcome>"],"sign":"Regards,"}
  ]
}`;

      const raw = await callPerplexity("sonar-pro", [
        { role: "system", content: "You are an expert cover letter writer. Return ONLY valid JSON. Complete all paragraphs fully. Never truncate." },
        { role: "user", content: prompt },
      ], 4, false, 3000);

      const jsonStr = extractJSON(raw).replace(/,(\s*[}\]])/g, "$1").trim();
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

--- CHANGE D: Replace interview prep prompt ---
Find: app.post("/api/score/deep"
Inside that route, find the line starting with: const prompt = `You are a senior career coach
Select from that backtick all the way to the closing backtick (`;)
Replace ONLY the prompt string with:

      const prompt = `You are a senior career coach. Deep analysis. Return ONLY valid JSON.

CV:
${cvText}

JOB DESCRIPTION:
${jdText}

Return:
{
  "upskilling": [
    {"skill":"<skill>","reason":"<why for this specific role>","resource":"<specific course/cert/book>"},
    {"skill":"<skill>","reason":"<reason>","resource":"<resource>"},
    {"skill":"<skill>","reason":"<reason>","resource":"<resource>"}
  ],
  "interviewPrep": [
    {"category":"Behavioural","question":"<Tell me about a time... specific to their CV>","hint":"<STAR method using their real experience>","whyAsked":"<what interviewer tests>"},
    {"category":"Behavioural","question":"<Describe a situation... different scenario>","hint":"<specific guidance>","whyAsked":"<motivation>"},
    {"category":"Role-Specific","question":"<Technical question tied to JD requirements>","hint":"<how to demonstrate depth>","whyAsked":"<competency assessed>"},
    {"category":"Role-Specific","question":"<Second technical — different JD aspect>","hint":"<guidance>","whyAsked":"<motivation>"},
    {"category":"Situational","question":"<How would you handle... hypothetical>","hint":"<show process not just outcome>","whyAsked":"<what it reveals>"},
    {"category":"Culture & Motivation","question":"<Why this company specifically?>","hint":"<answer authentically not generically>","whyAsked":"<what a good answer signals>"},
    {"category":"Strengths & Gaps","question":"<Probes a visible gap in their CV>","hint":"<address honestly, show growth>","whyAsked":"<what interviewer looks for>"},
    {"category":"Curve Ball","question":"<Unexpected — case study, estimation, or creative prompt>","hint":"<show thinking process>","whyAsked":"<what it actually tests>"}
  ],
  "questionsToAsk": [
    "<Smart question to ask interviewer — shows strategic thinking>",
    "<Shows research into company/role>",
    "<Shows long-term thinking>"
  ],
  "competitiveInsights": "<Who else is in the room — honest comparison of this CV vs strong candidates>"
}`;

--- CHANGE E: Add new routes before closing } ---
Scroll to the VERY END of routes.ts
Find the last line: }   (this closes registerRoutes)
BEFORE that closing }, paste the ENTIRE content of:
  phase1-final/server/routes-additions.ts
  (paste only the content between ─── START and ─── END OF ADDITIONS)

6. Click "Commit changes" at the bottom

═══════════════════════════════════════════════
STEP 4 — Edit shared/schema.ts (5 min)
═══════════════════════════════════════════════

1. Go to shared/schema.ts in GitHub
2. Click pencil icon
3. Scroll to the very LAST line of the file
4. Add a blank line after it
5. Paste the ENTIRE content of phase1-final/shared/schema-additions.ts
6. Commit changes

Note: The schema-additions.ts file already has the right imports at the top.
Remove any duplicate import lines if they already exist in schema.ts.

═══════════════════════════════════════════════
STEP 5 — Update database tables (5 min)
═══════════════════════════════════════════════

This creates the new tables (predictions, user_picks, fit_plans, token_usage)

Option A — Railway Shell (easiest):
1. Go to Railway dashboard → your service → Shell tab
2. Type: npm run db:push
3. Press Enter
4. Wait for "Changes applied" message (~30 seconds)

Option B — if Shell tab is missing:
Tell me and I'll convert to raw SQL you can run directly.

═══════════════════════════════════════════════
STEP 6 — Add new pages (20 min)
═══════════════════════════════════════════════

For each file below:
Go to that path in GitHub → "Add file" → "Create new file" → paste content → commit

  client/src/pages/predict.tsx
  → Paste content from: phase1-final/client/src/pages/predict.tsx

  client/src/pages/fitplan.tsx
  → Paste content from: phase1-final/client/src/pages/fitplan.tsx

  client/src/pages/platform-home.tsx
  → Paste content from: phase1-final/client/src/pages/platform-home.tsx

  client/src/components/FreeBanner.tsx
  → Paste content from: phase1-final/client/src/components/FreeBanner.tsx

═══════════════════════════════════════════════
STEP 7 — Replace App.tsx (5 min)
═══════════════════════════════════════════════

1. Go to client/src/App.tsx in GitHub
2. Click pencil icon
3. Select ALL (Ctrl+A / Cmd+A) and DELETE
4. Paste ENTIRE content of phase1-final/client/src/App.tsx
5. Commit

═══════════════════════════════════════════════
STEP 8 — Wait for Railway to deploy (5-10 min)
═══════════════════════════════════════════════

1. Go to Railway → your project → Deployments tab
2. Watch latest deployment
3. "Deployed" = success. Red X = paste error here

═══════════════════════════════════════════════
STEP 9 — Test everything (20 min)
═══════════════════════════════════════════════

Open usefulshxt.com and check each item:

PLATFORM:
[ ] Homepage shows at / with 3 tool cards (CVScore, Predict, FitPlan)
[ ] Free banner at top shows "Free until [date]"
[ ] Nav links work: CVScore → /cvscore, Predict → /predict, FitPlan → /fitplan

CVSCORE (/cvscore):
[ ] CV scoring works (paste any CV + JD and click Score)
[ ] Cover letter generates without error (was failing before)
[ ] Interview prep shows 8 questions with categories
[ ] Interview prep shows "Questions to Ask" section
[ ] CV Rewrite shows before/after score comparison
[ ] LinkedIn tab shows "Use my CV" button alongside paste option
[ ] LinkedIn screenshot upload works on mobile (take screenshot, upload)
[ ] LinkedIn analysis runs and returns headline, about, posts etc
[ ] "Download LinkedIn Report" button generates and downloads HTML file
[ ] "Download CV Report" button generates and downloads HTML file

PREDICT (/predict):
[ ] Sport selector shows World Cup, Premier League, IPL
[ ] Clicking "Get today's prediction" loads in 10-15 seconds
[ ] Confidence bar animates
[ ] Prediction shows reasoning, key factors, risk note
[ ] Pick logging input appears (your pick vs Claude's)
[ ] "Log my pick" saves successfully

FITPLAN (/fitplan):
[ ] Form loads with all options
[ ] Generating plan takes 20-30 seconds
[ ] Meals show quality scores (★ X/10) and costs (£X.XX)
[ ] Grocery list shows estimated prices and quality notes
[ ] Weekly cost estimate shows at bottom of grocery list
[ ] "Download FitPlan" button generates and downloads HTML file
[ ] "Regenerate this day" button works on individual days

═══════════════════════════════════════════════
IF SOMETHING BREAKS
═══════════════════════════════════════════════

Railway build error:
→ Go to Deployments tab → click the failed deployment → copy the red error text → paste here

Feature not working:
→ Open browser (F12 → Console tab) → copy any red errors → paste here

PDF downloads blank:
→ Check the route was pasted correctly in routes.ts

Predict returns "No matches":
→ This is correct if there are genuinely no fixtures today — try a different sport

═══════════════════════════════════════════════
FILE CHECKLIST — WHAT GOES WHERE
═══════════════════════════════════════════════

NEW files to create:
  server/claude.ts                           ← ADD
  server/routes-additions.ts content         ← PASTE INTO routes.ts (not a new file)
  client/src/pages/predict.tsx               ← ADD
  client/src/pages/fitplan.tsx               ← ADD
  client/src/pages/platform-home.tsx         ← ADD
  client/src/components/FreeBanner.tsx       ← ADD

EDIT existing files:
  server/routes.ts                           ← 5 changes (A through E above)
  shared/schema.ts                           ← paste schema-additions at bottom
  client/src/App.tsx                         ← replace entirely

Railway variables to add:
  ANTHROPIC_API_KEY
  FREE_UNTIL

Railway shell command:
  npm run db:push
