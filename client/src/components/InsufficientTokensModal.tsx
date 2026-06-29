import { BundleCards } from "./BundleCards";

interface Bundle {
  id: string;
  tokens: number;
  normalGbp: number;
  earlyGbp: number;
}

interface PricingData {
  bundles: Bundle[];
  userIsEarlyAdopter: boolean;
  earlyAdopterSlotsAvailable: boolean;
}

interface Props {
  balance: number;
  required: number;
  pricingData: PricingData | null;
  onBuy: (bundleId: string) => void;
  onClose: () => void;
}

export function InsufficientTokensModal({ balance, required, pricingData, onBuy, onClose }: Props) {
  const bundles: Bundle[] = pricingData?.bundles ?? [
    { id: "starter",  tokens: 50,   normalGbp: 1.00, earlyGbp: 0.75 },
    { id: "standard", tokens: 200,  normalGbp: 3.00, earlyGbp: 2.00 },
    { id: "power",    tokens: 500,  normalGbp: 7.00, earlyGbp: 5.00 },
    { id: "ultimate", tokens: 1000, normalGbp: 13.00, earlyGbp: 9.00 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-[#0F1629] border border-amber-500/40 rounded-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold text-white">Not enough tokens</h3>
            <p className="text-sm text-[#8895B3] mt-1">
              This action needs <strong className="text-white">{required} token{required !== 1 ? "s" : ""}</strong> but you only have{" "}
              <strong className="text-amber-400">{balance}</strong> remaining.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-full border border-[#2A3558] text-[#8895B3] hover:text-white flex items-center justify-center text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        <BundleCards
          bundles={bundles}
          isEarlyAdopter={pricingData?.userIsEarlyAdopter ?? false}
          earlyAdopterSlotsAvailable={pricingData?.earlyAdopterSlotsAvailable ?? true}
          onBuy={(b) => onBuy(b.id)}
        />

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl border border-[#2A3558] text-[#8895B3] hover:text-white text-sm transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
