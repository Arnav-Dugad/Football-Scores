/**
 * Interaction & motion layer.
 *
 * Slots used by App.tsx:
 *  - LiveTicker:   slim glass marquee of live matches under the nav (hidden on match pages).
 *  - SearchButton: opens the global command palette (⌘K / Ctrl+K, "/").
 *  - NavTitle:     compact title that appears in the nav when the page's large title scrolls away.
 *  - LiveDot:      pulsing dot on the Scores tab while the live socket is open and matches are live.
 *  - InteractionLayer: page transitions, keyboard shortcuts, goal toasts, search,
 *    shortcuts sheet, long-press match peek and pull-to-refresh.
 */
import { useEffect } from "react";
import { onPatch } from "../lib/live";
import { PeekHost } from "./peek";
import { PullToRefresh } from "./ptr";
import { SearchHost } from "./search";
import { ShortcutsHost, useGlobalShortcuts } from "./shortcuts";
import { rememberMatches } from "./store";
import { useSnapshot } from "./ticker";
import { GoalToasts } from "./toasts";
import { useViewTransitions } from "./transitions";

export { NavTitle } from "./navtitle";
export { SearchButton } from "./search";
export { LiveDot, LiveTicker } from "./ticker";

export function InteractionLayer() {
  useViewTransitions();
  useGlobalShortcuts();

  // One owner refreshes the live snapshot; everyone else reads the shared cache.
  const snap = useSnapshot(true);
  useEffect(() => rememberMatches(snap.data?.events), [snap.data]);
  useEffect(() => onPatch((list) => rememberMatches(list)), []);

  return (
    <>
      <GoalToasts />
      <PullToRefresh />
      <PeekHost />
      <SearchHost />
      <ShortcutsHost />
    </>
  );
}
