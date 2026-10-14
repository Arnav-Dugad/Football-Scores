import type { SVGProps } from "react";
import { IconBall, IconSub, IconWhistle } from "../Icons";
import type { PlayKind } from "./data";

/* Play-type glyphs for commentary and timelines (24px grid, currentColor). */

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

export const IconTarget = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </svg>
);
export const IconWide = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 18V8h9v10" />
    <path d="M14 13c3 0 5-2 6.5-5M17.5 7.5l3 .5-.4 3" />
  </svg>
);
export const IconBlock = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5 19 6v5.5c0 4.2-3 7.3-7 9-4-1.7-7-4.8-7-9V6l7-2.5Z" />
    <path d="M9 12h6" />
  </svg>
);
export const IconPost = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 20V5h14v15" strokeWidth={2.4} />
    <path d="m9.5 9.5 3 2M14 8l2.5-1.2" />
  </svg>
);
export const IconCorner = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 21V3.5l10 3.6-10 3.6" />
    <path d="M3 21h9" />
  </svg>
);
export const IconHand = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V5a1.5 1.5 0 0 1 3 0v5.5M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.6a5 5 0 0 1-3.9-1.9L4 14.5a1.5 1.5 0 0 1 2.3-1.9L8 14" />
  </svg>
);
export const IconOffside = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 21V4h10l-3 3.5 3 3.5H7" />
    <path d="M3 21h18" />
  </svg>
);
export const IconVar = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="12.5" rx="2.5" />
    <path d="M7 9l1.8 5L10.6 9M13 14l1.6-5 1.6 5M13.6 12.4h2.2" strokeWidth={1.6} />
    <path d="M9 20.5h6" />
  </svg>
);
export const IconPause = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M10 9v6M14 9v6" />
  </svg>
);
export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);
export const IconDot = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);
export const IconFoul = IconWhistle;

export function PlayIcon({ kind }: { kind: PlayKind }) {
  switch (kind) {
    case "goal":
    case "owngoal":
    case "penGoal":
      return <IconBall />;
    case "yellow":
      return <i className="card-y" />;
    case "red":
      return <i className="card-r" />;
    case "sub":
      return <IconSub />;
    case "saved":
      return <IconTarget />;
    case "missed":
    case "penMiss":
      return <IconWide />;
    case "blocked":
      return <IconBlock />;
    case "woodwork":
      return <IconPost />;
    case "corner":
      return <IconCorner />;
    case "foul":
      return <IconFoul />;
    case "handball":
      return <IconHand />;
    case "offside":
      return <IconOffside />;
    case "var":
      return <IconVar />;
    case "start":
    case "end":
      return <IconWhistle />;
    case "delay":
      return <IconPause />;
    case "added":
      return <IconPlus />;
    default:
      return <IconDot />;
  }
}
