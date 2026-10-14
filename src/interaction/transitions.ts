import { useContext, useEffect } from "react";
import { UNSAFE_DataRouterContext, useNavigate } from "react-router-dom";
import { endpoints } from "../lib/api";
import { peekCache, prefetch } from "../lib/hooks";
import { prefersReducedMotion } from "../lib/motion";
import { returnMatch } from "./store";

/**
 * Global page transitions (View Transitions API via React Router's data
 * router), without touching any page:
 *
 * 1. Every router navigation (Links, NavLinks, navigate()) is opted into a
 *    view transition by wrapping `router.navigate`. Navigations that pass their
 *    own `viewTransition`, `replace` navigations (filters, pickers, search
 *    params) and same-path navigations are left alone, and `state`/`replace`
 *    options are always preserved.
 * 2. Plain internal `<a href>` anchors that no router Link handled are
 *    intercepted (same origin, primary button, no modifiers, no target, no
 *    download) and routed client-side with a transition.
 * 3. Shared elements: the clicked match card's crests and score get
 *    `vt-crest-<id>-home|away` / `vt-score-<id>` so they morph into the match
 *    hero, and back again on return.
 *
 * Feature-detected; disabled for prefers-reduced-motion.
 */

type RouterLike = NonNullable<React.ContextType<typeof UNSAFE_DataRouterContext>>["router"];

const SECTION_ROOTS = ["/", "/tables", "/stats", "/news", "/settings"];

function supported(): boolean {
  return typeof document !== "undefined" && typeof (document as Document & { startViewTransition?: unknown }).startViewTransition === "function";
}

function section(pathname: string): string {
  if (pathname === "/" || pathname.startsWith("/match")) return "/";
  return "/" + (pathname.split("/")[1] ?? "");
}

function targetPath(to: unknown): string | null {
  try {
    if (typeof to === "string") return new URL(to, location.href).pathname;
    if (to && typeof to === "object" && "pathname" in to && typeof (to as { pathname?: unknown }).pathname === "string")
      return new URL((to as { pathname: string }).pathname, location.href).pathname;
    if (to && typeof to === "object") return location.pathname; // search/hash-only change
  } catch {
    /* ignore */
  }
  return null;
}

function setDirection(dir: "forward" | "back" | "tab") {
  document.documentElement.dataset.vtDir = dir;
}

let activeTimer: number | undefined;
function markActive() {
  const root = document.documentElement;
  root.dataset.vtActive = "";
  window.clearTimeout(activeTimer);
  activeTimer = window.setTimeout(() => delete root.dataset.vtActive, 900);
}

/* Last activated anchor (pointer or keyboard), to find shared elements. */
let lastAnchor: { el: HTMLAnchorElement; at: number } | null = null;

const named: HTMLElement[] = [];
function clearNames() {
  while (named.length) named.pop()!.style.removeProperty("view-transition-name");
}

/**
 * Give the clicked card's crests/score their shared names and strip stray
 * inline names elsewhere (names must be unique per snapshot).
 */
function prepareSharedElements(path: string) {
  clearNames();
  const anchor = lastAnchor && performance.now() - lastAnchor.at < 1500 ? lastAnchor.el : null;
  const match = /^\/match\/[^/]+\/([^/]+)/.exec(path);
  returnMatch.set(match ? match[1] : null);
  for (const el of document.querySelectorAll<HTMLElement>('[style*="view-transition-name"]')) {
    if (anchor && anchor.contains(el)) continue;
    el.style.removeProperty("view-transition-name");
  }
  if (!anchor || !match) return;
  for (const el of anchor.querySelectorAll<HTMLElement>("[data-vt]")) {
    if (!el.dataset.vt?.includes(match[1])) continue;
    el.style.setProperty("view-transition-name", el.dataset.vt);
    named.push(el);
  }
  window.setTimeout(clearNames, 1200);
}

/** Wait briefly for a match summary so the hero exists when the new page is captured. */
function waitForSummary(path: string): Promise<void> {
  const m = /^\/match\/([^/]+)\/([^/?#]+)/.exec(path);
  if (!m) return Promise.resolve();
  const key = endpoints.summary(m[1], m[2]);
  if (peekCache(key) !== undefined) return Promise.resolve();
  prefetch(key);
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (peekCache(key) !== undefined || performance.now() - t0 > 220) resolve();
      else window.setTimeout(tick, 20);
    };
    tick();
  });
}

export function useViewTransitions() {
  const ctx = useContext(UNSAFE_DataRouterContext);
  const navigate = useNavigate();
  const router = ctx?.router as RouterLike | undefined;

  // 1 + 3: wrap router.navigate.
  useEffect(() => {
    if (!router || !supported()) return;
    const original = router.navigate;
    let pending = 0;
    const wrapped = ((to: unknown, opts?: Record<string, unknown>) => {
      // Any newer navigation supersedes one still waiting for its data.
      const id = ++pending;
      // (Links always pass a `viewTransition` key, usually undefined — only an explicit value opts out.)
      if (typeof to === "number" || prefersReducedMotion() || (opts && (opts.viewTransition !== undefined || opts.replace))) {
        return (original as (...a: unknown[]) => Promise<void>).call(router, to, opts);
      }
      const path = targetPath(to);
      if (!path || path === location.pathname) {
        return (original as (...a: unknown[]) => Promise<void>).call(router, to, opts);
      }
      // Section roots: lateral cross-fade between tabs, or "up" within the same section.
      setDirection(SECTION_ROOTS.includes(path) ? (section(location.pathname) === path ? "back" : "tab") : "forward");
      prepareSharedElements(path);
      return waitForSummary(path).then(() => {
        if (id !== pending) return; // superseded by a newer navigation
        markActive();
        return (original as (...a: unknown[]) => Promise<void>).call(router, to, { ...opts, viewTransition: true });
      });
    }) as RouterLike["navigate"];
    router.navigate = wrapped;

    // Back/forward: React Router replays the transition; pick the direction from
    // the history index it stores. Its subscribers run before the transition starts.
    const readIdx = () => (history.state as { idx?: number } | null)?.idx ?? 0;
    let idx = readIdx();
    let lastKey = router.state.location.key;
    const unsub = router.subscribe((state) => {
      if (state.location.key === lastKey) return;
      lastKey = state.location.key;
      const next = readIdx();
      if (state.historyAction === "POP") {
        pending++;
        setDirection(next < idx ? "back" : "forward");
        clearNames();
        markActive();
      }
      idx = next;
    });

    return () => {
      if (router.navigate === wrapped) router.navigate = original;
      unsub();
    };
  }, [router]);

  // Remember the anchor that started a navigation.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (a instanceof HTMLAnchorElement) lastAnchor = { el: a, at: performance.now() };
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // 2: plain internal anchors that no router Link handled.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!(a instanceof HTMLAnchorElement) || !a.href) return;
      if (a.hasAttribute("download") || (a.target && a.target !== "_self") || a.dataset.native !== undefined) return;
      if ((a.getAttribute("rel") ?? "").split(/\s+/).includes("external")) return;
      let url: URL;
      try {
        url = new URL(a.href, location.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      // In-page anchors (e.g. the skip link) keep native behaviour.
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      e.preventDefault();
      navigate(url.pathname + url.search + url.hash);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [navigate]);
}
