/**
 * overlays/DrillDownPanel.tsx
 * Animated fade-in panel that appears below a triggering card when open — for click-to-reveal detail.
 */
import { ReactNode } from "react";

export interface DrillDownPanelProps {
  open: boolean;
  children: ReactNode;
  accentColor?: string;
  onClose?: () => void;
}

export function DrillDownPanel({ open, children, accentColor = "#3B82F6", onClose }: DrillDownPanelProps) {
  if (!open) return null;

  return (
    <div
      className="rounded-xl border p-5 mt-3"
      style={{
        background: "#0F1629",
        borderColor: `${accentColor}40`,
        animation: "fadeUp 0.2s ease forwards",
      }}
    >
      {onClose && (
        <div className="flex justify-end mb-3">
          <button
            onClick={onClose}
            className="text-xs font-semibold px-2.5 py-1 rounded-md border border-[#2A3558] bg-[#1A2340] text-[#8895B3] hover:text-[#F0F4FF] transition-colors"
          >
            ✕ Close
          </button>
        </div>
      )}
      {children}
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
