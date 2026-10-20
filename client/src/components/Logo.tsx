// The BookFlow mark: a small grid of time slots with ONE slot taken (coral) = a booking.
// `light` = for dark backgrounds (the dashboard sidebar).
// `compact` = hide the word "BookFlow" on phones (the top bar has little room there).

export default function Logo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
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
          ))
        )}
      </svg>
      <span
        className={`font-display text-lg font-semibold tracking-tight ${light ? "text-white" : "text-navy-900"} ${
          compact ? "hidden sm:inline" : ""
        }`}
      >
        BookFlow
      </span>
    </span>
  );
}
