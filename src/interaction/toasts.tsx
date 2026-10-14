import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { IconClose } from "../components/Icons";
import { Crest } from "../components/ui";
import { t } from "../i18n";
import type { Match } from "../lib/api";
import { teamTint } from "../lib/format";
import { onGoal, type GoalEvent } from "../lib/live";
import { getSettings, haptic } from "../lib/settings";
import { isOnScreen, knownMatches } from "./store";

/**
 * Goal celebrations: a Dynamic-Island-style glass capsule at the top centre.
 * Shown for followed clubs' matches and for matches currently on screen.
 * Stackable (newest in front, the rest tucked behind; hover/focus fans them
 * out), auto-dismiss (paused while hovered/focused), swipe up to dismiss,
 * tap to open the match.
 */

interface Toast {
  key: string;
  g: GoalEvent;
  m: Match | undefined;
  followed: boolean;
  expires: number;
  leaving: boolean;
}

const LIFETIME = 6500;
const MAX = 4;

export function GoalToasts() {
  const [list, setList] = useState<Toast[]>([]);
  const [hold, setHold] = useState(false);
  const [announce, setAnnounce] = useState("");
  const nav = useNavigate();
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(
    () =>
      onGoal((g: GoalEvent) => {
        const m = knownMatches.get(g.id);
        const teams = getSettings().teams;
        const followed = teams.some((x) => x.id === g.teamId || (m && (x.id === m.home.id || x.id === m.away.id)));
        const onMatchPage = new RegExp(`^/match/[^/]+/${g.id}(?:$|[/?#])`).test(pathRef.current);
        if (!followed && !onMatchPage && !isOnScreen(g.id)) return;
        if (followed) haptic([24, 60, 24]);
        const key = `${g.id}:${g.score.join("-")}`;
        setList((prev) => {
          if (prev.some((x) => x.key === key)) return prev;
          return [{ key, g, m, followed, expires: Date.now() + LIFETIME, leaving: false }, ...prev].slice(0, MAX);
        });
        setAnnounce(describe(g, m));
      }),
    [],
  );

  // Expiry clock (only runs while toasts exist). Holding pauses and extends.
  useEffect(() => {
    if (!list.length) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setList((prev) => {
        let changed = false;
        const next = prev.map((x) => {
          if (hold && !x.leaving) {
            changed = true;
            return { ...x, expires: x.expires + 250 };
          }
          if (!x.leaving && x.expires <= now) {
            changed = true;
            return { ...x, leaving: true, expires: now + 280 };
          }
          return x;
        });
        const kept = next.filter((x) => !(x.leaving && x.expires <= now));
        return changed || kept.length !== prev.length ? kept : prev;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [list.length, hold]);

  const dismiss = useCallback((key: string) => {
    setList((prev) => prev.map((x) => (x.key === key ? { ...x, leaving: true, expires: Date.now() + 280 } : x)));
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <section
      className={`ix-toasts${hold ? " fanned" : ""}${list.length ? " has" : ""}`}
      aria-label={t("Goal alerts")}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHold(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false);
      }}
    >
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
      {list.map((x, i) => (
        <ToastCard
          key={x.key}
          x={x}
          i={i}
          onOpen={() => {
            dismiss(x.key);
            nav(`/match/${x.g.league}/${x.g.id}`);
          }}
          onDismiss={() => dismiss(x.key)}
        />
      ))}
    </section>,
    document.body,
  );
}

function describe(g: GoalEvent, m: Match | undefined): string {
  const line = m
    ? t("{home} {hs}–{as} {away}", { home: m.home.name, away: m.away.name, hs: g.score[0], as: g.score[1] })
    : t("{team} score", { team: g.team });
  return `${t("Goal")}! ${line}. ${g.scorer ? `${g.scorer} ${g.minute}` : g.minute}`.trim();
}

function ToastCard({ x, i, onOpen, onDismiss }: { x: Toast; i: number; onOpen: () => void; onDismiss: () => void }) {
  const { g, m } = x;
  const side = m ? (g.side === "home" ? m.home : m.away) : null;
  const color = teamTint(side?.color, "#30d158");
  const drag = useRef<{ y0: number; dy: number; id: number } | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    drag.current = { y0: e.clientY, dy: 0, id: e.pointerId };
    moved.current = false;
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !el.current) return;
    d.dy = Math.min(0, e.clientY - d.y0);
    if (d.dy < -6) moved.current = true;
    el.current.style.transform = `translate3d(-50%, ${d.dy}px, 0)`;
    el.current.style.opacity = String(Math.max(0, 1 + d.dy / 80));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !el.current) return;
    if (d.dy < -28) onDismiss();
    else {
      el.current.style.transform = "";
      el.current.style.opacity = "";
    }
  };

  return (
    <div
      ref={el}
      className={`ix-toast${x.leaving ? " leaving" : ""}${x.followed ? " followed" : ""}`}
      style={{ ["--i" as string]: i, ["--team" as string]: color }}
      aria-hidden={i > 2 ? true : undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <button
        type="button"
        className="ix-toast-main"
        onClick={() => {
          if (moved.current) return;
          onOpen();
        }}
        aria-label={`${describe(g, m)} — ${t("Open match")}`}
        tabIndex={i > 2 ? -1 : 0}
      >
        <span className="ix-toast-crest">
          <Crest src={side?.logo} size={34} alt="" />
        </span>
        <span className="ix-toast-text">
          <span className="ix-toast-top">
            <b className="ix-goal">{t("GOAL")}</b>
            <bdi className="num" dir="ltr">
              {g.minute}
            </bdi>
          </span>
          <span className="ix-toast-line">
            {m ? (
              <>
                <span className={g.side === "home" ? "scorer-side" : ""}>{m.home.short || m.home.name}</span>
                <b className="num"> {g.score[0]}–{g.score[1]} </b>
                <span className={g.side === "away" ? "scorer-side" : ""}>{m.away.short || m.away.name}</span>
              </>
            ) : (
              <>
                <span className="scorer-side">{g.team}</span>
                <b className="num"> {g.score[0]}–{g.score[1]}</b>
              </>
            )}
          </span>
          {g.scorer && (
            <span className="ix-toast-scorer">
              <bdi>{g.scorer}</bdi>
            </span>
          )}
        </span>
      </button>
      <button type="button" className="ix-toast-x" onClick={onDismiss} aria-label={t("Dismiss")} tabIndex={i > 2 ? -1 : 0}>
        <IconClose />
      </button>
    </div>
  );
}
