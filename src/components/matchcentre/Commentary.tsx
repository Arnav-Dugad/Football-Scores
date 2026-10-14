import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../i18n";
import type { Match } from "../../lib/api";
import { IconSwap } from "../Icons";
import { Crest } from "../ui";
import { GOAL_KINDS, KEY_KINDS, minuteLabel, SHOT_KINDS, type Play, type PlayKind } from "./data";
import { PlayIcon } from "./icons";

/* Live text commentary: newest first while live, filters, key moments
   emphasised, fresh items animate in. */

type Filter = "all" | "key" | "shots";

interface Row {
  p: Play;
  score: [number, number] | null;
  divider: string | null;
}

const KIND_NAME: Partial<Record<PlayKind, string>> = {
  goal: "Goal",
  owngoal: "Own goal",
  penGoal: "Penalty scored",
  penMiss: "Penalty missed",
  saved: "Shot saved",
  missed: "Shot off target",
  blocked: "Shot blocked",
  woodwork: "Hit the woodwork",
  corner: "Corner",
  foul: "Foul",
  handball: "Handball",
  offside: "Offside",
  yellow: "Yellow card",
  red: "Red card",
  sub: "Substitution",
  var: "VAR",
  delay: "Delay",
  added: "Added time",
};

function dividerLabel(p: Play, hasEt: boolean, score: [number, number]): string | null {
  const s = `${score[0]}–${score[1]}`;
  if (p.kind === "start") {
    if (/shootout/i.test(p.text) || p.period >= 5) return t("Penalty shoot-out");
    if (p.period === 1) return t("Kick-off");
    if (p.period === 2) return t("Second half");
    if (p.period === 3) return t("Extra time");
    if (p.period === 4) return t("Extra time, second half");
    return null;
  }
  if (p.kind === "end") {
    if (/match ends/i.test(p.text)) return t("Full time · {score}", { score: s });
    if (/shootout ends/i.test(p.text) || p.period >= 5) return t("Shoot-out over");
    if (p.period === 1) return t("Half-time · {score}", { score: s });
    if (p.period === 2) return hasEt ? t("End of normal time · {score}", { score: s }) : t("Full time · {score}", { score: s });
    if (p.period === 3) return t("Extra-time break · {score}", { score: s });
    if (p.period === 4) return t("End of extra time · {score}", { score: s });
  }
  return null;
}

export function Commentary({ plays, m }: { plays: Play[]; m: Match }) {
  const live = m.state === "in";
  const [filter, setFilter] = useState<Filter>("all");
  const [newest, setNewest] = useState<boolean>(live);
  const [touched, setTouched] = useState(false);
  if (!touched && newest !== live) setNewest(live);

  const rows = useMemo<Row[]>(() => {
    const hasEt = plays.some((p) => p.period === 3 || p.period === 4);
    const score: [number, number] = [0, 0];
    const out: Row[] = [];
    let lastDivider = "";
    for (const p of plays) {
      if (GOAL_KINDS.includes(p.kind) && !p.shootout && p.side) {
        if (p.side === "home") score[0]++;
        else score[1]++;
      }
      if (p.kind === "start" || p.kind === "end") {
        const label = dividerLabel(p, hasEt, score);
        if (!label || label === lastDivider) continue;
        lastDivider = label;
        out.push({ p, score: null, divider: label });
        continue;
      }
      if (/lineups are announced/i.test(p.text)) continue;
      lastDivider = "";
      out.push({ p, score: GOAL_KINDS.includes(p.kind) && !p.shootout ? [score[0], score[1]] : null, divider: null });
    }
    return out;
  }, [plays]);

  const visible = useMemo(() => {
    const keep = (r: Row) =>
      r.divider !== null || filter === "all" || (filter === "key" ? KEY_KINDS.includes(r.p.kind) : SHOT_KINDS.includes(r.p.kind));
    const list = rows.filter(keep);
    // Drop dividers that end up adjacent (nothing between them in this view).
    // Keep the score-carrying "end" markers; drop a "start" marker that is followed by another marker.
    const tidy = list.filter((r, i) => !(filter !== "all" && r.divider && r.p.kind === "start" && list[i + 1]?.divider));
    return newest ? [...tidy].reverse() : tidy;
  }, [rows, filter, newest]);

  // Items that weren't in the previous render animate in.
  const seen = useRef<Set<string> | null>(null);
  const fresh = new Set<string>();
  if (seen.current) for (const r of rows) if (!seen.current.has(r.p.key)) fresh.add(r.p.key);
  useEffect(() => {
    seen.current = new Set(rows.map((r) => r.p.key));
  }, [rows]);

  const counts = {
    key: rows.filter((r) => !r.divider && KEY_KINDS.includes(r.p.kind)).length,
    shots: rows.filter((r) => !r.divider && SHOT_KINDS.includes(r.p.kind)).length,
  };

  return (
    <section className="mc-commentary" aria-labelledby="mc-cm-t">
      <h2 className="sr-only" id="mc-cm-t">
        {t("Commentary")}
      </h2>
      <div className="mc-cm-bar">
        <div className="chips mc-cm-chips" role="group" aria-label={t("Filter commentary")}>
          {(
            [
              ["all", t("All")],
              ["key", t("Key moments")],
              ["shots", t("Shots")],
            ] as [Filter, string][]
          ).map(([v, label]) => (
            <button key={v} type="button" className={`chip text-only${filter === v ? " active" : ""}`} aria-pressed={filter === v} onClick={() => setFilter(v)}>
              {label}
              {v !== "all" && <span className="mc-chip-n">{counts[v]}</span>}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="mc-order"
          onClick={() => {
            setTouched(true);
            setNewest((n) => !n);
          }}
          aria-label={newest ? t("Showing newest first. Switch to chronological order") : t("Showing chronological order. Switch to newest first")}
        >
          <IconSwap />
          {newest ? t("Newest first") : t("Chronological")}
        </button>
      </div>

      {live && (
        <p className="mc-cm-live" aria-live="polite">
          <span className="pulse" />
          {t("Live — updates automatically")}
        </p>
      )}

      <ol className="mc-cm-list" aria-live={live ? "polite" : undefined} aria-relevant="additions">
        {visible.map((r) => {
          if (r.divider) {
            return (
              <li key={`d-${r.p.key}`} className={`mc-cm-divider${fresh.has(r.p.key) ? " fresh" : ""}`}>
                <span>{r.divider}</span>
              </li>
            );
          }
          const p = r.p;
          const key = KEY_KINDS.includes(p.kind);
          const goal = GOAL_KINDS.includes(p.kind) && !p.shootout;
          const team = p.side === "home" ? m.home : p.side === "away" ? m.away : null;
          const kindName = KIND_NAME[p.kind];
          return (
            <li
              key={p.key}
              className={`mc-cm-item k-${p.kind}${key ? " is-key" : ""}${goal ? " is-goal" : ""}${p.side ? ` ${p.side}` : ""}${fresh.has(p.key) ? " fresh" : ""}`}
            >
              <span className="mc-cm-min">{p.shootout ? t("Pens") : p.hasClock ? minuteLabel(p.min, p.added) : "·"}</span>
              <span className="mc-cm-ic" aria-hidden>
                <PlayIcon kind={p.kind} />
              </span>
              <div className="mc-cm-body">
                {(goal || (key && kindName)) && (
                  <div className="mc-cm-kicker">
                    <b>{t(kindName ?? "Goal")}</b>
                    {goal && r.score && (
                      <span className="mc-cm-score">
                        {r.score[0]}–{r.score[1]}
                      </span>
                    )}
                  </div>
                )}
                {!key && kindName && <span className="sr-only">{t(kindName)}: </span>}
                <p>{p.text}</p>
                {p.extra && <p className="extra">{p.extra}</p>}
              </div>
              {team && (
                <span className="mc-cm-team" title={team.name}>
                  <Crest src={team.logo} size={22} alt={team.name} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {!visible.length && <p className="muted mc-empty-line">{t("Nothing here yet.")}</p>}
    </section>
  );
}
