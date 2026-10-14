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
export const IconGear = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.6 7.6 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.7 7.7 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.6Z" />
  </svg>
);
export const IconSearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </svg>
);
export const IconStar = (p: P) => (
  <svg {...base(p)}>
    <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />
  </svg>
);
export const IconStarFill = (p: P) => (
  <svg {...base(p)} fill="currentColor">
    <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />
  </svg>
);
export const IconTv = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="6" width="18" height="12.5" rx="2.5" />
    <path d="m8.5 2.5 3.5 3.5 3.5-3.5M8 21.5h8" />
  </svg>
);
export const IconGlobe = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z" />
  </svg>
);
export const IconClock = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.2 2" />
  </svg>
);
export const IconCheck = (p: P) => (
  <svg {...base(p)} strokeWidth={2.6}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const IconLanguage = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 5h9M8.5 3v2M6 5c.5 3 2.6 5.6 5.5 7M11 5c-.6 3.4-2.8 6.4-6.5 8.3M13 21l4-10 4 10M14.4 17.5h5.2" />
  </svg>
);
export const IconContrast = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18M12 8h4M12 12h6M12 16h4" />
  </svg>
);
export const IconPattern = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    <path d="M3.5 12 12 3.5M3.5 20 20 3.5M11.5 20.5l9-9" />
  </svg>
);
export const IconVibrate = (p: P) => (
  <svg {...base(p)}>
    <rect x="7" y="3" width="10" height="18" rx="2.5" />
    <path d="M3.5 8v8M20.5 8v8M11 17.5h2" />
  </svg>
);
export const IconTrash = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10 11v6M14 11v6" />
  </svg>
);
export const IconInfo = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.5h.01" strokeWidth={2.4} />
  </svg>
);
export const IconShare = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5v11M8 7.5l4-4 4 4M6 11H5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 5 20h14a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 19 11h-1" />
  </svg>
);
export const IconDownload = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5v12M7.5 11 12 15.5l4.5-4.5M4.5 20h15" />
  </svg>
);
export const IconLive = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" />
  </svg>
);
export const IconChevronDown = (p: P) => (
  <svg {...base(p)} strokeWidth={2.4}>
    <path d="m5 9 7 7 7-7" />
  </svg>
);
export const IconArrowUp = (p: P) => (
  <svg {...base(p)} strokeWidth={2.6}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);
export const IconSwap = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 4 3.5 7.5 7 11M3.5 7.5h13M17 13l3.5 3.5L17 20M20.5 16.5h-13" />
  </svg>
);
