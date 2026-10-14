import type { SVGProps } from "react";

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

export const IconScores = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="3.5" />
    <path d="M12 5v14" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M3 9.5h2.5v5H3M21 9.5h-2.5v5H21" />
  </svg>
);
export const IconTable = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth={2.6} />
  </svg>
);
export const IconStats = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);
export const IconNews = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h10A1.5 1.5 0 0 1 17 5.5V19a1 1 0 0 0 1 1H6a2 2 0 0 1-2-2V5.5Z" />
    <path d="M17 9h2.5A1.5 1.5 0 0 1 21 10.5V18a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h3" />
  </svg>
);
export const IconSun = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </svg>
);
export const IconMoon = (p: P) => (
  <svg {...base(p)}>
    <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7Z" />
  </svg>
);
export const IconAuto = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor" stroke="none" />
  </svg>
);
export const IconChevronLeft = (p: P) => (
  <svg {...base(p)} strokeWidth={2.4}>
    <path d="m15 5-7 7 7 7" />
  </svg>
);
export const IconChevronRight = (p: P) => (
  <svg {...base(p)} strokeWidth={2.4}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);
export const IconClose = (p: P) => (
  <svg {...base(p)} strokeWidth={2.6}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const IconPin = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);
export const IconCalendar = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
export const IconPeople = (p: P) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19.5c.7-3.3 3.2-5 6-5s5.3 1.7 6 5M15.5 5.2a3 3 0 0 1 0 5.6M18 14.6c1.6.6 2.7 2.1 3 4.9" />
  </svg>
);
export const IconWhistle = (p: P) => (
  <svg {...base(p)}>
    <circle cx="9" cy="14" r="5" />
    <path d="M12.5 10.5 21 7v4l-6.6 1.6M7 4l1 2.5M3.5 6.5 5.5 8" />
  </svg>
);
export const IconTrophy = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v4M8 21h8M9.5 18h5" />
  </svg>
);
export const IconBall = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden {...p}>
    <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.14" />
    <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="m12 7.2 4.1 3-1.6 4.8h-5L7.9 10.2 12 7.2Z" fill="currentColor" />
    <path
      d="M12 7.2V3M16.1 10.2l3.9-1.4M14.5 15l2.5 3.6M9.5 15 7 18.6M7.9 10.2 4 8.8"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
  </svg>
);
export const IconSub = (p: P) => (
  <svg {...base(p)} strokeWidth={2.2}>
    <path d="M7 4v13M3.5 13.5 7 17l3.5-3.5" stroke="#34c759" />
    <path d="M17 20V7M13.5 10.5 17 7l3.5 3.5" stroke="#ff3b30" />
  </svg>
);
export const IconArrowOut = (p: P) => (
  <svg {...base(p)} strokeWidth={2.6}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);
export const IconExternal = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </svg>
);
export const IconBrand = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden {...p}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M12 4v16" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
