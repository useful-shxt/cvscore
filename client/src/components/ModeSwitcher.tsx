/**
 * Inline pill tab toggle — controlled state toggle without tab panels.
 */

export interface Mode { value: string; label: string; }

export interface ModeSwitcherProps {
  modes: Mode[];
  value: string;
  onChange: (value: string) => void;
  accentColor?: string;
}

export function ModeSwitcher({ modes, value, onChange, accentColor }: ModeSwitcherProps) {
  const activeStyle = accentColor ? { backgroundColor: accentColor, color: "#fff" } : undefined;
  return (
    <div className="inline-flex rounded-xl border border-[#2A3558] bg-[#1A2340] p-1 gap-1 flex-wrap">
      {modes.map((mode) => {
        const isActive = mode.value === value;
        return (
          <button
            key={mode.value}
            type="button"
            onClick={() => onChange(mode.value)}
            className={["px-4 py-1.5 rounded-lg text-xs font-semibold transition-all", isActive && !accentColor ? "bg-blue-500 text-white" : isActive ? "" : "text-[#8895B3] hover:text-white"].join(" ")}
            style={isActive && accentColor ? activeStyle : undefined}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
