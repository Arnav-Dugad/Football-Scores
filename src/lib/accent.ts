import { useEffect } from "react";
import { teamTint } from "./format";

/**
 * Team-colour accent: tints the ambient background orbs with up to two team
 * colours while a page is mounted (e.g. a match or club page), and restores
 * the default palette on unmount. Pass null/[] to leave the default.
 */
export function useAccent(colors: (string | null | undefined)[] | null) {
  const key = (colors ?? []).join("|");
  useEffect(() => {
    const list = (colors ?? []).map((c) => (c ? teamTint(c, "") : "")).filter(Boolean);
    if (!list.length) return;
    const root = document.documentElement;
    const [a, b] = [list[0], list[1] ?? list[0]];
    root.style.setProperty("--accent-orb-1", a);
    root.style.setProperty("--accent-orb-2", b);
    root.setAttribute("data-accent", "on");
    return () => {
      root.style.removeProperty("--accent-orb-1");
      root.style.removeProperty("--accent-orb-2");
      root.removeAttribute("data-accent");
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
