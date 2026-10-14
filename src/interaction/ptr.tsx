import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { t } from "../i18n";
import { revalidate } from "../lib/hooks";
import { haptic } from "../lib/settings";
import { modalOpen } from "./store";

/**
 * Pull to refresh (touch only, at the very top of the page). A glass puck
 * drops from under the nav with rubber-band resistance; a football spins with
 * the pull, "clicks" (haptic) past the threshold, spins while the current
 * page's data revalidates, then shows a tick. Native browser PTR is disabled
 * in CSS (overscroll-behavior-y: contain) so the two never fight.
 */

const THRESHOLD = 72; // px of indicator travel
const MAX = 120;
const REST = 58;

/* API paths fetched while the current location was showing. */
let pagePaths = new Set<string>();
let observer: PerformanceObserver | null = null;

function trackFetches() {
  if (observer || typeof PerformanceObserver === "undefined") return;
  try {
    observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceResourceTiming[]) {
        if (e.initiatorType !== "fetch") continue;
        try {
          const u = new URL(e.name);
          if (u.origin !== location.origin || !u.pathname.startsWith("/api/")) continue;
          if (u.pathname === "/api/player" || u.pathname === "/api/live") continue;
          pagePaths.add(u.pathname + u.search);
        } catch {
          /* ignore */
        }
      }
    });
    observer.observe({ type: "resource", buffered: false });
  } catch {
    observer = null;
  }
}

/** Cached paths that belong to the page at `pathname`. */
function predicateFor(pathname: string): (p: string) => boolean {
  const seg = pathname.split("/").filter(Boolean);
  const league = seg[1] && /^[a-z]{2,6}\.[a-z0-9_]+$/.test(seg[1]) ? seg[1] : null;
  const id = seg[2] ?? null;
  return (p) => {
    if (pagePaths.has(p)) return true;
    if (p === "/api/live/snapshot") return true;
    switch (seg[0] ?? "") {
      case "":
        return p.startsWith("/api/scores") || p.startsWith("/api/calendar") || /\/news(\?|$)/.test(p);
      case "match":
        return !!id && p.includes(`event=${id}`);
      case "tables":
        return p.includes("/standings");
      case "news":
        return /\/news(\?|$)/.test(p) && (!league || p.includes(`/${league}/`));
      case "team":
        return !!id && (p.includes(`/teams/${id}`) || p.includes(`/api/team?id=${id}`));
      case "player":
        return (!!id && p.includes(`/athletes/${id}`)) || (!!league && p.startsWith(`/api/people/${league}`));
      default:
        return !!league && p.includes(league);
    }
  };
}

type Phase = "idle" | "pull" | "armed" | "loading" | "done";

function insideNoPtr(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== document.body) {
    if (el.dataset?.noPtr !== undefined) return true;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return true;
    if (el.getAttribute?.("role") === "dialog" || el.classList?.contains("sheet-backdrop") || el.classList?.contains("onboard-backdrop"))
      return true;
    // Inner vertical scrollers that are themselves scrolled keep their own gesture.
    if (el.scrollHeight > el.clientHeight + 2 && el.scrollTop > 0) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === "auto" || oy === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
}

export function PullToRefresh() {
  const { pathname, key } = useLocation();
  const puck = useRef<HTMLDivElement>(null);
  const ball = useRef<SVGSVGElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const [msg, setMsg] = useState("");

  const set = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // New location → new set of page resources.
  useEffect(() => {
    trackFetches();
    pagePaths = new Set();
  }, [key]);

  useEffect(() => {
    if (!("ontouchstart" in window)) return;
    let x0 = 0;
    let y0 = 0;
    let tracking = false;
    let engaged = false;
    let dist = 0;
    const timers: number[] = [];

    const paint = (d: number, spin = d * 3) => {
      const el = puck.current;
      if (!el) return;
      el.style.transform = `translate3d(-50%, ${d}px, 0) scale(${0.6 + 0.4 * Math.min(1, d / THRESHOLD)})`;
      el.style.opacity = String(Math.min(1, d / 36));
      if (ball.current) ball.current.style.transform = `rotate(${spin}deg)`;
    };
    const release = () => {
      const el = puck.current;
      if (!el) return;
      el.style.transition = "";
      el.style.transform = "";
      el.style.opacity = "";
      if (ball.current) ball.current.style.transform = "";
    };

    const start = (e: TouchEvent) => {
      tracking = false;
      engaged = false;
      if (e.touches.length !== 1 || phaseRef.current === "loading" || phaseRef.current === "done") return;
      if (window.scrollY > 0 || modalOpen() || insideNoPtr(e.target)) return;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      tracking = true;
    };
    const move = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - x0;
      const dy = e.touches[0].clientY - y0;
      if (!engaged) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // Horizontal gestures (carousels, day swipes) and upward scrolls are not ours.
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) * 0.8 || window.scrollY > 0) {
          tracking = false;
          return;
        }
        engaged = true;
        if (puck.current) puck.current.style.transition = "none";
        set("pull");
      }
      // Rubber band: approaches MAX asymptotically.
      dist = MAX * (1 - Math.exp(-Math.max(0, dy) / 160));
      paint(dist, dy * 2.4);
      if (dist >= THRESHOLD && phaseRef.current === "pull") {
        haptic(10);
        set("armed");
      } else if (dist < THRESHOLD && phaseRef.current === "armed") {
        set("pull");
      }
    };
    const end = () => {
      if (!tracking || !engaged) {
        tracking = false;
        return;
      }
      tracking = false;
      engaged = false;
      if (phaseRef.current !== "armed") {
        release();
        set("idle");
        return;
      }
      const el = puck.current;
      if (el) {
        el.style.transition = "";
        el.style.transform = `translate3d(-50%, ${REST}px, 0)`;
        el.style.opacity = "1";
      }
      if (ball.current) ball.current.style.transform = "";
      set("loading");
      setMsg(t("Refreshing…"));
      const started = performance.now();
      void revalidate(predicateFor(pathRef.current)).then(() => {
        const wait = Math.max(0, 650 - (performance.now() - started));
        timers.push(
          window.setTimeout(() => {
            set("done");
            haptic([8, 40, 8]);
            setMsg(t("Updated"));
            timers.push(
              window.setTimeout(() => {
                release();
                set("idle");
              }, 750),
            );
          }, wait),
        );
      });
    };

    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end, { passive: true });
    window.addEventListener("touchcancel", end, { passive: true });
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return (
    <>
      <div ref={puck} className={`ix-ptr glass-strong ${phase}`} aria-hidden>
        {phase === "done" ? (
          <svg viewBox="0 0 24 24" className="ix-ptr-check">
            <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg ref={ball} viewBox="0 0 24 24" className="ix-ptr-ball">
            <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 7.6l3.3 2.4-1.3 3.9h-4l-1.3-3.9z" fill="currentColor" />
            <path
              d="M12 7.6V3.2M15.3 10l4.1-1.4M14 13.9l2.6 3.5M10 13.9l-2.6 3.5M8.7 10L4.6 8.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {msg}
      </div>
    </>
  );
}
