import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { t } from "../i18n";
import { Dialog, Kbd, isApple, useCloseOnRoute } from "./dialog";
import { isTyping, modalOpen, searchOpen, shortcutsOpen, useAtom } from "./store";

/**
 * Global keyboard shortcuts (ignored while typing or when a dialog owns focus):
 *   ⌘K / Ctrl+K, /   search          1–4  Scores, Tables, Stats, News
 *   ?                this sheet       ←/→  previous / next day (Scores page, see Scores.tsx)
 */

const SECTIONS = ["/", "/tables", "/stats", "/news"];

export function useGlobalShortcuts() {
  const nav = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K works everywhere, even in inputs, and toggles the palette.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        if (!searchOpen.get() && modalOpen()) return;
        e.preventDefault();
        shortcutsOpen.set(false);
        searchOpen.set(!searchOpen.get());
        return;
      }
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e) || modalOpen()) return;
      if (e.key === "/") {
        e.preventDefault();
        searchOpen.set(true);
      } else if (e.key === "?") {
        e.preventDefault();
        shortcutsOpen.set(true);
      } else if (/^[1-4]$/.test(e.key) && !e.shiftKey) {
        e.preventDefault();
        nav(SECTIONS[Number(e.key) - 1]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [nav]);
}

export function ShortcutsHost() {
  const open = useAtom(shortcutsOpen);
  const close = useCallback(() => shortcutsOpen.set(false), []);
  const { pathname } = useLocation();
  useCloseOnRoute(pathname, close);
  if (!open) return null;
  return <ShortcutsSheet onClose={close} />;
}

function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  const mod = isApple() ? "⌘" : "Ctrl";
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  const groups: { title: string; rows: { keys: React.ReactNode; label: string }[] }[] = [
    {
      title: t("General"),
      rows: [
        {
          keys: (
            <>
              <Kbd>{mod}</Kbd>
              <Kbd>K</Kbd>
              <span className="ix-or">{t("or")}</span>
              <Kbd>/</Kbd>
            </>
          ),
          label: t("Search"),
        },
        { keys: <Kbd>?</Kbd>, label: t("Keyboard shortcuts") },
        { keys: <Kbd>Esc</Kbd>, label: t("Close a sheet or search") },
      ],
    },
    {
      title: t("Go to"),
      rows: [
        { keys: <Kbd>1</Kbd>, label: t("Scores") },
        { keys: <Kbd>2</Kbd>, label: t("Tables") },
        { keys: <Kbd>3</Kbd>, label: t("Stats") },
        { keys: <Kbd>4</Kbd>, label: t("News") },
      ],
    },
    {
      title: t("Scores"),
      rows: [
        { keys: <Kbd>{rtl ? "→" : "←"}</Kbd>, label: t("Previous day") },
        { keys: <Kbd>{rtl ? "←" : "→"}</Kbd>, label: t("Next day") },
        {
          keys: (
            <>
              <Kbd>⇧</Kbd>
              <Kbd>F10</Kbd>
            </>
          ),
          label: t("Preview the focused match"),
        },
      ],
    },
  ];
  return (
    <Dialog label={t("Keyboard shortcuts")} onClose={onClose} variant="sheet" closeButton>
      {() => (
        <div className="ix-shortcuts">
          <h2 className="ix-sheet-title">{t("Keyboard shortcuts")}</h2>
          {groups.map((g) => (
            <section key={g.title} className="ix-sc-group">
              <h3>{g.title}</h3>
              <dl>
                {g.rows.map((r) => (
                  <div className="ix-sc-row" key={r.label}>
                    <dt>{r.label}</dt>
                    <dd>{r.keys}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <p className="ix-sc-foot">{t("Shortcuts are paused while you type in a field.")}</p>
        </div>
      )}
    </Dialog>
  );
}
