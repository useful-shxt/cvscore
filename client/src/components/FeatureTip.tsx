/**
 * Sequential feature-discovery tips shown after the interactive wizard closes.
 * Appears as a bottom-of-screen floating card, one tip at a time.
 */
import { useEffect, useState } from "react";

const TIPS = [
  { icon: "✍️", tab: "Rewrite tab", text: "Get an AI-rewritten CV tailored to this exact role" },
  { icon: "📄", tab: "Cover Letter tab", text: "One-click cover letter generation in 3 tones" },
  { icon: "💼", tab: "LinkedIn tab", text: "Optimise your profile or upload your data export for deep analysis" },
  { icon: "🎤", tab: "Q&A tab", text: "Practise interview questions specific to this role" },
];

export interface FeatureTipProps {
  tipIdx: number; // -1 = none, 0-3 = which tip
  onDismiss: (nextIdx: number) => void;
}

export function FeatureTip({ tipIdx, onDismiss }: FeatureTipProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (tipIdx < 0 || tipIdx >= TIPS.length) { setVisible(false); return; }
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, [tipIdx]);

  if (tipIdx < 0 || tipIdx >= TIPS.length) return null;
  const tip = TIPS[tipIdx];

  const handleDismiss = () => {
    setVisible(false);
    const next = tipIdx + 1;
    setTimeout(() => onDismiss(next < TIPS.length ? next : -1), 300);
  };

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100vw-2rem)] max-w-sm transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <div className="flex items-center gap-3 bg-[#0F1629] border border-[#2A3558] rounded-2xl px-4 py-3 shadow-2xl">
        <span className="text-xl flex-shrink-0">{tip.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white">{tip.tab}</p>
          <p className="text-xs text-[#8895B3] leading-relaxed">{tip.text}</p>
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold transition-colors whitespace-nowrap"
        >
          Got it →
        </button>
      </div>
    </div>
  );
}
