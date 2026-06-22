// ─────────────────────────────────────────────────────────────────────────────
// Q&A ROUTE ADDITION
// Paste this into server/routes.ts BEFORE the closing } of registerRoutes()
// Also add to shared/schema.ts: the ApplicationQuestion and QAResult types
//
// Token cost: 4 tokens per Q&A session
// Model: Claude Sonnet (needs nuanced, specific answers — not Haiku)
// ─────────────────────────────────────────────────────────────────────────────

  // ── Application Q&A ─────────────────────────────────────────────────────────
  // Takes: CV text, JD text, and 1–10 application questions
  // Returns: a structured answer for each question with:
  //   - recommended answer (prose, ready to paste)
  //   - optional bullet points the user provided their own context for
  //   - word count guidance
  //   - why this question is being asked (so the user understands the intent)

  app.post("/api/qa/generate", aiLimiter, async (req, res) => {
    try {
      const { cvText, jdText, questions, sessionId } = req.body as {
        cvText: string;
        jdText: string;
        questions: Array<{
          id: string;
          text: string;           // the application question
          wordLimit?: number;     // e.g. 250 — if the form specifies one
          bulletPoints?: string[];// optional user-provided context bullets
        }>;
        sessionId?: string;
      };

      // Validation
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

      // Build question blocks
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

      // Log token usage
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

  // ── Q&A single regenerate (one question, different angle) ───────────────────
  // Costs 1 token — regenerates just one answer with optional new bullet points

  app.post("/api/qa/regenerate", aiLimiter, async (req, res) => {
    try {
      const { cvText, jdText, question, wordLimit, bulletPoints, previousAnswer, feedback } = req.body as {
        cvText: string;
        jdText: string;
        question: string;
        wordLimit?: number;
        bulletPoints?: string[];
        previousAnswer: string;
        feedback?: string; // e.g. "more concise", "lead with the NHS example"
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
