/**
 * Interactive onboarding wizard — full-screen overlay that guides the user
 * through uploading a CV, entering a JD, and viewing their first score.
 *
 * Step state is managed by the parent (Home) so it persists across stage
 * transitions (input → scoring → results).
 */
import { ReactNode } from "react";
import { FileDropZone } from "./FileDropZone";

interface FastScore {
  overallScore: number;
  topActions: string[];
  summary: string;
}

export interface InteractiveWizardProps {
  step: number; // 0 = CV, 1 = JD, 2 = Results
  scoringPending: boolean;
  cvText: string;
  jdText: string;
  fastScore: FastScore | null;
  jdMode: "paste" | "url" | "screenshot";
  jdUrl: string;
  jdScreenshots: File[];
  jdFetching: boolean;
  canScore: boolean;
  localCvTab: "upload" | "paste";
  uploadZone: ReactNode;
  onLocalCvTabChange: (tab: "upload" | "paste") => void;
  onSetCvText: (t: string) => void;
  onSetJdText: (t: string) => void;
  onSetJdUrl: (u: string) => void;
  onSetJdScreenshots: (f: File[]) => void;
  onJdModeChange: (mode: string) => void;
  onJdFetch: () => void;
  onJdScreenshot: () => void;
  onNextStep: () => void;
  onPrevStep: () => void;
  onScoreClick: () => void;
  onComplete: () => void;
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? "#10B981" : score >= 50 ? "#3B82F6" : "#F59E0B";
  const textColor = score >= 75 ? "text-green-400" : score >= 50 ? "text-blue-400" : "text-amber-400";
  const borderColor = score >= 75 ? "border-green-500" : score >= 50 ? "border-blue-500" : "border-amber-500";
  const bgColor = score >= 75 ? "bg-green-500/10" : score >= 50 ? "bg-blue-500/10" : "bg-amber-500/10";
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className={`relative w-28 h-28 rounded-full ${bgColor} border-4 ${borderColor} flex items-center justify-center mx-auto`}
      style={{ borderColor: color }}>
      <svg className="absolute inset-0 -rotate-90" width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r="40" fill="none" stroke="#1A2340" strokeWidth="6" />
        <circle cx="56" cy="56" r="40" fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      </svg>
      <span className={`font-display text-3xl font-bold ${textColor}`}>{score}</span>
    </div>
  );
}

export function InteractiveWizard({
  step, scoringPending,
  cvText, jdText, fastScore,
  jdMode, jdUrl, jdScreenshots, jdFetching, canScore,
  localCvTab, uploadZone,
  onLocalCvTabChange, onSetCvText, onSetJdText, onSetJdUrl, onSetJdScreenshots,
  onJdModeChange, onJdFetch, onJdScreenshot,
  onNextStep, onPrevStep, onScoreClick, onComplete,
}: InteractiveWizardProps) {
  const cvReady = cvText.trim().length > 50;
  const jdReady = jdText.trim().length > 50;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === step ? "w-6 h-2 bg-blue-500" : i < step ? "w-2 h-2 bg-blue-400/60" : "w-2 h-2 bg-[#2A3558]"
              }`}
            />
          ))}
        </div>

        <div className="bg-[#0F1629] border border-[#2A3558] rounded-2xl overflow-hidden">

          {/* ── Step 0: Upload CV ─────────────────────────────────────────────── */}
          {!scoringPending && step === 0 && (
            <div className="p-6 space-y-4">
              <div>
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Step 1 of 3</p>
                <h3 className="font-display font-bold text-white text-xl mt-1">Let's start — upload your CV</h3>
                <p className="text-sm text-[#8895B3] mt-1">Upload a PDF or paste your text.</p>
              </div>

              <div className="flex gap-1 bg-[#1A2340] rounded-lg p-0.5 w-fit">
                <button
                  onClick={() => onLocalCvTabChange("upload")}
                  className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${localCvTab === "upload" ? "bg-blue-500 text-white" : "text-[#8895B3] hover:text-white"}`}
                >Upload PDF</button>
                <button
                  onClick={() => onLocalCvTabChange("paste")}
                  className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${localCvTab === "paste" ? "bg-blue-500 text-white" : "text-[#8895B3] hover:text-white"}`}
                >Paste text</button>
              </div>

              {localCvTab === "upload" ? (
                uploadZone
              ) : (
                <textarea
                  value={cvText}
                  onChange={(e) => onSetCvText(e.target.value)}
                  placeholder="Paste your CV text here..."
                  className="w-full min-h-[140px] bg-[#1A2340] border border-[#2A3558] rounded-lg text-white placeholder:text-white/40 text-sm px-3 py-2.5 resize-none outline-none focus:border-blue-500"
                />
              )}

              {cvReady && (
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <span className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center text-xs font-bold flex-shrink-0">✓</span>
                  <span>CV ready — {cvText.split(/\s+/).length} words extracted</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-[#2A3558]">
                <button onClick={onComplete} className="text-xs text-[#3D4F6E] hover:text-[#8895B3] transition-colors">Skip intro</button>
                <button
                  onClick={onNextStep}
                  disabled={!cvReady}
                  className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${cvReady ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-[#1A2340] text-[#3D4F6E] cursor-not-allowed"}`}
                >
                  {cvReady ? "Got it! Next →" : "Upload your CV to continue"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 1: JD input ──────────────────────────────────────────────── */}
          {!scoringPending && step === 1 && (
            <div className="p-6 space-y-4">
              <div>
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Step 2 of 3</p>
                <h3 className="font-display font-bold text-white text-xl mt-1">Now paste the job description</h3>
                <p className="text-sm text-[#8895B3] mt-1">Or paste a URL — we'll extract it automatically.</p>
              </div>

              <div className="flex gap-2 flex-wrap">
                {([
                  { mode: "paste" as const, label: "📝 Paste" },
                  { mode: "url" as const, label: "🔗 URL" },
                  { mode: "screenshot" as const, label: "📸 Screenshot" },
                ] as const).map(({ mode, label }) => (
                  <button
                    key={mode}
                    onClick={() => onJdModeChange(mode)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                      jdMode === mode
                        ? "bg-blue-500 border-blue-500 text-white"
                        : "border-[#2A3558] text-[#8895B3] hover:text-white hover:border-blue-500/40"
                    }`}
                  >{label}</button>
                ))}
              </div>

              {jdMode === "paste" && (
                <textarea
                  value={jdText}
                  onChange={(e) => onSetJdText(e.target.value)}
                  placeholder="Paste the job description here..."
                  className="w-full min-h-[140px] bg-[#1A2340] border border-[#2A3558] rounded-lg text-white placeholder:text-white/40 text-sm px-3 py-2.5 resize-none outline-none focus:border-blue-500"
                />
              )}

              {jdMode === "url" && (
                <div className="space-y-2">
                  <input
                    type="url"
                    value={jdUrl}
                    onChange={(e) => onSetJdUrl(e.target.value)}
                    placeholder="https://... paste the job listing URL"
                    className="w-full bg-[#1A2340] border border-[#2A3558] rounded-lg text-white text-sm px-3 py-2.5 outline-none focus:border-blue-500/50 placeholder-[#3D4F6E]"
                    onKeyDown={(e) => { if (e.key === "Enter" && jdUrl.trim()) onJdFetch(); }}
                  />
                  <button
                    onClick={onJdFetch}
                    disabled={!jdUrl.trim() || jdFetching}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${!jdUrl.trim() || jdFetching ? "bg-[#1A2340] text-[#3D4F6E] cursor-not-allowed" : "bg-blue-500 hover:bg-blue-600 text-white"}`}
                  >
                    {jdFetching
                      ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Extracting...</span>
                      : "Extract JD →"}
                  </button>
                </div>
              )}

              {jdMode === "screenshot" && (
                <div className="space-y-2">
                  <FileDropZone files={jdScreenshots} onChange={onSetJdScreenshots} maxFiles={4} />
                  <button
                    onClick={onJdScreenshot}
                    disabled={!jdScreenshots.length || jdFetching}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${!jdScreenshots.length || jdFetching ? "bg-[#1A2340] text-[#3D4F6E] cursor-not-allowed" : "bg-blue-500 hover:bg-blue-600 text-white"}`}
                  >
                    {jdFetching
                      ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Reading...</span>
                      : `Extract from ${jdScreenshots.length || 0} Screenshot${jdScreenshots.length !== 1 ? "s" : ""} →`}
                  </button>
                </div>
              )}

              {jdReady && (
                <div className="rounded-xl bg-[#1A2340] border border-[#2A3558] p-3 space-y-1">
                  <p className="text-xs text-green-400 font-semibold">✓ Job description ready — {jdText.split(/\s+/).length} words</p>
                  <p className="text-xs text-[#8895B3] line-clamp-2">{jdText.slice(0, 180)}...</p>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-[#2A3558]">
                <button onClick={onPrevStep} className="text-xs text-[#8895B3] hover:text-white transition-colors">← Back</button>
                <button
                  onClick={onScoreClick}
                  disabled={!canScore}
                  className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${canScore ? "bg-green-500 hover:bg-green-600 text-white" : "bg-[#1A2340] text-[#3D4F6E] cursor-not-allowed"}`}
                >
                  {canScore ? "Score My CV →" : "Paste a job description to continue"}
                </button>
              </div>
            </div>
          )}

          {/* ── Scoring pending (shown during step 1 → 2 transition) ─────────── */}
          {scoringPending && (
            <div className="p-10 flex flex-col items-center gap-5 text-center">
              <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              <div>
                <p className="font-display text-lg font-semibold text-white">Scoring your CV...</p>
                <p className="text-sm text-[#8895B3] mt-1">Keyword alignment · ATS check · Experience relevance</p>
              </div>
            </div>
          )}

          {/* ── Step 2: Results ───────────────────────────────────────────────── */}
          {!scoringPending && step === 2 && fastScore && (
            <div className="p-6 space-y-5">
              <div className="text-center">
                <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Step 3 of 3</p>
                <h3 className="font-display font-bold text-white text-xl mt-1">Your Results 🎉</h3>
                <p className="text-sm text-[#8895B3] mt-1">This is your overall CV-to-job match score.</p>
              </div>

              <ScoreRing score={fastScore.overallScore} />

              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#8895B3] uppercase tracking-wider">Start with these for the biggest impact</p>
                {fastScore.topActions.slice(0, 3).map((action, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm text-white">
                    <span className="text-blue-400 font-bold flex-shrink-0">{i + 1}.</span>
                    <span className="leading-snug">{action}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={onComplete}
                className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-all"
              >
                Got it, show me everything →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
