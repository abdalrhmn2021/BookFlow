"use client";

import { useBrand } from "@/context/BrandContext";

// The client's logo (BRAND_LOGO_URL) when there is one, otherwise the default BookFlow mark.
// The name next to it is BRAND_NAME / BRAND_NAME_AR.
export default function Logo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  const { name, logoUrl } = useBrand();

  return (
    <span className="inline-flex items-center gap-2">
      {logoUrl ? (
        // A plain <img>: the logo can be any URL (Cloudinary, the client's site...) and
        // next/image would need every host listed in next.config.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-8 w-auto max-w-32 shrink-0 rounded-md object-contain" />
      ) : (
        <DefaultMark light={light} />
      )}
      <span
        className={`font-display text-lg font-semibold tracking-tight ${light ? "text-white" : "text-navy-900"} ${
          compact ? "hidden sm:inline" : ""
        }`}
      >
        {name}
      </span>
    </span>
  );
}

function DefaultMark({ light }: { light: boolean }) {
  return (
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
            className={row === 1 && col === 1 ? "fill-brand-500" : light ? "fill-white/40" : "fill-white/35"}
          />
        )),
      )}
    </svg>
  );
}
