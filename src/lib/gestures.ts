import { useEffect, useRef } from "react";

/* Touch gestures shared across pages. */

function insideHorizontalScroller(target: EventTarget | null, root: Element): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== root) {
    if (el.scrollWidth > el.clientWidth + 4) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
    if (el.dataset?.noSwipe !== undefined) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Horizontal swipe on an element (ignores gestures that start inside
 * horizontal scrollers like chip rows or date strips, and vertical scrolls).
 * `onSwipe(-1)` = swipe left (next), `onSwipe(1)` = swipe right (previous).
 * Directions are flipped automatically in RTL layouts.
 */
export function useSwipe<T extends HTMLElement>(onSwipe: (dir: -1 | 1) => void, opts: { threshold?: number; enabled?: boolean } = {}) {
  const ref = useRef<T | null>(null);
  const cb = useRef(onSwipe);
  cb.current = onSwipe;
  const { threshold = 70, enabled = true } = opts;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let x0 = 0;
    let y0 = 0;
    let t0 = 0;
    let active = false;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1 || insideHorizontalScroller(e.target, el)) {
        active = false;
        return;
      }
      active = true;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      t0 = Date.now();
    };
    const end = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;
      if (Date.now() - t0 > 700) return;
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      const rtl = document.documentElement.dir === "rtl";
      const dir = (dx < 0 ? -1 : 1) * (rtl ? -1 : 1);
      cb.current(dir as -1 | 1);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchend", end);
    };
  }, [threshold, enabled]);
  return ref;
}

/**
 * Long-press (touch & mouse). Returns handlers to spread on an element.
 * A completed long press suppresses the click that follows.
 */
export function useLongPress(onLongPress: () => void, ms = 480) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    window.clearTimeout(timer.current);
    origin.current = null;
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const o = origin.current;
      if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      if (fired.current) e.preventDefault();
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        e.preventDefault();
        e.stopPropagation();
        fired.current = false;
      }
    },
  };
}
