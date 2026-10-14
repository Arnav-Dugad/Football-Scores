import type { SVGProps } from "react";

/* Extra glyphs for the club & stadium pages, drawn on the same 24px grid and
   stroke weight as components/Icons.tsx. */

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const IconGrid = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
    <path d="M3.5 9.5h17M9 9.5v11M14.5 9.5v11M8 2.5v4M16 2.5v4" />
  </svg>
);
export const IconList = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <circle cx="4.5" cy="6.5" r="1" fill="currentColor" />
    <circle cx="4.5" cy="12" r="1" fill="currentColor" />
    <circle cx="4.5" cy="17.5" r="1" fill="currentColor" />
  </svg>
);
export const IconMap = (p: P) => (
  <svg {...base(p)}>
    <path d="m9 4.5-5.5 2v13l5.5-2 6 2 5.5-2v-13l-5.5 2-6-2ZM9 4.5v13M15 6.5v13" />
  </svg>
);
export const IconPlay = (p: P) => (
  <svg {...base(p)}>
    <path d="M7.5 5.2v13.6a.7.7 0 0 0 1.05.6l11.1-6.8a.7.7 0 0 0 0-1.2L8.55 4.6a.7.7 0 0 0-1.05.6Z" fill="currentColor" />
  </svg>
);
export const IconPause = (p: P) => (
  <svg {...base(p)}>
    <rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" />
  </svg>
);
export const IconShirt = (p: P) => (
  <svg {...base(p)}>
    <path d="M8.5 3.5 4 5.5 2.5 10l3 1.2V20.5h13V11.2l3-1.2L20 5.5l-4.5-2a3.5 3.5 0 0 1-7 0Z" />
  </svg>
);
export const IconCross = (p: P) => (
  <svg {...base(p)}>
    <path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6v-6Z" fill="currentColor" stroke="none" />
  </svg>
);
export const IconStadium = (p: P) => (
  <svg {...base(p)}>
    <ellipse cx="12" cy="8" rx="9" ry="3.5" />
    <path d="M3 8v7.5C3 17.4 7 19 12 19s9-1.6 9-3.5V8M7.5 11.2v7.2M16.5 11.2v7.2M12 11.5V19" />
  </svg>
);
export const IconLink = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3.3-3.3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0L5 13.3A4 4 0 0 0 10.7 19l1-1" />
  </svg>
);
export const IconTicket = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 8a2 2 0 0 0 0 4v4.5h17V12a2 2 0 0 1 0-4V3.5h-17V8Z" transform="translate(0 2)" />
    <path d="M14 5.5v1.5M14 10.5v1.5M14 15.5v1.5" transform="translate(0 1)" />
  </svg>
);
