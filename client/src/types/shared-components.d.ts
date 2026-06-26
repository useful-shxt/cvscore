declare module "@sc/components/auth/OnboardingWizard" {
  export interface WizardStep {
    label: string;
    content: import("react").ReactNode;
    canAdvance?: boolean;
  }
  export interface OnboardingWizardProps {
    steps: WizardStep[];
    onComplete: () => void;
    currentStep?: number;
    onStepChange?: (step: number) => void;
    accentColor?: string;
    completeLabel?: string;
    showStepCount?: boolean;
  }
  export function OnboardingWizard(props: OnboardingWizardProps): import("react").JSX.Element;
  export interface StepIndicatorProps {
    steps: string[];
    currentStep: number;
    accentColor?: string;
  }
  export function StepIndicator(props: StepIndicatorProps): import("react").JSX.Element;
}

declare module "@sc/components/overlays/DrillDownPanel" {
  export interface DrillDownPanelProps {
    open: boolean;
    children: import("react").ReactNode;
    accentColor?: string;
    onClose?: () => void;
  }
  export function DrillDownPanel(props: DrillDownPanelProps): import("react").JSX.Element | null;
}
