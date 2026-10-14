import type { SVGProps } from "react";
import type { MedalIcon } from "./data";

/* Player-specific glyphs, drawn on the same 24px grid and stroke as Icons.tsx. */

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

export const IconCross = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <path d="M12 8v8M8 12h8" strokeWidth={2.4} />
  </svg>
);
export const IconAlert = (p: P) => (
  <svg {...base(p)}>
    <path d="M10.3 4.2 2.9 17.4A2 2 0 0 0 4.6 20.4h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9.5v4M12 17h.01" strokeWidth={2.2} />
  </svg>
);
export const IconCard = (p: P) => (
  <svg {...base(p)}>
    <rect x="6.5" y="3.5" width="11" height="17" rx="2.2" transform="rotate(8 12 12)" />
  </svg>
);
export const IconCheckCircle = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.3 12.2 2.5 2.5 4.9-5" strokeWidth={2.2} />
  </svg>
);
export const IconCompare = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 4v16M16 4v16" />
    <path d="M4 8h4M4 13h4M16 10h4M16 16h4" />
  </svg>
);
export const IconRuler = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 3h4v18H7z" />
    <path d="M11 7H9M11 11H8.5M11 15H9M11 19H8.5" />
    <path d="M16 4v16M14 6l2-2 2 2M14 18l2 2 2-2" />
  </svg>
);
export const IconBoot = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 4h5v6.5l7.2 2.2A3.5 3.5 0 0 1 20 16v1.5H4.5L5 4Z" />
    <path d="M4.5 20.5h15.5M7 17.5v3M11 17.5v3M15 17.5v3" />
  </svg>
);
export const IconCake = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 20h16M5 20v-6.5A1.5 1.5 0 0 1 6.5 12h11a1.5 1.5 0 0 1 1.5 1.5V20" />
    <path d="M5 15.5c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 5 0M12 12V8.5M12 6.2c-.9-.8-.9-1.9 0-3.2.9 1.3.9 2.4 0 3.2Z" />
  </svg>
);
export const IconShirt = (p: P) => (
  <svg {...base(p)}>
    <path d="M8.5 3.5 4 5.5 2.5 10l3 1.2V20.5h13V11.2l3-1.2L20 5.5l-4.5-2a3.5 3.5 0 0 1-7 0Z" />
  </svg>
);
export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" strokeWidth={2.2} />
  </svg>
);
export const IconTable2 = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" />
  </svg>
);
export const IconChart = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 19.5h16" />
    <path d="m5 15 4.5-5 3.5 3 6-7" />
  </svg>
);

/* Medal glyphs (filled-ish, rendered on a metal disc). */
export function MedalGlyph({ icon }: { icon: MedalIcon }) {
  const p = { width: 22, height: 22 };
  switch (icon) {
    case "ball":
      return (
        <svg {...base(p)}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m12 7.6 3.4 2.5-1.3 4h-4.2l-1.3-4L12 7.6ZM12 3.5v4.1M15.4 10.1l4.3-1.2M14.1 14.1l2.6 3.7M9.9 14.1l-2.6 3.7M8.6 10.1 4.3 8.9" />
        </svg>
      );
    case "assist":
      return (
        <svg {...base(p)}>
          <path d="M4 17c3-6 7-9 13-10" />
          <path d="m13.5 4.5 4 2.5-2.5 4" />
          <circle cx="5.5" cy="18" r="2" />
        </svg>
      );
    case "hat":
      return (
        <svg {...base(p)}>
          <path d="M3.5 17.5h17" />
          <path d="M6 17.5V9.5a6 3 0 0 1 12 0v8" />
          <path d="M6 12.5h12" />
        </svg>
      );
    case "crown":
      return (
        <svg {...base(p)}>
          <path d="m3.5 8 4.2 3.6L12 5l4.3 6.6L20.5 8l-1.8 10H5.3L3.5 8Z" />
        </svg>
      );
    case "target":
      return (
        <svg {...base(p)}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r=".9" fill="currentColor" />
        </svg>
      );
    case "pen":
      return (
        <svg {...base(p)}>
          <path d="M3.5 13V5.5h17V13" />
          <path d="M3.5 9h17M8 5.5V13M16 5.5V13" strokeWidth={1.2} />
          <circle cx="12" cy="18" r="2.6" />
        </svg>
      );
    case "flame":
      return (
        <svg {...base(p)}>
          <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.4 3.6-8.3.5 1.9 1.5 3 2.6 3.5.1-2.6 1.3-5.3 3.4-7 .3 3.4 4.4 6.2 4.4 11.6 0 3.7-2.6 6.4-7.5 6.4Z" />
        </svg>
      );
    case "shield":
      return (
        <svg {...base(p)}>
          <path d="M12 3.5 19 6v5.5c0 4.6-3 7.6-7 9-4-1.4-7-4.4-7-9V6l7-2.5Z" />
          <path d="m8.8 12 2.2 2.2 4.2-4.4" />
        </svg>
      );
    case "spark":
      return (
        <svg {...base(p)}>
          <path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.6 2.6M15.4 15.4 18 18M6 18l2.6-2.6M15.4 8.6 18 6" />
        </svg>
      );
    case "star":
    default:
      return (
        <svg {...base(p)}>
          <path d="m12 3.8 2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.8L12 3.8Z" />
        </svg>
      );
  }
}
