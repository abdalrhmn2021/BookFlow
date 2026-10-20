import { BRAND_NAME } from "@/lib/edition";

export default function Logo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      {BRAND_NAME !== "BookFlow" ? (
        <span
          aria-hidden="true"
          className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-coral-500 text-sm font-semibold text-navy-950"
        >
          {BRAND_NAME.charAt(0).toUpperCase()}
        </span>
      ) : (
        <svg viewBox="0 0 28 28" aria-hidden="true" className="h-7 w-7 shrink-0">
          <rect width="28" height="28" rx="7" className={light ? "fill-white/10" : "fill-navy-900"} />
          {[0, 1, 2].map((row) =>
            [0, 1].map((col) => (
              <rect
                key={`${row}-${col}`}
                x={7 + col * 8}
                y={6 + row * 6}
                width="6"
                height="4"
                rx="1.5"
                className={row === 1 && col === 1 ? "fill-coral-500" : light ? "fill-white/40" : "fill-white/35"}
              />
            )),
          )}
        </svg>
      )}
      <span
        className={`font-display text-lg font-semibold tracking-tight ${light ? "text-white" : "text-navy-900"} ${
          compact ? "hidden sm:inline" : ""
        }`}
      >
        {BRAND_NAME}
      </span>
    </span>
  );
}
