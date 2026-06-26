/**
 * Expand-in-place confirm panel with optional reason input — for inline swap/replace actions.
 */
import { useState } from "react";

export interface SwapFeedback { ok: boolean; msg: string; }

export interface InlineSwapPanelProps {
  id: string;
  isOpen: boolean;
  onToggle: () => void;
  onSwap: (reason?: string) => Promise<void>;
  loading?: boolean;
  feedback?: SwapFeedback | null;
  reasonPlaceholder?: string;
  triggerLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function InlineSwapPanel({ isOpen, onToggle, onSwap, loading = false, feedback = null, reasonPlaceholder = "Reason (optional)", triggerLabel = "🔄 Swap", confirmLabel = "Swap", cancelLabel = "Cancel" }: InlineSwapPanelProps) {
  const [reason, setReason] = useState("");

  const handleConfirm = async () => { await onSwap(reason.trim() || undefined); setReason(""); };
  const handleCancel = () => { onToggle(); setReason(""); };

  return (
    <>
      <button type="button" onClick={onToggle} className="text-xs text-[#8895B3] hover:text-white transition-colors min-h-[44px] flex items-center gap-1 px-2">{triggerLabel}</button>
      {isOpen && (
        <div className="mt-1 space-y-2">
          {feedback ? (
            <p className={`text-xs font-semibold py-2 ${feedback.ok ? "text-green-400" : "text-red-400"}`}>{feedback.msg}</p>
          ) : (
            <>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={reasonPlaceholder} className="w-full px-3 py-2 bg-[#0F1629] border border-[#2A3558] rounded-lg text-xs text-white outline-none focus:border-blue-500/50" />
              <div className="flex gap-2 items-center">
                {loading ? (
                  <div className="flex-1 flex justify-center py-2"><div className="w-4 h-4 border-2 border-[#2A3558] border-t-blue-400 rounded-full animate-spin" /></div>
                ) : (
                  <>
                    <button type="button" onClick={handleConfirm} className="flex-1 min-h-[44px] rounded-lg bg-[#3B82F6] hover:bg-blue-500 text-white text-sm font-semibold transition-colors">{confirmLabel}</button>
                    <button type="button" onClick={handleCancel} className="text-xs text-[#8895B3] hover:text-white min-h-[44px] px-3">{cancelLabel}</button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
