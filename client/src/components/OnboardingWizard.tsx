/**
 * auth/OnboardingWizard.tsx
 * Multi-step onboarding wizard with step dots, progress bar, and Back/Next/Done navigation.
 */
import { useState, useRef, useEffect, ReactNode } from "react";

export interface WizardStep { label: string; content: ReactNode; canAdvance?: boolean; }

export interface OnboardingWizardProps {
  steps: WizardStep[]; onComplete: () => void;
  currentStep?: number; onStepChange?: (step: number) => void;
  accentColor?: string; completeLabel?: string; showStepCount?: boolean;
}

export function OnboardingWizard({ steps, onComplete, currentStep: externalStep, onStepChange, accentColor = "#3B82F6", completeLabel = "Done ✓", showStepCount = true }: OnboardingWizardProps) {
  const [internalStep, setInternalStep] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const isControlled = externalStep !== undefined;
  const step = isControlled ? externalStep : internalStep;
  const total = steps.length;
  const current = steps[step];
  const canAdvance = current?.canAdvance !== false;
  const setStep = (s: number) => isControlled ? onStepChange?.(s) : setInternalStep(s);

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [step]);

  const goNext = () => { if (step === total - 1) { onComplete(); return; } setStep(Math.min(total - 1, step + 1)); };
  const goBack = () => setStep(Math.max(0, step - 1));
  const progressPct = total > 1 ? ((step / (total - 1)) * 100).toFixed(1) : "100";

  return (
    <div style={{ background: "#0F1629", border: "1px solid #2A3558", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "80vh" }}>
      <div style={{ height: 3, background: "#1A2340", position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${progressPct}%`, background: accentColor, transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)" }} />
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", padding: "16px 20px 12px", gap: 0 }}>
        {steps.map((s, i) => {
          const isDone = i < step; const isCurrent = i === step;
          const color = isDone || isCurrent ? accentColor : "#2A3558";
          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", flex: 1 }}>
              {i > 0 && <div style={{ flex: 1, height: 2, marginTop: 10, background: i <= step ? accentColor : "#2A3558", transition: "background 0.3s" }} />}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${color}`, background: isDone ? accentColor : isCurrent ? accentColor : "#1A2340", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: isDone || isCurrent ? "#fff" : "#3D4F6E", transition: "all 0.3s", boxShadow: isCurrent ? `0 0 10px ${accentColor}60` : "none", flexShrink: 0, zIndex: 1 }}>{isDone ? "✓" : i + 1}</div>
                <span style={{ fontSize: 9, fontWeight: 700, color: isDone ? accentColor : isCurrent ? accentColor : "#3D4F6E", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap", transition: "color 0.3s" }}>{s.label}</span>
              </div>
            </div>
          );
        })}
      </div>
      {showStepCount && <div style={{ fontSize: 11, color: "#3D4F6E", textAlign: "center", marginBottom: 4, letterSpacing: "0.06em" }}>Step {step + 1} of {total}</div>}
      <div ref={bodyRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px", scrollBehavior: "smooth" }}>{current?.content}</div>
      <div style={{ borderTop: "1px solid #2A3558", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#080D1A" }}>
        <button onClick={goBack} disabled={step === 0} style={{ padding: "9px 18px", borderRadius: 9, border: "1px solid #2A3558", background: "none", color: step === 0 ? "#2A3558" : "#8895B3", fontSize: 13, fontWeight: 600, cursor: step === 0 ? "default" : "pointer" }}>← Back</button>
        <button onClick={goNext} disabled={!canAdvance} style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: canAdvance ? accentColor : "#1A2340", color: canAdvance ? "#fff" : "#3D4F6E", fontSize: 13, fontWeight: 700, cursor: canAdvance ? "pointer" : "default" }}>{step === total - 1 ? completeLabel : "Next →"}</button>
      </div>
    </div>
  );
}

export interface StepIndicatorProps { steps: string[]; currentStep: number; accentColor?: string; }

export function StepIndicator({ steps, currentStep, accentColor = "#3B82F6" }: StepIndicatorProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {steps.map((label, i) => {
        const isDone = i < currentStep; const isCurrent = i === currentStep;
        const color = isDone || isCurrent ? accentColor : "#2A3558";
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            {i > 0 && <div style={{ flex: 1, height: 1.5, background: i <= currentStep ? accentColor : "#2A3558", transition: "background 0.3s" }} />}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${color}`, background: isDone ? accentColor : isCurrent ? accentColor : "#1A2340", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: isDone || isCurrent ? "#fff" : "#3D4F6E", flexShrink: 0 }}>{isDone ? "✓" : i + 1}</div>
              <span style={{ fontSize: 9, color: isDone ? accentColor : isCurrent ? accentColor : "#3D4F6E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
