/**
 * Q&A TAB — Application Question Answerer
 *
 * HOW TO ADD TO home.tsx:
 *
 * 1. Add "qa" to the outputTab type on line 654:
 *    const [outputTab, setOutputTab] = useState<"score"|"rewrite"|"cover"|"linkedin"|"tracker"|"qa">("score");
 *
 * 2. Change TabsList grid from grid-cols-5 to grid-cols-6 (line 900)
 *
 * 3. Add this TabsTrigger after the tracker one:
 *    <TabsTrigger value="qa" className="text-[10px] sm:text-xs px-1 py-2 min-h-[36px]">
 *      Q&A
 *    </TabsTrigger>
 *
 * 4. Add this TabsContent after the tracker TabsContent (after line 1157):
 *    <TabsContent value="qa" className="mt-4">
 *      <QAPanel cvText={cvText} jdText={jdText} />
 *    </TabsContent>
 *
 * 5. Add the QAPanel component below to home.tsx (paste before the Home() export)
 *
 * 6. Add to shared/schema.ts:
 *    export interface QAQuestion {
 *      id: string;
 *      text: string;
 *      wordLimit?: number;
 *      bulletPoints: string[];
 *    }
 *    export interface QAAnswer {
 *      questionId: string;
 *      question: string;
 *      answer: string;
 *      wordCount: number;
 *      withinLimit: boolean;
 *      whyAsked: string;
 *      alternativeLine: string;
 *      strengthsUsed: string[];
 *    }
 *    export interface QAResult {
 *      answers: QAAnswer[];
 *      overallAdvice: string;
 *    }
 */

// ─────────────────────────────────────────────────────────────────────────────
// PASTE THIS COMPONENT INTO home.tsx BEFORE THE Home() EXPORT
// ─────────────────────────────────────────────────────────────────────────────

function QAPanel({ cvText, jdText }: { cvText: string; jdText: string }) {
  const { toast } = useToast();
  const [questions, setQuestions] = useState<QAQuestion[]>([
    { id: crypto.randomUUID(), text: "", wordLimit: undefined, bulletPoints: [""] },
  ]);
  const [result, setResult] = useState<QAResult | null>(null);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [regenLoading, setRegenLoading] = useState<string | null>(null); // questionId being regenerated
  const [regenFeedback, setRegenFeedback] = useState<Record<string, string>>({}); // questionId → feedback text
  const [copied, setCopied] = useState<string | null>(null);

  const canGenerate =
    cvText.trim().length > 50 &&
    jdText.trim().length > 50 &&
    questions.some((q) => q.text.trim().length > 5);

  // ── Question management ───────────────────────────────────────────────────

  const addQuestion = () => {
    if (questions.length >= 10) return;
    setQuestions((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: "", wordLimit: undefined, bulletPoints: [""] },
    ]);
  };

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    if (result) {
      setResult((prev) =>
        prev ? { ...prev, answers: prev.answers.filter((a) => a.questionId !== id) } : null
      );
    }
  };

  const updateQuestion = (id: string, field: keyof QAQuestion, value: any) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, [field]: value } : q))
    );
  };

  const updateBullet = (questionId: string, bulletIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) return q;
        const bullets = [...q.bulletPoints];
        bullets[bulletIndex] = value;
        return { ...q, bulletPoints: bullets };
      })
    );
  };

  const addBullet = (questionId: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId && q.bulletPoints.length < 5
          ? { ...q, bulletPoints: [...q.bulletPoints, ""] }
          : q
      )
    );
  };

  const removeBullet = (questionId: string, bulletIndex: number) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) return q;
        const bullets = q.bulletPoints.filter((_, i) => i !== bulletIndex);
        return { ...q, bulletPoints: bullets.length > 0 ? bullets : [""] };
      })
    );
  };

  // ── Generate all answers ──────────────────────────────────────────────────

  const generateMutation = useMutation({
    mutationFn: async () => {
      const validQuestions = questions
        .filter((q) => q.text.trim().length > 5)
        .map((q) => ({
          id: q.id,
          text: q.text.trim(),
          wordLimit: q.wordLimit,
          bulletPoints: q.bulletPoints.filter((b) => b.trim().length > 0),
        }));

      if (validQuestions.length === 0)
        throw new Error("Add at least one question");

      const res = await apiRequest("POST", "/api/qa/generate", {
        cvText,
        jdText,
        questions: validQuestions,
      });
      return res.json() as Promise<QAResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.answers.length > 0) setExpandedQuestion(data.answers[0].questionId);
    },
    onError: (err: any) => {
      toast({ title: "Q&A generation failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Regenerate single answer ──────────────────────────────────────────────

  const handleRegenerate = async (answer: QAAnswer) => {
    const q = questions.find((q) => q.id === answer.questionId);
    if (!q) return;
    setRegenLoading(answer.questionId);
    try {
      const res = await apiRequest("POST", "/api/qa/regenerate", {
        cvText,
        jdText,
        question: answer.question,
        wordLimit: q.wordLimit,
        bulletPoints: q.bulletPoints.filter((b) => b.trim().length > 0),
        previousAnswer: answer.answer,
        feedback: regenFeedback[answer.questionId]?.trim() || undefined,
      });
      const data = await res.json();
      setResult((prev) =>
        prev
          ? {
              ...prev,
              answers: prev.answers.map((a) =>
                a.questionId === answer.questionId
                  ? { ...a, answer: data.answer, wordCount: data.wordCount }
                  : a
              ),
            }
          : null
      );
      setRegenFeedback((prev) => ({ ...prev, [answer.questionId]: "" }));
      toast({ title: "Answer regenerated", description: data.changesMade });
    } catch (err: any) {
      toast({ title: "Regeneration failed", description: err.message, variant: "destructive" });
    } finally {
      setRegenLoading(null);
    }
  };

  // ── Copy ──────────────────────────────────────────────────────────────────

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  // No CV/JD yet
  if (!cvText.trim() || !jdText.trim()) {
    return (
      <div className="rounded-xl border border-[#2A3558] bg-[#0F1629] p-8 text-center">
        <div className="text-3xl mb-3 opacity-40">📝</div>
        <p className="text-sm font-semibold text-white mb-1">Score your CV first</p>
        <p className="text-xs text-[#8895B3]">
          The Q&A tool uses your CV and the job description to generate tailored answers.
          Paste both above and run a score, then come back here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Question builder */}
      <div className="rounded-xl border border-[#2A3558] bg-[#0F1629] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-[#8895B3] uppercase tracking-wider">
              Application Questions
            </p>
            <p className="text-xs text-[#3D4F6E] mt-0.5">
              Paste each question from the application form. Add optional bullet points
              to include specific experience the AI should weave in.
            </p>
          </div>
          <span className="text-xs text-[#3D4F6E]">
            {questions.filter((q) => q.text.trim()).length}/{questions.length} filled
          </span>
        </div>

        <div className="space-y-4">
          {questions.map((q, qIdx) => (
            <div
              key={q.id}
              className="rounded-lg border border-[#2A3558] bg-[#080D1A] p-4 space-y-3"
            >
              {/* Question header */}
              <div className="flex items-start gap-2">
                <span className="text-xs font-bold text-blue-400 mt-2.5 flex-shrink-0 w-5 text-right">
                  {qIdx + 1}.
                </span>
                <div className="flex-1 space-y-2">
                  {/* Question text */}
                  <textarea
                    rows={2}
                    placeholder={`Paste application question ${qIdx + 1} here…\ne.g. "Please describe your experience managing cross-functional teams."`}
                    value={q.text}
                    onChange={(e) => updateQuestion(q.id, "text", e.target.value)}
                    className="w-full bg-[#1A2340] border border-[#2A3558] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3D4F6E] resize-none outline-none focus:border-blue-500/50 transition-colors"
                  />

                  {/* Word limit row */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-[#8895B3] whitespace-nowrap">
                        Word limit
                      </label>
                      <input
                        type="number"
                        placeholder="None"
                        value={q.wordLimit ?? ""}
                        onChange={(e) =>
                          updateQuestion(
                            q.id,
                            "wordLimit",
                            e.target.value ? parseInt(e.target.value) : undefined
                          )
                        }
                        className="w-20 bg-[#1A2340] border border-[#2A3558] rounded-md px-2 py-1 text-xs text-white placeholder-[#3D4F6E] outline-none focus:border-blue-500/50"
                      />
                    </div>
                    <span className="text-[#3D4F6E] text-xs">·</span>
                    <span className="text-xs text-[#3D4F6E]">
                      Optional — enter if the form specifies one
                    </span>
                  </div>
                </div>

                {/* Remove button */}
                {questions.length > 1 && (
                  <button
                    onClick={() => removeQuestion(q.id)}
                    className="text-[#3D4F6E] hover:text-red-400 transition-colors text-sm flex-shrink-0 mt-1.5"
                    title="Remove question"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Bullet points */}
              <div className="ml-7 space-y-1.5">
                <p className="text-xs text-[#3D4F6E]">
                  Key points to include{" "}
                  <span className="text-[#2A3558]">— optional</span>
                </p>
                {q.bulletPoints.map((bullet, bIdx) => (
                  <div key={bIdx} className="flex items-center gap-2">
                    <span className="text-blue-400/50 text-xs flex-shrink-0">•</span>
                    <input
                      type="text"
                      placeholder={
                        bIdx === 0
                          ? "e.g. Led a team of 8 engineers at Linnworks"
                          : bIdx === 1
                          ? "e.g. Reduced onboarding time by 40%"
                          : "Add another point…"
                      }
                      value={bullet}
                      onChange={(e) => updateBullet(q.id, bIdx, e.target.value)}
                      className="flex-1 bg-[#1A2340] border border-[#2A3558] rounded-md px-3 py-1.5 text-xs text-white placeholder-[#3D4F6E] outline-none focus:border-blue-500/30 transition-colors"
                    />
                    {q.bulletPoints.length > 1 && (
                      <button
                        onClick={() => removeBullet(q.id, bIdx)}
                        className="text-[#2A3558] hover:text-red-400 transition-colors text-sm flex-shrink-0"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {q.bulletPoints.length < 5 && (
                  <button
                    onClick={() => addBullet(q.id)}
                    className="text-xs text-[#3D4F6E] hover:text-blue-400 transition-colors flex items-center gap-1 ml-4"
                  >
                    + Add point
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add question + Generate row */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#2A3558]">
          {questions.length < 10 ? (
            <button
              onClick={addQuestion}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1.5"
            >
              <span className="text-base leading-none">+</span>
              Add another question
              <span className="text-[#3D4F6E]">({10 - questions.length} remaining)</span>
            </button>
          ) : (
            <span className="text-xs text-[#3D4F6E]">Maximum 10 questions</span>
          )}

          <Button
            onClick={() => generateMutation.mutate()}
            disabled={!canGenerate || generateMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2 h-auto"
          >
            {generateMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                Generating answers…
              </span>
            ) : (
              `Generate ${questions.filter((q) => q.text.trim()).length > 0
                ? `${questions.filter((q) => q.text.trim()).length} `
                : ""}answer${questions.filter((q) => q.text.trim()).length === 1 ? "" : "s"} →`
            )}
          </Button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-3">

          {/* Overall advice banner */}
          {result.overallAdvice && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
              <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-1.5">
                Application Strategy
              </p>
              <p className="text-sm text-[#8895B3] leading-relaxed">{result.overallAdvice}</p>
            </div>
          )}

          {/* Answer cards */}
          {result.answers.map((answer, idx) => {
            const isExpanded = expandedQuestion === answer.questionId;
            const isRegening = regenLoading === answer.questionId;
            const isCopied = copied === answer.questionId;
            const feedback = regenFeedback[answer.questionId] ?? "";
            const q = questions.find((q) => q.id === answer.questionId);

            return (
              <div
                key={answer.questionId}
                className="rounded-xl border border-[#2A3558] bg-[#0F1629] overflow-hidden"
              >
                {/* Card header — always visible */}
                <button
                  className="w-full flex items-start gap-3 p-4 text-left hover:bg-[#1A2340]/50 transition-colors"
                  onClick={() =>
                    setExpandedQuestion(isExpanded ? null : answer.questionId)
                  }
                >
                  <span className="text-xs font-bold text-blue-400 mt-0.5 flex-shrink-0 w-5 text-right">
                    {idx + 1}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white line-clamp-2">
                      "{answer.question}"
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-[#3D4F6E]">
                        {answer.wordCount} words
                        {q?.wordLimit && (
                          <span
                            className={
                              answer.wordCount <= q.wordLimit
                                ? " text-green-400"
                                : " text-red-400"
                            }
                          >
                            {" "}/ {q.wordLimit} limit
                          </span>
                        )}
                      </span>
                      {answer.strengthsUsed?.length > 0 && (
                        <span className="text-xs text-[#3D4F6E]">
                          · draws from {answer.strengthsUsed.length} CV point
                          {answer.strengthsUsed.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[#3D4F6E] text-xs flex-shrink-0 mt-0.5">
                    {isExpanded ? "↑" : "↓"}
                  </span>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-[#2A3558]">

                    {/* Why asked */}
                    {answer.whyAsked && (
                      <div className="pt-3">
                        <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
                          Why they're asking this
                        </p>
                        <p className="text-xs text-[#8895B3] leading-relaxed">
                          {answer.whyAsked}
                        </p>
                      </div>
                    )}

                    {/* Answer */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-green-400 uppercase tracking-wider">
                          Recommended answer
                        </p>
                        <button
                          onClick={() => handleCopy(answer.questionId, answer.answer)}
                          className={`text-xs font-semibold px-3 py-1 rounded-md border transition-all ${
                            isCopied
                              ? "border-green-500/30 bg-green-500/10 text-green-400"
                              : "border-[#2A3558] bg-[#1A2340] text-[#8895B3] hover:text-white"
                          }`}
                        >
                          {isCopied ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                      <div className="bg-[#080D1A] border border-[#2A3558] rounded-lg p-4 text-sm text-[#C8D4EE] leading-relaxed whitespace-pre-wrap font-serif">
                        {answer.answer}
                      </div>
                    </div>

                    {/* CV points used */}
                    {answer.strengthsUsed?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-[#8895B3] uppercase tracking-wider mb-2">
                          CV evidence used in this answer
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {answer.strengthsUsed.map((s, i) => (
                            <span
                              key={i}
                              className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Alternative opening */}
                    {answer.alternativeLine && (
                      <div>
                        <p className="text-xs font-semibold text-[#8895B3] uppercase tracking-wider mb-1">
                          Alternative opening line
                        </p>
                        <div className="bg-[#1A2340] border border-[#2A3558] rounded-md px-3 py-2 text-xs text-[#8895B3] italic">
                          "{answer.alternativeLine}"
                        </div>
                      </div>
                    )}

                    {/* Regenerate section */}
                    <div className="border-t border-[#2A3558] pt-3 space-y-2">
                      <p className="text-xs text-[#3D4F6E]">
                        Not quite right?
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder='e.g. "more concise", "lead with the NHS example", "more formal"'
                          value={feedback}
                          onChange={(e) =>
                            setRegenFeedback((prev) => ({
                              ...prev,
                              [answer.questionId]: e.target.value,
                            }))
                          }
                          className="flex-1 bg-[#1A2340] border border-[#2A3558] rounded-md px-3 py-1.5 text-xs text-white placeholder-[#3D4F6E] outline-none focus:border-blue-500/30"
                        />
                        <button
                          onClick={() => handleRegenerate(answer)}
                          disabled={isRegening}
                          className="text-xs font-semibold px-4 py-1.5 rounded-md border border-[#2A3558] bg-[#1A2340] text-[#8895B3] hover:text-white hover:border-[#3A4568] transition-all disabled:opacity-50 whitespace-nowrap flex-shrink-0"
                        >
                          {isRegening ? (
                            <span className="flex items-center gap-1.5">
                              <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                              Regenerating…
                            </span>
                          ) : (
                            "Regenerate ↺"
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Regenerate all */}
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="w-full text-xs text-[#3D4F6E] hover:text-[#8895B3] transition-colors py-2"
          >
            ↺ Regenerate all answers
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE ADDITIONS — paste into shared/schema.ts
// ─────────────────────────────────────────────────────────────────────────────
/*
export interface QAQuestion {
  id: string;
  text: string;
  wordLimit?: number;
  bulletPoints: string[];
}

export interface QAAnswer {
  questionId: string;
  question: string;
  answer: string;
  wordCount: number;
  withinLimit: boolean;
  whyAsked: string;
  alternativeLine: string;
  strengthsUsed: string[];
}

export interface QAResult {
  answers: QAAnswer[];
  overallAdvice: string;
}
*/
