import { useState, useEffect } from "react";

const FREE_UNTIL = new Date("2026-07-29T23:59:59Z");

function getTimeLeft() {
  const now = new Date();
  const diff = FREE_UNTIL.getTime() - now.getTime();
  if (diff <= 0) return null;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return { days, hours, minutes, seconds };
}

export function LaunchBanner() {
  const [time, setTime] = useState(getTimeLeft());

  useEffect(() => {
    const interval = setInterval(() => setTime(getTimeLeft()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!time) return null;

  return (
    <div className="bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10 border-b border-blue-500/15">
      <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
          <span className="text-xs font-semibold text-white">Free Early Access</span>
          <span className="text-xs text-[#8895B3] hidden sm:block">— CV Rewrite &amp; Cover Letters are free until launch</span>
        </div>

        {/* Countdown */}
        <div className="flex items-center gap-1.5">
          {[
            { val: time.days, label: "d" },
            { val: time.hours, label: "h" },
            { val: time.minutes, label: "m" },
            { val: time.seconds, label: "s" },
          ].map(({ val, label }) => (
            <div key={label} className="flex items-center gap-0.5">
              <span className="font-display font-bold text-white text-sm tabular-nums w-5 text-right">
                {String(val).padStart(2, "0")}
              </span>
              <span className="text-[10px] text-[#8895B3]">{label}</span>
              {label !== "s" && <span className="text-[#8895B3] text-sm font-light ml-1">·</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
