/**
 * predict.tsx — Add to client/src/pages/predict.tsx
 *
 * Sports prediction tool — one high-conviction pick per sport per day
 * Powered by Claude Sonnet (via /api/predict/:sport)
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Sport = "worldcup" | "premier_league" | "ipl";

interface MatchInfo {
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  competition: string;
  venue: string;
  kickoff: string;
}

interface PredictionData {
  pick: string;
  pickDescription: string;
  confidence: number;
  reasoning: string;
  keyFactors: string[];
  matchContext: string;
  riskNote: string;
  alternativeAngle: string;
  generatedAt: string;
  sport: string;
}

interface PredictionResponse {
  match: MatchInfo;
  prediction: PredictionData;
  otherMatches: { homeTeam: string; awayTeam: string; kickoff: string }[];
}

const SPORTS: { id: Sport; label: string; emoji: string; desc: string; color: string }[] = [
  { id: "worldcup", label: "World Cup 2026", emoji: "🏆", desc: "FIFA World Cup", color: "#F59E0B" },
  { id: "premier_league", label: "Premier League", emoji: "⚽", desc: "English PL 2024/25", color: "#3B82F6" },
  { id: "ipl", label: "IPL", emoji: "🏏", desc: "Indian Premier League", color: "#10B981" },
];

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 80 ? "#10B981" : value >= 65 ? "#F59E0B" : "#EF4444";
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs font-semibold text-[#8895B3] uppercase tracking-wider">Confidence</span>
        <span className="font-display font-bold text-white text-sm">{value}%</span>
      </div>
      <div className="h-2 bg-[#1A2340] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default function Predict() {
  const [selectedSport, setSelectedSport] = useState<Sport>("worldcup");

  const { data, isLoading, isError, refetch } = useQuery<PredictionResponse>({
    queryKey: ["predict", selectedSport],
    queryFn: () => apiRequest("GET", `/api/predict/${selectedSport}`),
    staleTime: 1000 * 60 * 30, // cache 30 min — predictions don't change during the day
    retry: 2,
  });

  return (
    <div className="min-h-screen bg-[#080D1A]">
      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-full px-4 py-1.5 mb-4">
            <span className="text-[#F59E0B] text-xs font-bold uppercase tracking-widest">Daily Pick</span>
          </div>
          <h1 className="font-display font-black text-4xl text-white mb-3 tracking-tight">
            One prediction.<br />
            <span className="text-[#F59E0B]">Maximum conviction.</span>
          </h1>
          <p className="text-[#8895B3] text-base max-w-sm mx-auto leading-relaxed">
            Claude analyses form, head-to-head, injuries and tactics to produce a single high-confidence pick. Updated daily.
          </p>
        </div>

        {/* Sport selector */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {SPORTS.map((sport) => (
            <button
              key={sport.id}
              onClick={() => setSelectedSport(sport.id)}
              className={`p-4 rounded-xl border text-left transition-all ${
                selectedSport === sport.id
                  ? "border-blue-500/40 bg-blue-500/10"
                  : "border-[#2A3558] bg-[#1A2340] hover:border-[#2A3558]/80"
              }`}
            >
              <div className="text-2xl mb-1">{sport.emoji}</div>
              <div className="text-xs font-bold text-white">{sport.label}</div>
              <div className="text-xs text-[#8895B3] mt-0.5">{sport.desc}</div>
            </button>
          ))}
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="bg-[#1A2340] border border-[#2A3558] rounded-2xl p-8 text-center">
            <div className="w-10 h-10 border-2 border-[#2A3558] border-t-blue-400 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[#8895B3] text-sm">Analysing fixtures and form...</p>
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center">
            <p className="text-red-400 mb-3">Could not load today's prediction.</p>
            <Button onClick={() => refetch()} variant="outline" size="sm">Try again</Button>
          </div>
        )}

        {/* No matches */}
        {data && !data.prediction && (
          <div className="bg-[#1A2340] border border-[#2A3558] rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">😴</div>
            <p className="text-white font-semibold mb-1">No matches today</p>
            <p className="text-[#8895B3] text-sm">Check back when the next fixture is scheduled.</p>
          </div>
        )}

        {/* Prediction card */}
        {data?.prediction && data?.match && (
          <div className="space-y-4">

            {/* Match header */}
            <div className="bg-[#1A2340] border border-[#2A3558] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <Badge className="text-[10px] font-bold uppercase tracking-widest bg-blue-500/15 text-blue-400 border-blue-500/30">
                  {data.match.competition}
                </Badge>
                <span className="text-[#8895B3] text-xs">{data.match.kickoff || data.match.matchDate}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-center flex-1">
                  <div className="font-display font-black text-xl text-white">{data.match.homeTeam}</div>
                  <div className="text-[10px] text-[#8895B3] mt-1 uppercase tracking-wider">Home</div>
                </div>
                <div className="text-[#2A3558] font-bold text-xl">vs</div>
                <div className="text-center flex-1">
                  <div className="font-display font-black text-xl text-white">{data.match.awayTeam}</div>
                  <div className="text-[10px] text-[#8895B3] mt-1 uppercase tracking-wider">Away</div>
                </div>
              </div>
              {data.match.venue && (
                <p className="text-center text-xs text-[#8895B3] mt-3">📍 {data.match.venue}</p>
              )}
            </div>

            {/* The pick */}
            <div className="bg-gradient-to-br from-[#0F1629] to-[#1A2340] border border-[#F59E0B]/30 rounded-2xl p-6">
              <div className="text-xs font-bold uppercase tracking-widest text-[#F59E0B] mb-3">Today's Pick</div>
              <div className="font-display font-black text-3xl text-white mb-1">
                {data.prediction.pick}
              </div>
              <div className="text-[#8895B3] text-sm mb-5">{data.prediction.pickDescription}</div>
              <ConfidenceBar value={data.prediction.confidence} />
            </div>

            {/* Reasoning */}
            <div className="bg-[#1A2340] border border-[#2A3558] rounded-2xl p-6">
              <div className="text-xs font-bold uppercase tracking-widest text-[#8895B3] mb-3">The Analysis</div>
              <p className="text-[#C8D4EE] text-sm leading-relaxed mb-5">{data.prediction.reasoning}</p>

              <div className="text-xs font-bold uppercase tracking-widest text-[#8895B3] mb-3">Key Factors</div>
              <ul className="space-y-2">
                {data.prediction.keyFactors.map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm text-[#C8D4EE]">
                    <span className="text-[#F59E0B] flex-shrink-0">→</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Context + Risk */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#1A2340] border border-[#2A3558] rounded-xl p-4">
                <div className="text-xs font-bold uppercase tracking-widest text-[#8895B3] mb-2">Context</div>
                <p className="text-[#C8D4EE] text-xs leading-relaxed">{data.prediction.matchContext}</p>
              </div>
              <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-4">
                <div className="text-xs font-bold uppercase tracking-widest text-red-400/70 mb-2">Risk</div>
                <p className="text-[#C8D4EE] text-xs leading-relaxed">{data.prediction.riskNote}</p>
              </div>
            </div>

            {/* Other side */}
            <div className="bg-[#1A2340] border border-[#2A3558] rounded-xl p-4">
              <div className="text-xs font-bold uppercase tracking-widest text-[#8895B3] mb-2">Other Side of the Coin</div>
              <p className="text-[#C8D4EE] text-xs leading-relaxed">{data.prediction.alternativeAngle}</p>
            </div>

            {/* Other matches today */}
            {data.otherMatches?.length > 0 && (
              <div className="bg-[#1A2340] border border-[#2A3558] rounded-xl p-4">
                <div className="text-xs font-bold uppercase tracking-widest text-[#8895B3] mb-3">Other Fixtures Today</div>
                <div className="space-y-2">
                  {data.otherMatches.map((m, i) => (
                    <div key={i} className="flex justify-between text-sm text-[#8895B3]">
                      <span>{m.homeTeam} vs {m.awayTeam}</span>
                      <span>{m.kickoff || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <p className="text-center text-xs text-[#3D4F6E] pb-4">
              For entertainment only. Not financial or betting advice.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
