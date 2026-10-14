import { useEffect, useRef, useState } from "react";

/* Shared motion helpers. All respect prefers-reduced-motion. */

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Animated number: counts from the previous value (or 0) to `value` when it
 * changes or first scrolls into view. Returns the number to render.
 */
export function useCountUp(value: number, opts: { duration?: number; decimals?: number; start?: boolean } = {}) {
  const { duration = 900, decimals = 0, start = true } = opts;
  const [shown, setShown] = useState(start && !prefersReducedMotion() ? 0 : value);
  const from = useRef(shown);
  useEffect(() => {
    if (!start) return;
    if (prefersReducedMotion()) {
      setShown(value);
      from.current = value;
      return;
    }
    const a = from.current;
    const b = value;
    if (a === b) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - p, 4); // ease-out-quart
      const v = a + (b - a) * e;
      setShown(Number(v.toFixed(decimals)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, decimals, start]);
  return shown;
}

/**
 * Reveal-on-scroll for charts: returns a ref and `drawn` (true once the
 * element has entered the viewport). Use `drawn` to switch marks from their
 * zero state to their final geometry so CSS transitions draw them in.
 */
export function useDrawIn<T extends Element>(rootMargin = "-10% 0px") {
  const ref = useRef<T | null>(null);
  const [drawn, setDrawn] = useState(() => prefersReducedMotion());
  useEffect(() => {
    if (drawn) return;
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) {
      setDrawn(true);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          // Next frame so the zero state paints first and the transition runs.
          requestAnimationFrame(() => setDrawn(true));
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [drawn, rootMargin]);
  return [ref, drawn] as const;
}

/**
 * Detects a score increase for a match side and returns which side should
 * "flash" for ~2.6s (apply the `.goal-flash` class to the score/row).
 */
export function useScoreFlash(home: number | null | undefined, away: number | null | undefined) {
  const prev = useRef<[number | null | undefined, number | null | undefined]>([home, away]);
  const [flash, setFlash] = useState<"home" | "away" | null>(null);
  useEffect(() => {
    const [ph, pa] = prev.current;
    prev.current = [home, away];
    let side: "home" | "away" | null = null;
    if (ph != null && home != null && home > ph) side = "home";
    else if (pa != null && away != null && away > pa) side = "away";
    if (!side) return;
    setFlash(side);
    const id = window.setTimeout(() => setFlash(null), 2600);
    return () => window.clearTimeout(id);
  }, [home, away]);
  return flash;
}
