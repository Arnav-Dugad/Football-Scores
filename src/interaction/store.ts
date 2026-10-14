import { useSyncExternalStore } from "react";
import type { Match } from "../lib/api";

/* Tiny shared state for the interaction layer (no context needed). */

export interface Atom<T> {
  get(): T;
  set(v: T | ((prev: T) => T)): void;
  subscribe(fn: () => void): () => void;
}

export function atom<T>(initial: T): Atom<T> {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(v) {
      const next = typeof v === "function" ? (v as (p: T) => T)(value) : v;
      if (Object.is(next, value)) return;
      value = next;
      subs.forEach((fn) => fn());
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}

export function useAtom<T>(a: Atom<T>): T {
  return useSyncExternalStore(a.subscribe, a.get, a.get);
}

/* ------------------------------------------------------------ overlays -- */

export const searchOpen = atom(false);
export const shortcutsOpen = atom(false);
export const peekMatch = atom<Match | null>(null);

/** True while any of our modal surfaces (or another app dialog) is open. */
export function modalOpen(): boolean {
  return (
    searchOpen.get() ||
    shortcutsOpen.get() ||
    !!peekMatch.get() ||
    (typeof document !== "undefined" && !!document.querySelector('[aria-modal="true"]'))
  );
}

/** Keyboard events that should not trigger global shortcuts (typing, IME). */
export function isTyping(e: KeyboardEvent): boolean {
  if (e.isComposing) return true;
  const el = e.target as HTMLElement | null;
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(type);
  }
  return false;
}

/* --------------------------------------------------- matches on screen -- */

const observed = new Map<Element, string>();
const visible = new Set<Element>();
let io: IntersectionObserver | null = null;

/** Track a match card while it is in the viewport (for goal toasts). */
export function observeMatch(el: Element, id: string): () => void {
  if (typeof IntersectionObserver === "undefined") {
    observed.set(el, id);
    visible.add(el);
    return () => {
      observed.delete(el);
      visible.delete(el);
    };
  }
  io ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) visible.add(e.target);
      else visible.delete(e.target);
    }
  });
  observed.set(el, id);
  io.observe(el);
  return () => {
    io?.unobserve(el);
    observed.delete(el);
    visible.delete(el);
  };
}

export function isOnScreen(id: string): boolean {
  for (const el of visible) if (observed.get(el) === id) return true;
  return false;
}

/* ----------------------------------------------------- known matches ---- */

/** Latest copy of every match we've seen (snapshot + live patches). */
export const knownMatches = new Map<string, Match>();

export function rememberMatches(list: readonly Match[] | undefined) {
  if (!list) return;
  for (const m of list) knownMatches.set(m.id, m);
}

/* ------------------------------------------------ view-transition target - */

/** The match the viewer last opened from a card, so its crests can morph back. */
export const returnMatch = atom<string | null>(null);
