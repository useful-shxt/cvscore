interface Bundle {
  id: string;
  tokens: number;
  normalGbp: number;
  earlyGbp: number;
}

interface BundleCardsProps {
  bundles: Bundle[];
  isEarlyAdopter: boolean;
  earlyAdopterSlotsAvailable: boolean;
  onBuy: (bundle: Bundle) => void;
}

export function BundleCards({ bundles, isEarlyAdopter, earlyAdopterSlotsAvailable, onBuy }: BundleCardsProps) {
  const showEarlyPrice = isEarlyAdopter || earlyAdopterSlotsAvailable;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {bundles.map((bundle, i) => {
          const isPopular = i === 1;
          const price = showEarlyPrice ? bundle.earlyGbp : bundle.normalGbp;
          return (
            <div
              key={bundle.id}
              className={`relative rounded-xl border p-4 flex flex-col items-center gap-2 text-center ${
                isPopular
                  ? "border-blue-500/60 bg-blue-500/10"
                  : "border-[#2A3558] bg-[#0F1629]"
              }`}
            >
              {isPopular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold bg-blue-500 text-white px-2 py-0.5 rounded-full whitespace-nowrap">
                  ⭐ Popular
                </span>
              )}
              <p className="text-xs font-semibold text-[#8895B3] capitalize">{bundle.id}</p>
              <p className="text-2xl font-bold text-white">{bundle.tokens}</p>
              <p className="text-[10px] text-[#8895B3]">tokens</p>
              <div>
                <p className="text-base font-bold text-white">£{price.toFixed(2)}</p>
                {showEarlyPrice && bundle.earlyGbp < bundle.normalGbp && (
                  <p className="text-[10px] text-[#8895B3] line-through">£{bundle.normalGbp.toFixed(2)}</p>
                )}
              </div>
              <button
                onClick={() => onBuy(bundle)}
                className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors ${
                  isPopular
                    ? "bg-blue-500 hover:bg-blue-600 text-white"
                    : "bg-[#1A2340] hover:bg-[#2A3558] text-white border border-[#2A3558]"
                }`}
              >
                Buy →
              </button>
            </div>
          );
        })}
      </div>
      {showEarlyPrice && (
        <p className="text-xs text-amber-400 text-center">
          🎉 Early adopter pricing — locked forever for the first 1,000 buyers
        </p>
      )}
    </div>
  );
}
