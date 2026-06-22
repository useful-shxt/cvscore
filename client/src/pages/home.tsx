import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailGate } from "@/components/EmailGate";
import { LaunchBanner } from "@/components/LaunchBanner";
import type {
  FastScoreResult,
  DeepAnalysisResult,
  RewriteResult,
  CoverLetter,
  CategoryScore,
  CompanyIntelResult,
  LinkedInAnalysisResult,
  TrackerEntry,
  QAQuestion,
  QAAnswer,
  QAResult,
} from "@shared/schema";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface AppUser {
  id: string;
  email: string;
  name: string;
  runCount: number;
}

// ─── Logo ──────────────────────────────────────────────────────────────────────
function CVScoreLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="CVScore">
      <rect width="32" height="32" rx="8" fill="#3B82F6" />
      <rect x="7" y="8" width="12" height="2" rx="1" fill="white" opacity="0.9" />
      <rect x="7" y="13" width="18" height="2" rx="1" fill="white" opacity="0.7" />
      <rect x="7" y="18" width="14" height="2" rx="1" fill="white" opacity="0.5" />
      <circle cx="23" cy="22" r="5" fill="#080D1A" />
      <path d="M20.5 22L22 23.5L25.5 20" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Score Dial ────────────────────────────────────────────────────────────────
function ScoreDial({ score, size = 180 }: { score: number; size?: number }) {
  const circumference = 603;
  const targetOffset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? "#10B981" : score >= 50 ? "#F59E0B" : "#EF4444";
  const label = score >= 75 ? "Strong Match" : score >= 50 ? "Good Start" : "Needs Work";
  const r = 96;
  const cx = size / 2;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="#1A2340" strokeWidth="14" />
          <circle
            cx={cx} cy={cx} r={r}
            fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={targetOffset}
            className="score-dial-ring"
            style={{ "--target-offset": targetOffset } as React.CSSProperties}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-5xl font-bold text-white">{score}</span>
          <span className="text-xs text-[#8895B3] font-medium mt-0.5">/ 100</span>
        </div>
      </div>
      <Badge
        className="text-xs font-semibold px-3 py-1"
        style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}
      >
        {label}
      </Badge>
    </div>
  );
}

// ─── Mini Score Ring (for tracker) ────────────────────────────────────────────
function MiniScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? "#10B981" : score >= 50 ? "#F59E0B" : "#EF4444";
  const r = 18;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative flex items-center justify-center" style={{ width: 48, height: 48 }}>
      <svg width="48" height="48" viewBox="0 0 48 48" className="-rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#1A2340" strokeWidth="5" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <span className="absolute text-xs font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

// ─── Category Bar ──────────────────────────────────────────────────────────────
function CategoryBar({ cat }: { cat: CategoryScore }) {
  const color = cat.score >= 75 ? "#10B981" : cat.score >= 50 ? "#F59E0B" : "#EF4444";
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-white">{cat.name}</span>
        <span className="text-sm font-bold" style={{ color }}>{cat.score}</span>
      </div>
      <div className="h-2 rounded-full bg-[#1A2340] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${cat.score}%`, backgroundColor: color }} />
      </div>
      <p className="text-xs text-[#8895B3]">{cat.feedback}</p>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-[#2A3558] bg-[#1A2340] p-5 space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="shimmer rounded-md" style={{ height: 16, width: `${60 + i * 15}%` }} />
      ))}
    </div>
  );
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────
function UploadZone({ onText, disabled, onUploadSuccess }: { onText: (t: string) => void; disabled?: boolean; onUploadSuccess?: () => void }) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".pdf")) {
      toast({ title: "PDF files only", description: "Please upload a .pdf file", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/api/cv/upload`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      if (data.text) {
        onText(data.text);
        toast({ title: "CV uploaded", description: `Extracted ${data.text.split(/\s+/).length} words` });
        onUploadSuccess?.();
      }
    } catch {
      toast({ title: "Upload failed", description: "Try pasting your CV text instead", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [onText, toast]);

  return (
    <div
      data-testid="upload-zone"
      className={`upload-zone rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${dragOver ? "drag-over border-blue-500" : "border-[#2A3558] hover:border-blue-500/50"} ${disabled ? "opacity-50 pointer-events-none" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
    >
      <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} data-testid="input-file" />
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[#8895B3]">Parsing PDF...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[#8895B3]">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="12" y1="18" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <polyline points="9,15 12,12 15,15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-sm font-medium text-white">Drop your CV here or click to upload</p>
          <p className="text-xs text-[#8895B3]">PDF up to 10MB</p>
        </div>
      )}
    </div>
  );
}

// ─── Cover Letter Card ─────────────────────────────────────────────────────────
function CoverLetterCard({ letter }: { letter: CoverLetter }) {
  const [copied, setCopied] = useState(false);
  const fullText = [letter.salutation, "", ...letter.paragraphs, "", letter.sign].join("\n");
  const toneId = letter.tone.toLowerCase().replace(/[^a-z]+/g, "-");
  const copy = async () => {
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="rounded-xl border border-[#2A3558] bg-[#1A2340] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#2A3558]">
        <div>
          <span className="font-display font-semibold text-white text-sm">{letter.tone}</span>
          <p className="text-xs text-[#8895B3] mt-0.5">{letter.desc}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={copy} data-testid={`button-copy-${toneId}`} className="text-xs text-[#8895B3] hover:text-white">
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
      <div className="p-5 bg-white rounded-b-xl">
        <p className="text-sm text-gray-800 mb-4">{letter.salutation}</p>
        {letter.paragraphs.map((p, i) => (
          <p key={i} className="text-sm text-gray-700 mb-3 leading-relaxed">{p}</p>
        ))}
        <p className="text-sm text-gray-800 whitespace-pre-line mt-4">{letter.sign}</p>
      </div>
    </div>
  );
}

// ─── Rewrite Panel ─────────────────────────────────────────────────────────────
function RewritePanel({ rewrite, companyIntel }: { rewrite: RewriteResult; companyIntel: string }) {
  const [copied, setCopied] = useState(false);
  const plainText = [
    rewrite.name, rewrite.tagline, rewrite.contact, "",
    "PROFESSIONAL SUMMARY", rewrite.summary, "",
    "SKILLS", rewrite.skills.join(" • "), "",
    "EXPERIENCE",
    ...rewrite.experience.flatMap(exp => [`${exp.title} | ${exp.company} | ${exp.dates}`, ...exp.bullets.map(b => `• ${b}`), ""]),
    "EDUCATION",
    ...rewrite.education.map(e => `${e.degree} | ${e.institution} | ${e.dates}`),
    ...(rewrite.extras.length ? ["", "ADDITIONAL", ...rewrite.extras] : []),
  ].join("\n");

  const copy = async () => {
    await navigator.clipboard.writeText(plainText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {companyIntel && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <p className="text-xs font-semibold text-blue-400 mb-1.5">Company Intel</p>
          <p className="text-sm text-[#8895B3] leading-relaxed">{companyIntel}</p>
        </div>
      )}
      <div className="rounded-xl border border-[#2A3558] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2A3558] bg-[#1A2340]">
          <span className="font-display font-semibold text-white text-sm">Optimised CV</span>
          <Button size="sm" variant="ghost" onClick={copy} data-testid="button-copy-rewrite" className="text-xs text-[#8895B3] hover:text-white">
            {copied ? "Copied!" : "Copy plain text"}
          </Button>
        </div>
        <div className="bg-white p-8 space-y-6">
          <div className="border-b border-gray-200 pb-5">
            <h1 className="text-2xl font-bold text-gray-900">{rewrite.name}</h1>
            <p className="text-base text-blue-600 font-medium mt-1">{rewrite.tagline}</p>
            <p className="text-sm text-gray-500 mt-1">{rewrite.contact}</p>
          </div>
          <div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Summary</h2>
            <p className="text-sm text-gray-700 leading-relaxed">{rewrite.summary}</p>
          </div>
          <div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {rewrite.skills.map((s, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">{s}</span>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Experience</h2>
            <div className="space-y-4">
              {rewrite.experience.map((exp, i) => (
                <div key={i}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{exp.title}</p>
                      <p className="text-sm text-gray-600">{exp.company}</p>
                    </div>
                    <p className="text-xs text-gray-400">{exp.dates}</p>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {exp.bullets.map((b, j) => (
                      <li key={j} className="text-sm text-gray-700 flex gap-2">
                        <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          {rewrite.education.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Education</h2>
              {rewrite.education.map((e, i) => (
                <div key={i} className="flex justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{e.degree}</p>
                    <p className="text-sm text-gray-600">{e.institution}</p>
                  </div>
                  <p className="text-xs text-gray-400">{e.dates}</p>
                </div>
              ))}
            </div>
          )}
          {rewrite.extras.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Additional</h2>
              <ul className="space-y-1">
                {rewrite.extras.map((e, i) => <li key={i} className="text-sm text-gray-700">• {e}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Company Intel Panel ───────────────────────────────────────────────────────
function CompanyIntelPanel({ intel }: { intel: CompanyIntelResult }) {
  return (
    <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-[#0F1629] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Company Intel</p>
          <p className="text-lg font-display font-bold text-white mt-0.5">{intel.companyName}</p>
          <p className="text-sm text-[#8895B3]">{intel.jobTitle}</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-blue-400">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" />
            <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          { label: "Overview", value: intel.overview, color: "text-white" },
          { label: "Culture & Values", value: intel.culture, color: "text-[#8895B3]" },
          { label: "Recent News", value: intel.recentNews, color: "text-[#8895B3]" },
          { label: "Hiring Signals", value: intel.hiringSignals, color: "text-blue-300" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg bg-[#1A2340] border border-[#2A3558] p-3">
            <p className="text-xs font-semibold text-[#8895B3] uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-xs leading-relaxed ${color}`}>{value}</p>
          </div>
        ))}
      </div>
      {intel.techStack && (
        <div>
          <p className="text-xs font-semibold text-[#8895B3] uppercase tracking-wider mb-2">Tech Stack</p>
          <div className="flex flex-wrap gap-1.5">
            {intel.techStack.split(/[,•|]+/).map((t) => t.trim()).filter(Boolean).map((tech, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-[#1A2340] text-[#8895B3] border border-[#2A3558]">{tech}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LinkedIn Analysis Panel ───────────────────────────────────────────────────
function LinkedInPanel({ analysis, cvProvided }: { analysis: LinkedInAnalysisResult; cvProvided: boolean }) {
  const color = analysis.overallScore >= 75 ? "#10B981" : analysis.overallScore >= 50 ? "#F59E0B" : "#EF4444";
  const sections = [
    { label: "Headline", score: analysis.headlineScore, feedback: analysis.headlineFeedback },
    { label: "About / Summary", score: analysis.summaryScore, feedback: analysis.summaryFeedback },
    { label: "Skills", score: analysis.skillsScore, feedback: analysis.skillsFeedback },
    { label: "Experience", score: analysis.experienceScore, feedback: analysis.experienceFeedback },
  ];
  return (
    <div className="space-y-4">
      {/* Score hero */}
      <div className="rounded-2xl border border-[#2A3558] bg-[#0F1629] p-5 flex flex-col sm:flex-row items-center gap-6">
        <ScoreDial score={analysis.overallScore} size={140} />
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-xs font-semibold text-[#8895B3] uppercase tracking-wider mb-1">LinkedIn vs JD Match</p>
            <p className="text-sm text-white leading-relaxed">Your LinkedIn profile scores {analysis.overallScore}/100 against this role.</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-[#8895B3] uppercase tracking-wider">Top 3 Actions</p>
            {analysis.topActions.map((action, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-white">
                <span className="text-blue-400 font-bold flex-shrink-0">{i + 1}.</span>
                <span>{action}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section scores */}
      <div className="rounded-xl border border-[#2A3558] bg-[#0F1629] p-5 space-y-4">
        <p className="text-xs font-semibold text-[#8895B3] uppercase tracking-wider">Section Breakdown</p>
        {sections.map((s) => {
          const c = s.score >= 75 ? "#10B981" : s.score >= 50 ? "#F59E0B" : "#EF4444";
          return (
            <div key={s.label} className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-white">{s.label}</span>
                <span className="text-sm font-bold" style={{ color: c }}>{s.score}</span>
              </div>
              <div className="h-2 rounded-full bg-[#1A2340] overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${s.score}%`, backgroundColor: c }} />
              </div>
              <p className="text-xs text-[#8895B3]">{s.feedback}</p>
            </div>
          );
        })}
      </div>

      {/* Keywords missing + gaps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {analysis.keywordsMissing.length > 0 && (
          <div className="rounded-xl border border-[#2A3558] bg-[#0F1629] p-5">
            <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">✗ Keywords Missing from LinkedIn</p>
            <div className="flex flex-wrap gap-1.5">
              {analysis.keywordsMissing.map((kw, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">{kw}</span>
              ))}
            </div>
          </div>
        )}
        {cvProvided && analysis.gaps.length > 0 && (
          <div className="rounded-xl border border-[#2A3558] bg-[#0F1629] p-5">
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">⚠ CV vs LinkedIn Gaps</p>
            <div className="space-y-1.5">
              {analysis.gaps.map((g, i) => (
                <p key={i} className="text-xs text-[#8895B3] flex gap-1.5"><span className="text-amber-400">→</span>{g}</p>
              ))}
            </div>
          </div>
        )}
        {analysis.extras.length > 0 && (
          <div className="rounded-xl border border-[#2A3558] bg-[#0F1629] p-5">
            <p className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3">✓ LinkedIn Strengths</p>
            <div className="space-y-1.5">
              {analysis.extras.map((e, i) => (
                <p key={i} className="text-xs text-[#8895B3] flex gap-1.5"><span className="text-green-400">✓</span>{e}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── JD Tracker Panel ─────────────────────────────────────────────────────────
function TrackerInsights({ entries }: { entries: TrackerEntry[] }) {
  if (entries.length < 2) return null;

  // Consistent weakness across sessions
  const allCats = entries.flatMap(e => e.categories || []);
  const catTotals: Record<string, { total: number; count: number }> = {};
  for (const c of allCats) {
    if (!catTotals[c.name]) catTotals[c.name] = { total: 0, count: 0 };
    catTotals[c.name].total += c.score;
    catTotals[c.name].count += 1;
  }
  const catAvgs = Object.entries(catTotals)
    .filter(([, v]) => v.count >= 2)
    .map(([name, v]) => ({ name, avg: Math.round(v.total / v.count) }))
    .sort((a, b) => a.avg - b.avg);
  const weakest = catAvgs[0] || null;
  const strongest = catAvgs[catAvgs.length - 1] || null;

  // Recurring missing keywords (appear in 2+ sessions)
  const kwCounts: Record<string, number> = {};
  for (const e of entries) {
    const missing = e.keywords?.missing || [];
    const seen = new Set<string>();
    for (const kw of missing) {
      const key = kw.toLowerCase();
      if (!seen.has(key)) {
        kwCounts[key] = (kwCounts[key] || 0) + 1;
        seen.add(key);
      }
    }
  }
  const recurringKws = Object.entries(kwCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([kw, count]) => ({ kw, count }));

  // Score trend (oldest to newest)
  const scores = [...entries].reverse().map(e => e.score);
  const trend = scores.length >= 2 ? scores[scores.length - 1] - scores[0] : 0;

  if (!weakest && recurringKws.length === 0) return null;

  return (
    <div className="space-y-3 mb-4">
      {/* Score trend bar chart */}
      {scores.length >= 2 && (
        <div className="rounded-xl border border-[#2A3558] bg-[#0F1629] p-4">
          <p className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Score Trend</p>
          <div className="flex items-end gap-2 h-12">
            {scores.map((s, i) => {
              const col = s >= 75 ? "#10B981" : s >= 50 ? "#F59E0B" : "#EF4444";
              const height = Math.max(20, Math.round((s / 100) * 48));
              return (
                <div key={i} className="flex flex-col items-center gap-1 flex-1">
                  <span className="text-[10px] font-bold" style={{ color: col }}>{s}</span>
                  <div className="w-full rounded-sm" style={{ height, background: col, opacity: i === scores.length - 1 ? 1 : 0.4 }} />
                </div>
              );
            })}
          </div>
          {trend !== 0 && (
            <p className="text-xs mt-2" style={{ color: trend > 0 ? "#10B981" : "#EF4444" }}>
              {trend > 0 ? `↑ Up ${trend} points` : `↓ Down ${Math.abs(trend)} points`} since your first score
            </p>
          )}
        </div>
      )}

      {/* Consistent weakness */}
      {weakest && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <span className="text-base flex-shrink-0">⚠️</span>
            <div>
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">Consistent weakness</p>
              <p className="text-sm text-white">
                <strong>{weakest.name}</strong> averages{" "}
                <strong style={{ color: weakest.avg >= 75 ? "#10B981" : weakest.avg >= 50 ? "#F59E0B" : "#EF4444" }}>
                  {weakest.avg}/100
                </strong>{" "}
                across your last {entries.length} scores — this is a CV-level issue, not role-specific.
              </p>
              {strongest && strongest.name !== weakest.name && (
                <p className="text-xs text-white/40 mt-1">
                  Strongest: <strong className="text-white/60">{strongest.name}</strong> ({strongest.avg}/100)
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recurring keyword gaps */}
      {recurringKws.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1">CV gaps — missing across multiple roles</p>
          <p className="text-xs text-white/40 mb-3">These keywords are absent from your CV itself. Adding them will improve every future score.</p>
          <div className="flex flex-wrap gap-2">
            {recurringKws.map(({ kw, count }) => (
              <span key={kw} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 border border-red-500/25 text-red-300">
                {kw}
                <span className="text-red-400/60 text-[10px]">×{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TrackerPanel({ entries, onSelect }: { entries: TrackerEntry[]; onSelect: (e: TrackerEntry) => void }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-[#2A3558] bg-[#0F1629] p-10 text-center space-y-3">
        <p className="text-sm font-semibold text-white">No applications tracked yet</p>
        <p className="text-xs text-white/40">Score a role and it will appear here. Up to 5 saved automatically.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <TrackerInsights entries={entries} />
      <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">{entries.length} Application{entries.length > 1 ? "s" : ""} Tracked</p>
      {entries.map((entry) => {
        const color = entry.score >= 75 ? "#10B981" : entry.score >= 50 ? "#F59E0B" : "#EF4444";
        const date = new Date(entry.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        return (
          <div
            key={entry.sessionId}
            className="rounded-xl border border-[#2A3558] bg-[#0F1629] p-4 flex items-center gap-4 hover:border-blue-500/40 transition-colors cursor-pointer group"
            onClick={() => onSelect(entry)}
            data-testid={`tracker-entry-${entry.sessionId}`}
          >
            <MiniScoreRing score={entry.score} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{entry.jobTitle}</p>
              <p className="text-xs text-white/40 truncate">{entry.companyName}</p>
              <p className="text-xs text-white/30 mt-0.5">{date}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-lg font-bold" style={{ color }}>{entry.score}</p>
              <p className="text-xs text-white/40">/ 100</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white/30 group-hover:text-blue-400 transition-colors flex-shrink-0">
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        );
      })}
      <p className="text-xs text-white/30 text-center">Your last {entries.length} scored application{entries.length > 1 ? "s" : ""} · Auto-saved</p>
    </div>
  );
}


// ─── Email sent badge ──────────────────────────────────────────────────────────
function EmailSentBadge({ email }: { email: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-green-400 flex-shrink-0">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-xs text-green-400">Results emailed to <strong>{email}</strong></span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
type AppStage = "input" | "scoring" | "results";

interface ScoreState {
  fast: FastScoreResult | null;
  deep: DeepAnalysisResult | null;
  sessionId: string | null;
  deepLoading: boolean;
}

// ─── Q&A Panel ────────────────────────────────────────────────────────────────
function QAPanel({ cvText, jdText }: { cvText: string; jdText: string }) {
  const [questions, setQuestions] = useState<QAQuestion[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [newWordLimit, setNewWordLimit] = useState<string>("");
  const [newBullets, setNewBullets] = useState<string[]>(["", ""]);
  const [result, setResult] = useState<QAResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const addQuestion = () => {
    if (!newQuestion.trim()) return;
    const q: QAQuestion = {
      id: Date.now().toString(),
      text: newQuestion.trim(),
      wordLimit: newWordLimit ? parseInt(newWordLimit) : undefined,
      bulletPoints: newBullets.filter(Boolean),
    };
    setQuestions((prev) => [...prev, q]);
    setNewQuestion("");
    setNewWordLimit("");
    setNewBullets(["", ""]);
  };

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    if (result) {
      setResult((r) => r ? { ...r, answers: r.answers.filter((a) => a.questionId !== id) } : null);
    }
  };

  const generate = async () => {
    if (!cvText || cvText.trim().length < 50) { setError("Please paste your CV in the CV tab first."); return; }
    if (!jdText || jdText.trim().length < 50) { setError("Please paste a job description first."); return; }
    if (!questions.length) { setError("Add at least one application question."); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/qa/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvText, jdText, questions }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Generation failed"); }
      const data: QAResult = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const regenerate = async (answer: QAAnswer) => {
    const q = questions.find((x) => x.id === answer.questionId);
    setRegenerating(answer.questionId); setError(null);
    try {
      const res = await fetch("/api/qa/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvText, jdText,
          question: answer.question,
          wordLimit: q?.wordLimit,
          bulletPoints: q?.bulletPoints,
          previousAnswer: answer.answer,
          feedback: feedback[answer.questionId] || undefined,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Regeneration failed"); }
      const data = await res.json();
      setResult((r) => r ? {
        ...r,
        answers: r.answers.map((a) =>
          a.questionId === answer.questionId ? { ...a, answer: data.answer, wordCount: data.wordCount } : a
        ),
      } : null);
      setFeedback((f) => { const n = { ...f }; delete n[answer.questionId]; return n; });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRegenerating(null);
    }
  };

  const copy = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="space-y-5">
      {/* Add questions */}
      {!result && (
        <div className="rounded-xl border border-[#2A3558] bg-[#0F1629] p-5 space-y-4">
          <p className="text-xs font-semibold text-[#8895B3] uppercase tracking-wider">Application Q&amp;A</p>

          {/* Empty state — explains the two-step flow */}
          {questions.length === 0 && (
            <div className="bg-[#1A2340] rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-white">How it works</p>
              <div className="space-y-2.5">
                {[
                  { n: "1", text: "Paste each question from the application form into the box below and click Add question." },
                  { n: "2", text: "Add as many questions as you need (up to 10). Set a word limit if the form specifies one." },
                  { n: "3", text: "Click Generate answers — Claude writes tailored responses using your CV and the job description." },
                ].map(({ n, text }) => (
                  <div key={n} className="flex gap-3">
                    <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</span>
                    <p className="text-sm text-[#C8D4EE] leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {questions.length > 0 && (
            <div className="space-y-2">
              {questions.map((q, i) => (
                <div key={q.id} className="flex items-start gap-2 bg-[#1A2340] rounded-lg px-3 py-2.5">
                  <span className="text-xs font-bold text-[#8895B3] mt-0.5 flex-shrink-0">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{q.text}</p>
                    {q.wordLimit && <p className="text-xs text-[#8895B3]">{q.wordLimit} words</p>}
                  </div>
                  <button onClick={() => removeQuestion(q.id)} className="text-[#3D4F6E] hover:text-red-400 text-xs flex-shrink-0">✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <textarea
              rows={2}
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="Paste an application question here..."
              className="w-full bg-[#1A2340] border border-[#2A3558] rounded-lg text-white text-sm px-3 py-2.5 outline-none focus:border-blue-500/50 resize-none placeholder-[#3D4F6E]"
            />
            <div className="space-y-2">
              <div>
                <label className="text-xs text-[#8895B3] mb-1 block">Word limit (optional)</label>
                <input
                  type="number"
                  value={newWordLimit}
                  onChange={(e) => setNewWordLimit(e.target.value)}
                  placeholder="e.g. 250"
                  className="w-full bg-[#1A2340] border border-[#2A3558] rounded-lg text-white text-sm px-3 py-2 outline-none focus:border-blue-500/50"
                />
              </div>
              <button
                onClick={addQuestion}
                disabled={!newQuestion.trim()}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                + Add question
              </button>
            </div>
            <div>
              <label className="text-xs text-[#8895B3] mb-1.5 block">Context to weave in (optional bullet points)</label>
              {newBullets.map((b, i) => (
                <input
                  key={i}
                  type="text"
                  value={b}
                  onChange={(e) => { const n = [...newBullets]; n[i] = e.target.value; setNewBullets(n); }}
                  placeholder={`Bullet ${i + 1} — e.g. Led 3-person team, reduced costs 20%`}
                  className="w-full bg-[#1A2340] border border-[#2A3558] rounded-lg text-white text-sm px-3 py-2 outline-none focus:border-blue-500/50 mb-1.5"
                />
              ))}
              <button onClick={() => setNewBullets((b) => [...b, ""])} className="text-xs text-[#8895B3] hover:text-white">+ Add bullet</button>
            </div>
          </div>

          {error && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

          {questions.length > 0 && (
            <button
              onClick={generate}
              disabled={loading}
              className="w-full py-3 rounded-lg font-semibold text-sm bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Writing answers...
                </span>
              ) : `Generate answers for ${questions.length} question${questions.length > 1 ? "s" : ""} →`}
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[#8895B3] uppercase tracking-wider">{result.answers.length} answer{result.answers.length > 1 ? "s" : ""} generated</p>
            <button onClick={() => { setResult(null); }} className="text-xs text-[#8895B3] hover:text-white">← Edit questions</button>
          </div>

          {result.overallAdvice && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1.5">Overall Advice</p>
              <p className="text-sm text-[#C8D4EE] leading-relaxed">{result.overallAdvice}</p>
            </div>
          )}

          {result.answers.map((answer) => (
            <div key={answer.questionId} className="rounded-xl border border-[#2A3558] bg-[#0F1629] p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-white leading-relaxed">{answer.question}</p>
                {answer.wordCount > 0 && (
                  <span className={`text-xs flex-shrink-0 px-2 py-0.5 rounded-full font-medium ${answer.withinLimit ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                    {answer.wordCount}w
                  </span>
                )}
              </div>

              {editingId === answer.questionId ? (
                <div className="space-y-2">
                  <textarea
                    rows={6}
                    defaultValue={answer.answer}
                    onChange={(e) => {
                      setResult((r) => r ? {
                        ...r,
                        answers: r.answers.map((a) => a.questionId === answer.questionId ? { ...a, answer: e.target.value } : a)
                      } : null);
                    }}
                    className="w-full bg-[#1A2340] border border-blue-500/40 rounded-lg text-white text-sm px-3 py-2.5 outline-none resize-none"
                  />
                  <button onClick={() => setEditingId(null)} className="text-xs text-blue-400">Done editing</button>
                </div>
              ) : (
                <div className="bg-[#1A2340] rounded-lg p-4">
                  <p className="text-sm text-[#C8D4EE] leading-relaxed whitespace-pre-wrap">{answer.answer}</p>
                </div>
              )}

              {answer.whyAsked && (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-[#8895B3] uppercase tracking-wider">Why asked</p>
                  <p className="text-xs text-[#8895B3] leading-relaxed">{answer.whyAsked}</p>
                </div>
              )}

              {answer.alternativeLine && (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-[#8895B3] uppercase tracking-wider">Alternative opening</p>
                  <p className="text-xs text-[#C8D4EE] italic">{answer.alternativeLine}</p>
                </div>
              )}

              {answer.strengthsUsed?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {answer.strengthsUsed.map((s, i) => (
                    <span key={i} className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">{s}</span>
                  ))}
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => copy(answer.questionId, answer.answer)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-[#1A2340] border border-[#2A3558] text-[#8895B3] hover:text-white transition-colors"
                >
                  {copied === answer.questionId ? "✓ Copied" : "Copy answer"}
                </button>
                <button
                  onClick={() => setEditingId(editingId === answer.questionId ? null : answer.questionId)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-[#1A2340] border border-[#2A3558] text-[#8895B3] hover:text-white transition-colors"
                >
                  Edit
                </button>
                <div className="flex gap-1.5 flex-1 min-w-0">
                  <input
                    type="text"
                    value={feedback[answer.questionId] || ""}
                    onChange={(e) => setFeedback((f) => ({ ...f, [answer.questionId]: e.target.value }))}
                    placeholder="Feedback for regeneration..."
                    className="flex-1 min-w-0 text-xs bg-[#1A2340] border border-[#2A3558] rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-blue-500/40 placeholder-[#3D4F6E]"
                  />
                  <button
                    onClick={() => regenerate(answer)}
                    disabled={regenerating === answer.questionId}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 disabled:opacity-50 transition-colors flex-shrink-0"
                  >
                    {regenerating === answer.questionId ? "..." : "Regenerate"}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {error && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [stage, setStage] = useState<AppStage>("input");
  const [cvTab, setCvTab] = useState<"upload" | "paste">("upload");
  const [cvText, setCvText] = useState("");
  const [jdText, setJdText] = useState("");
  const [linkedinText, setLinkedinText] = useState("");
  const [score, setScore] = useState<ScoreState>({ fast: null, deep: null, sessionId: null, deepLoading: false });
  const [rewrite, setRewrite] = useState<{ data: RewriteResult; intel: string } | null>(null);
  const [coverLetters, setCoverLetters] = useState<CoverLetter[] | null>(null);
  const [linkedinAnalysis, setLinkedinAnalysis] = useState<LinkedInAnalysisResult | null>(null);
  const [companyIntel, setCompanyIntel] = useState<CompanyIntelResult | null>(null);
  const [companyIntelLoading, setCompanyIntelLoading] = useState(false);
  const [outputTab, setOutputTab] = useState<"score" | "rewrite" | "cover" | "linkedin" | "tracker" | "qa">("score");
  const [jdHighlight, setJdHighlight] = useState(false);
  const [trackerEntries, setTrackerEntries] = useState<TrackerEntry[]>([]);
  const jdCardRef = useRef<HTMLDivElement>(null);
  const jdTextareaRef = useRef<HTMLTextAreaElement>(null);
  const intelDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  // Auto-fetch company intel when JD is long enough (debounced 1.5s)
  useEffect(() => {
    if (jdText.trim().length < 150) {
      setCompanyIntel(null);
      return;
    }
    if (intelDebounceRef.current) clearTimeout(intelDebounceRef.current);
    intelDebounceRef.current = setTimeout(async () => {
      setCompanyIntelLoading(true);
      try {
        const res = await apiRequest("POST", "/api/company-intel", { jdText });
        const data = await res.json();
        setCompanyIntel(data);
      } catch {
        // Silently fail — company intel is enhancement, not required
      } finally {
        setCompanyIntelLoading(false);
      }
    }, 1500);
    return () => { if (intelDebounceRef.current) clearTimeout(intelDebounceRef.current); };
  }, [jdText]);

  // Load tracker entries when user is set
  useEffect(() => {
    if (!user) return;
    apiRequest("GET", `/api/tracker/${user.id}`)
      .then((r) => r.json())
      .then((d) => setTrackerEntries(d.entries || []))
      .catch(() => {});
  }, [user, score.fast]); // re-fetch after each new score

  // After PDF upload, scroll to JD and highlight it if JD is empty
  const handlePdfUploadSuccess = useCallback(() => {
    if (jdText.trim().length < 50) {
      setTimeout(() => {
        jdCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        jdTextareaRef.current?.focus();
        setJdHighlight(true);
        setTimeout(() => setJdHighlight(false), 2500);
      }, 300);
    }
  }, [jdText]);

  const handleUser = (u: AppUser, isNew: boolean) => {
    setUser(u);
    setIsNewUser(isNew);
  };

  const fastScoreMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/score/fast", {
        cvText,
        jdText,
        userId: user?.id,
        jobTitle: companyIntel?.jobTitle || null,
        companyName: companyIntel?.companyName || null,
      });
      return res.json() as Promise<FastScoreResult & { sessionId: string }>;
    },
    onSuccess: (data) => {
      setScore((s) => ({ ...s, fast: data, sessionId: data.sessionId, deepLoading: true }));
      setStage("results");
      triggerDeepScore(data.sessionId);
    },
    onError: (err: any) => {
      toast({ title: "Scoring failed", description: err.message, variant: "destructive" });
      setStage("input");
    },
  });

  const triggerDeepScore = async (sessionId: string) => {
    try {
      const res = await apiRequest("POST", "/api/score/deep", { cvText, jdText, sessionId });
      const data = await res.json();
      setScore((s) => ({ ...s, deep: data as DeepAnalysisResult, deepLoading: false }));
    } catch {
      setScore((s) => ({ ...s, deepLoading: false }));
    }
  };

  const rewriteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/rewrite", {
        cvText,
        jdText,
        sessionId: score.sessionId,
        userId: user?.id,
        companyIntel: companyIntel ? JSON.stringify(companyIntel) : null,
      });
      return res.json() as Promise<{ rewrite: RewriteResult; companyIntel: string }>;
    },
    onSuccess: (data) => {
      setRewrite({ data: data.rewrite, intel: data.companyIntel });
      setOutputTab("rewrite");
    },
    onError: (err: any) => {
      toast({ title: "Rewrite failed", description: err.message, variant: "destructive" });
    },
  });

  const coverMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cover-letters", { cvText, jdText, sessionId: score.sessionId });
      return res.json() as Promise<{ coverLetters: CoverLetter[] }>;
    },
    onSuccess: (data) => {
      setCoverLetters(data.coverLetters);
      setOutputTab("cover");
    },
    onError: (err: any) => {
      toast({ title: "Cover letters failed", description: err.message, variant: "destructive" });
    },
  });

  const linkedinMutation = useMutation({
    mutationFn: async () => {
      const hasText = linkedinText.trim().length >= 50;
      const hasCV = cvText.trim().length > 50;
      if (!hasText && !hasCV) throw new Error("Paste your LinkedIn profile text below, or score your CV first to use CV-based mode");
      const res = await apiRequest("POST", "/api/linkedin/analyse", {
        linkedinText: hasText ? linkedinText : undefined,
        jdText,
        cvText: cvText || null,
        sessionId: score.sessionId,
        useCV: !hasText && hasCV,
      });
      return res.json() as Promise<LinkedInAnalysisResult>;
    },
    onSuccess: (data) => {
      setLinkedinAnalysis(data);
      setOutputTab("linkedin");
    },
    onError: (err: any) => {
      toast({ title: "LinkedIn analysis failed", description: err.message, variant: "destructive" });
    },
  });

  const canScore = cvText.trim().length > 50 && jdText.trim().length > 50;

  const handleScore = () => {
    if (!canScore) return;
    setStage("scoring");
    fastScoreMutation.mutate();
  };

  const reset = () => {
    setStage("input");
    setScore({ fast: null, deep: null, sessionId: null, deepLoading: false });
    setRewrite(null);
    setCoverLetters(null);
    setLinkedinAnalysis(null);
    setOutputTab("score");
    setCvText("");
    setJdText("");
    setLinkedinText("");
    setCompanyIntel(null);
  };

  // ── Email gate
  if (!user) {
    return <EmailGate onUser={handleUser} />;
  }

  // ── Scoring screen
  if (stage === "scoring") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#080D1A]">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="relative flex items-center justify-center">
            <div className="w-20 h-20 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin absolute" />
            <CVScoreLogo size={36} />
          </div>
          <div>
            <p className="font-display text-xl font-semibold text-white">Analysing your CV, {user.name.split(" ")[0]}...</p>
            <p className="text-sm text-[#8895B3] mt-1">Running keyword alignment, ATS check, and experience relevance</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            {["Keywords", "ATS", "Impact", "Structure", "Narrative"].map((label, i) => (
              <div key={label} className="flex items-center gap-1.5 text-xs text-[#8895B3]">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Results screen
  if (stage === "results" && score.fast) {
    const { fast, deep, deepLoading } = score;

    return (
      <div className="min-h-screen bg-[#080D1A] font-sans">
        <LaunchBanner />

        <header className="border-b border-[#1A2340] px-6 py-3 flex items-center justify-between sticky top-0 bg-[#080D1A]/90 backdrop-blur z-40">
          <div className="flex items-center gap-2.5">
            <CVScoreLogo size={28} />
            <span className="font-display font-semibold text-white">CVScore</span>
          </div>
          <div className="flex items-center gap-3">
            {trackerEntries.length > 0 && (
              <span className="text-xs text-[#8895B3] hidden sm:flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                {trackerEntries.length} tracked
              </span>
            )}
            <span className="text-xs text-[#8895B3] hidden sm:block">{user.name}</span>
            <Button size="sm" variant="ghost" onClick={reset} data-testid="button-new-run" className="text-[#8895B3] hover:text-white text-xs">
              ← New CV
            </Button>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-4 py-6 pb-24 space-y-6">
          {isNewUser && <EmailSentBadge email={user.email} />}

          {/* Company Intel — show if available */}
          {companyIntel && <CompanyIntelPanel intel={companyIntel} />}

          {/* Score hero */}
          <div className="rounded-2xl border border-[#2A3558] bg-[#0F1629] p-4 md:p-6 flex flex-col md:flex-row items-center gap-4 md:gap-8">
            <ScoreDial score={fast.overallScore} />
            <div className="flex-1 space-y-3">
              <p className="text-white/70 text-sm leading-relaxed">{fast.summary}</p>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-[#8895B3] uppercase tracking-wider">Top Actions</p>
                {fast.topActions.map((action, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-white">
                    <span className="text-blue-400 font-bold flex-shrink-0">{i + 1}.</span>
                    <span>{action}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Output tabs */}
          <Tabs value={outputTab} onValueChange={(v) => setOutputTab(v as any)}>
            <TabsList className="bg-[#0F1629] border border-[#2A3558] w-full h-auto p-1 grid grid-cols-6 gap-0.5">
              <TabsTrigger value="score" data-testid="tab-score" className="text-[10px] sm:text-xs px-1 py-2 min-h-[36px]">Score</TabsTrigger>
              <TabsTrigger value="rewrite" data-testid="tab-rewrite" className="text-[10px] sm:text-xs px-1 py-2 min-h-[36px]"><span className="hidden sm:inline">CV </span>Rewrite</TabsTrigger>
              <TabsTrigger value="cover" data-testid="tab-cover" className="text-[10px] sm:text-xs px-1 py-2 min-h-[36px]"><span className="hidden sm:inline">Cover </span>Letter</TabsTrigger>
              <TabsTrigger value="linkedin" data-testid="tab-linkedin" className="text-[10px] sm:text-xs px-1 py-2 min-h-[36px]">LinkedIn</TabsTrigger>
              <TabsTrigger value="tracker" data-testid="tab-tracker" className="text-[10px] sm:text-xs px-1 py-2 min-h-[36px] inline-flex items-center justify-center gap-0.5">
                Tracker {trackerEntries.length > 0 && <span className="text-[9px] bg-blue-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">{trackerEntries.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="qa" className="text-[10px] sm:text-xs px-1 py-2 min-h-[36px]">
                Q&amp;A
              </TabsTrigger>
            </TabsList>

            {/* Score Breakdown */}
            <TabsContent value="score" className="mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#2A3558] bg-[#0F1629] p-5 space-y-4">
                  <p className="text-xs font-semibold text-[#8895B3] uppercase tracking-wider">Score Breakdown</p>
                  {fast.categories.map((cat) => <CategoryBar key={cat.name} cat={cat} />)}
                </div>
                <div className="space-y-4">
                  <div className="rounded-xl border border-[#2A3558] bg-[#0F1629] p-5">
                    <p className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3">✓ Matched Keywords ({fast.keywords.matched.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {fast.keywords.matched.map((kw, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">{kw}</span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#2A3558] bg-[#0F1629] p-5">
                    <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">✗ Missing Keywords ({fast.keywords.missing.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {fast.keywords.missing.map((kw, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">{kw}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[#2A3558] bg-[#0F1629] p-5">
                <p className="text-xs font-semibold text-[#8895B3] uppercase tracking-wider mb-3">Suggestions</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {fast.categories.map((cat) => (
                    <div key={cat.name} className="flex gap-2.5 text-sm">
                      <span className="text-blue-400 flex-shrink-0 mt-0.5">→</span>
                      <div>
                        <span className="font-medium text-white">{cat.name}: </span>
                        <span className="text-[#8895B3]">{cat.suggestion}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {deepLoading ? (
                <div className="space-y-3">
                  <p className="text-xs text-[#8895B3] flex items-center gap-2">
                    <span className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
                    Running deep analysis with sonar-pro...
                  </p>
                  <SkeletonCard lines={4} />
                  <SkeletonCard lines={3} />
                </div>
              ) : deep ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-5">
                    <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">Competitive Insights</p>
                    <p className="text-sm text-[#8895B3] leading-relaxed">{deep.competitiveInsights}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-[#2A3558] bg-[#0F1629] p-5">
                      <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">Upskilling Recommendations</p>
                      <div className="space-y-3">
                        {deep.upskilling.map((u, i) => (
                          <div key={i} className="text-sm">
                            <p className="font-medium text-white">{u.skill}</p>
                            <p className="text-[#8895B3] text-xs mt-0.5">{u.reason}</p>
                            <p className="text-blue-400 text-xs mt-0.5">→ {u.resource}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#2A3558] bg-[#0F1629] p-5">
                      <p className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3">Interview Questions</p>
                      <div className="space-y-3">
                        {deep.interviewPrep.map((q, i) => (
                          <div key={i} className="text-sm">
                            <p className="font-medium text-white">"{q.question}"</p>
                            <p className="text-[#8895B3] text-xs mt-0.5">{q.hint}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </TabsContent>

            {/* CV Rewrite */}
            <TabsContent value="rewrite" className="mt-4">
              {rewrite ? (
                <RewritePanel rewrite={rewrite.data} companyIntel={rewrite.intel} />
              ) : (
                <div className="rounded-2xl border border-[#2A3558] bg-[#0F1629] p-10 text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-blue-400">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-display font-semibold text-white">AI-Optimised CV Rewrite</p>
                    <p className="text-sm text-[#8895B3] mt-1 max-w-sm mx-auto">Fully rewritten, ATS-optimised, with company intel baked in.</p>
                  </div>
                  {companyIntel && (
                    <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 bg-blue-500/10 border border-blue-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      <span className="text-xs font-semibold text-blue-400">Tailored for {companyIntel.companyName}</span>
                    </div>
                  )}
                  <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 bg-green-500/10 border border-green-500/20 ml-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="text-xs font-semibold text-green-400">Free during early access</span>
                  </div>
                  <div>
                    <Button onClick={() => rewriteMutation.mutate()} disabled={rewriteMutation.isPending} data-testid="button-generate-rewrite" className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-8">
                      {rewriteMutation.isPending ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Rewriting...</span> : "Generate Rewrite"}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Cover Letters */}
            <TabsContent value="cover" className="mt-4">
              {coverLetters ? (
                <div className="space-y-4">{coverLetters.map((letter, i) => <CoverLetterCard key={i} letter={letter} />)}</div>
              ) : (
                <div className="rounded-2xl border border-[#2A3558] bg-[#0F1629] p-10 text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-purple-400">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-display font-semibold text-white">3 Cover Letters, 3 Tones</p>
                    <p className="text-sm text-[#8895B3] mt-1 max-w-sm mx-auto">Direct & Confident, Warm & Collaborative, Strategic & Data-Led.</p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 bg-green-500/10 border border-green-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="text-xs font-semibold text-green-400">Free during early access</span>
                  </div>
                  <div>
                    <Button onClick={() => coverMutation.mutate()} disabled={coverMutation.isPending} data-testid="button-generate-cover" className="bg-purple-500 hover:bg-purple-600 text-white font-semibold px-8">
                      {coverMutation.isPending ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Writing...</span> : "Generate Cover Letters"}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* LinkedIn */}
            <TabsContent value="linkedin" className="mt-4">
              {linkedinAnalysis ? (
                <div className="space-y-4">
                  <LinkedInPanel analysis={linkedinAnalysis} cvProvided={!!cvText} />
                  <Button variant="ghost" size="sm" onClick={() => { setLinkedinAnalysis(null); setLinkedinText(""); }} className="text-xs text-[#8895B3] hover:text-white">
                    ← Analyse a different profile
                  </Button>
                </div>
              ) : (
                <div className="rounded-2xl border border-[#2A3558] bg-[#0F1629] overflow-hidden">
                  {/* Header */}
                  <div className="p-5 border-b border-[#2A3558] flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-blue-400">
                        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <rect x="2" y="9" width="4" height="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-display font-semibold text-white">LinkedIn Profile Analyser</p>
                      <p className="text-sm text-[#8895B3] mt-0.5">
                        Scores your LinkedIn against this job description — headline, about, skills, experience.
                        {cvText ? <span className="text-blue-400"> CV gap analysis included.</span> : null}
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-green-500/10 border border-green-500/20 flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      <span className="text-xs text-green-400 font-medium">Free</span>
                    </div>
                  </div>

                  {/* Step-by-step instructions */}
                  <div className="p-5 border-b border-[#2A3558] bg-[#080D1A]/40 space-y-3">
                    <p className="text-xs font-semibold text-[#8895B3] uppercase tracking-wider">How to get the best results</p>
                    <div className="space-y-3">
                      {[
                        { step: "1", color: "bg-blue-500", title: "Open your LinkedIn profile", detail: "Go to linkedin.com and navigate to your own profile page." },
                        { step: "2", color: "bg-blue-500", title: "Select all and copy", detail: 'Press Ctrl+A (Cmd+A on Mac) to select everything on the page, then Ctrl+C to copy. This captures your headline, about, experience, education, and skills in one go.' },
                        { step: "3", color: "bg-blue-500", title: "Paste below", detail: "Paste into the box below. Don't worry about formatting — the AI strips out navigation noise and focuses on your content." },
                        { step: "✓", color: "bg-green-500", title: "More = better", detail: "Include your full About section, all experience entries with descriptions, skills list, and any certifications for the most accurate score." },
                      ].map(({ step, color, title, detail }) => (
                        <div key={step} className="flex gap-3">
                          <div className={`w-5 h-5 rounded-full ${color} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                            <span className="text-white text-xs font-bold leading-none">{step}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{title}</p>
                            <p className="text-xs text-[#8895B3] mt-0.5 leading-relaxed">{detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Paste area */}
                  <div className="p-5 space-y-3">
                    {/* CV-based shortcut — shown when CV is available but no LinkedIn text yet */}
                    {cvText.trim().length > 50 && linkedinText.trim().length < 50 && (
                      <div className="bg-blue-500/8 border border-blue-500/25 rounded-xl p-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">No LinkedIn profile? Use your CV</p>
                          <p className="text-xs text-[#8895B3] mt-0.5">Claude will generate optimised LinkedIn content directly from your CV.</p>
                        </div>
                        <Button
                          onClick={() => linkedinMutation.mutate()}
                          disabled={linkedinMutation.isPending}
                          className="flex-shrink-0 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 h-auto"
                        >
                          {linkedinMutation.isPending
                            ? <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Analysing...</span>
                            : "Analyse using my CV →"}
                        </Button>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-white">Or paste your LinkedIn profile here</p>
                      {linkedinText.trim().length > 50 && (
                        <span className="text-xs text-green-400">{linkedinText.split(/\s+/).length} words — looking good</span>
                      )}
                    </div>
                    <Textarea
                      value={linkedinText}
                      onChange={(e) => setLinkedinText(e.target.value)}
                      placeholder="Paste everything from your LinkedIn profile — headline, about, experience, education, skills, certifications..."
                      data-testid="textarea-linkedin"
                      className="min-h-[180px] bg-[#1A2340] border-[#2A3558] text-white placeholder:text-white/40 text-sm resize-none focus:border-blue-500"
                    />
                    {linkedinText.trim().length > 0 && linkedinText.trim().length < 50 && (
                      <p className="text-xs text-amber-400">Keep going — paste your full profile for an accurate score</p>
                    )}
                    <Button
                      onClick={() => linkedinMutation.mutate()}
                      disabled={linkedinMutation.isPending || (linkedinText.trim().length < 50 && cvText.trim().length <= 50)}
                      data-testid="button-analyse-linkedin"
                      className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-5"
                    >
                      {linkedinMutation.isPending
                        ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Analysing your LinkedIn...</span>
                        : "Analyse My LinkedIn Profile"}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Tracker */}
            <TabsContent value="tracker" className="mt-4">
              <TrackerPanel
                entries={trackerEntries}
                onSelect={(entry) => {
                  toast({ title: entry.jobTitle, description: `${entry.companyName} — Score: ${entry.score}/100` });
                }}
              />
            </TabsContent>

            {/* Q&A */}
            <TabsContent value="qa" className="mt-4">
              <QAPanel cvText={cvText} jdText={jdText} />
            </TabsContent>
          </Tabs>

          {/* Re-engagement */}
          <div className="rounded-xl border border-[#2A3558] bg-[#0F1629] p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-white">Applying to another role?</p>
              <p className="text-xs text-[#8895B3] mt-0.5">Each JD is different — score again to see how you compare.</p>
            </div>
            <Button size="sm" onClick={reset} data-testid="button-score-again" className="bg-[#1A2340] hover:bg-[#2A3558] text-white border border-[#2A3558] text-xs flex-shrink-0">
              Score another role →
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Input stage
  return (
    <div className="min-h-screen bg-[#080D1A] font-sans">
      <LaunchBanner />

      <header className="border-b border-[#1A2340] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <CVScoreLogo size={32} />
          <span className="font-display font-bold text-white text-lg">CVScore</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#8895B3] hidden md:block">Powered by Perplexity AI</span>
          {trackerEntries.length > 0 && (
            <span className="text-xs text-blue-400 hidden sm:flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              {trackerEntries.length} role{trackerEntries.length > 1 ? "s" : ""} tracked
            </span>
          )}
          <div className="flex items-center gap-2 bg-[#0F1629] border border-[#2A3558] rounded-full pl-2 pr-3 py-1">
            <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-[#8895B3]">{isNewUser ? "Welcome," : "Back,"} {user.name.split(" ")[0]}</span>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-8 md:pt-14 pb-6 text-center">
        {!isNewUser && (
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 border border-blue-500/20 bg-blue-500/5 text-xs text-blue-400 font-medium mb-4">
            <span>Run #{(user.runCount ?? 0) + 1}</span>
            <span className="text-[#8895B3]">·</span>
            <span>Welcome back, {user.name.split(" ")[0]}</span>
          </div>
        )}
        {isNewUser && (
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 border border-green-500/20 bg-green-500/5 text-xs text-green-400 font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Real-time scoring · Company intel · LinkedIn analysis · 3 cover letter styles
          </div>
        )}
        <h1 className="font-display text-3xl md:text-4xl font-bold text-white leading-tight mb-4">
          Score your CV against{" "}
          <span className="text-blue-400">any job description</span>
        </h1>
        <p className="text-white/60 text-base leading-relaxed">
          Instant ATS score, live company intelligence, LinkedIn analysis,
          and a full CV rewrite — all free right now.
        </p>
      </div>

      <div className="max-w-3xl mx-auto px-4 pb-24 space-y-4">
        {/* CV input */}
        <div className="rounded-2xl border border-[#2A3558] bg-[#0F1629] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Your CV</p>
            <div className="flex gap-1 bg-[#1A2340] rounded-lg p-0.5">
              <button onClick={() => setCvTab("upload")} data-testid="tab-upload"
                className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${cvTab === "upload" ? "bg-blue-500 text-white" : "text-[#8895B3] hover:text-white"}`}
              >Upload PDF</button>
              <button onClick={() => setCvTab("paste")} data-testid="tab-paste"
                className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${cvTab === "paste" ? "bg-blue-500 text-white" : "text-[#8895B3] hover:text-white"}`}
              >Paste text</button>
            </div>
          </div>

          {cvTab === "upload" ? (
            <>
              <UploadZone onText={(t) => setCvText(t)} onUploadSuccess={handlePdfUploadSuccess} />
              {cvText && (
                <div className="flex items-center gap-2 text-xs text-green-400">
                  <span>✓</span>
                  <span>{cvText.split(/\s+/).length} words extracted</span>
                  <button onClick={() => setCvText("")} className="ml-auto text-[#8895B3] hover:text-white">Clear</button>
                </div>
              )}
              {cvText && !jdText && (
                <div className="flex items-center gap-2 text-xs text-blue-400 animate-pulse">
                  <span>↓</span>
                  <span>Now paste the job description below to unlock scoring</span>
                </div>
              )}
            </>
          ) : (
            <Textarea value={cvText} onChange={(e) => setCvText(e.target.value)} placeholder="Paste your CV text here..." data-testid="textarea-cv"
              className="min-h-[160px] bg-[#1A2340] border-[#2A3558] text-white placeholder:text-white/40 text-sm resize-none focus:border-blue-500"
            />
          )}
          {cvText && cvTab === "paste" && <p className="text-xs text-[#8895B3]">{cvText.split(/\s+/).length} words</p>}
        </div>

        {/* JD input */}
        <div
          ref={jdCardRef}
          className={`rounded-2xl border p-5 space-y-3 transition-all duration-300 ${
            jdHighlight
              ? "border-blue-500 bg-blue-500/5 shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
              : "border-[#2A3558] bg-[#0F1629]"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Job Description</p>
            <div className="flex items-center gap-2">
              {companyIntelLoading && (
                <span className="flex items-center gap-1.5 text-xs text-blue-400">
                  <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                  Fetching company intel...
                </span>
              )}
              {companyIntel && !companyIntelLoading && (
                <span className="flex items-center gap-1.5 text-xs text-green-400">
                  <span>✓</span>
                  {companyIntel.companyName} intel ready
                </span>
              )}
              {jdHighlight && (
                <span className="text-xs text-blue-400 font-medium animate-pulse">Paste here →</span>
              )}
            </div>
          </div>
          <Textarea
            ref={jdTextareaRef}
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste the full job description here — more detail = better score and company intelligence..."
            data-testid="textarea-jd"
            className={`min-h-[140px] bg-[#1A2340] text-white placeholder:text-white/40 text-sm resize-none transition-colors ${
              jdHighlight ? "border-blue-500" : "border-[#2A3558] focus:border-blue-500"
            }`}
          />
          {jdText && <p className="text-xs text-[#8895B3]">{jdText.split(/\s+/).length} words</p>}
        </div>

        {/* Company intel preview on input screen */}
        {companyIntel && (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-blue-400">
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" />
                <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-blue-400">{companyIntel.companyName} · {companyIntel.jobTitle}</p>
              <p className="text-xs text-[#8895B3] mt-0.5 leading-relaxed line-clamp-2">{companyIntel.overview}</p>
            </div>
          </div>
        )}

        {/* CTA */}
        <Button
          onClick={handleScore}
          disabled={!canScore || fastScoreMutation.isPending}
          data-testid="button-score"
          size="lg"
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-display font-semibold text-base py-6 rounded-xl disabled:opacity-60 min-h-[56px]"
        >
          {fastScoreMutation.isPending ? (
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Analysing...
            </span>
          ) : "Score My CV — Free"}
        </Button>
        {cvText.trim().length > 50 && jdText.trim().length <= 50 && (
          <p className="text-center text-xs text-[#8895B3]">CV ready — paste the job description above to enable scoring</p>
        )}
        {cvText.trim().length <= 50 && jdText.trim().length > 50 && (
          <p className="text-center text-xs text-[#8895B3]">JD ready — add your CV above to enable scoring</p>
        )}

        <div className="flex items-center justify-center gap-6 pt-2 flex-wrap">
          {["Instant score", "Company intel", "LinkedIn analysis", "ATS-ready"].map((feat) => (
            <div key={feat} className="flex items-center gap-1.5 text-xs text-white/60">
              <span className="text-green-400">✓</span>
              {feat}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
