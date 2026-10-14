import { t, tn } from "../i18n";
import type { Lineup, LineupPlayer, Side } from "../lib/api";
import { lastName, teamTint } from "../lib/format";
import { IconArrowOut, IconArrowUp, IconBall, IconChevronRight } from "./Icons";
import { Crest, PlayerAvatar } from "./ui";

/* Positions arrive as ESPN codes (G, CD-L, RB, DM, AM-R, F…). Opta's
   formationPlace isn't ordered by line, so we derive depth + side instead. */

function depth(pos: string): number {
  const p = pos.toUpperCase();
  if (p === "G" || p === "GK") return 0;
  if (/^SW/.test(p)) return 0.8;
  if (/^(CD|CB|D|LB|RB)(-|$)/.test(p)) return 1;
  if (/^(LWB|RWB|WB)/.test(p)) return 1.6;
  if (/^(DM|CDM)/.test(p)) return 2;
  if (/^(CM|M|LM|RM)(-|$)/.test(p)) return 2.6;
  if (/^(AM|CAM|LW|RW)(-|$)/.test(p)) return 3.4;
  if (/^(F|CF|ST|S|LF|RF)(-|$)/.test(p)) return 4.2;
  return 2.5;
}

function lateral(pos: string): number {
  const p = pos.toUpperCase();
  if (/-L$/.test(p)) return -1;
  if (/-R$/.test(p)) return 1;
  if (/^L/.test(p)) return -2;
  if (/^R/.test(p)) return 2;
  return 0;
}

function lines(l: Lineup): { gk: LineupPlayer | null; rows: LineupPlayer[][] } {
  const starters = l.players.filter((p) => p.starter);
  const gk = starters.find((p) => depth(p.pos) === 0) ?? starters.find((p) => p.place === 1) ?? null;
  const outfield = starters.filter((p) => p !== gk).sort((a, b) => depth(a.pos) - depth(b.pos) || a.place - b.place);
  const counts = l.formation.split("-").map(Number).filter((n) => n > 0);
  let rows: LineupPlayer[][] = [];
  if (counts.length && counts.reduce((a, b) => a + b, 0) === outfield.length) {
    let i = 0;
    rows = counts.map((n) => outfield.slice(i, (i += n)));
  } else {
    const buckets = new Map<number, LineupPlayer[]>();
    for (const p of outfield) {
      const d = Math.round(depth(p.pos));
      buckets.set(d, [...(buckets.get(d) ?? []), p]);
    }
    rows = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }
  rows = rows.map((r) => [...r].sort((a, b) => lateral(a.pos) - lateral(b.pos) || a.place - b.place));
  return { gk, rows };
}

export type PickPlayer = (p: LineupPlayer, side: Side) => void;

/** Incoming substitute for a starter (keyed by the outgoing player's id). */
export interface Change {
  id: string;
  name: string;
  jersey: string;
  minute: string;
}

const shortMinute = (m: string | null | undefined) => (m ? m.replace(/'\+(\d+)'/, "+$1'").replace(/'.*$/, "'") : "");

function Node({
  p,
  x,
  y,
  side,
  color,
  delay,
  onPick,
  change,
  incoming,
}: {
  p: LineupPlayer;
  x: number;
  y: number;
  side: Side;
  color: string;
  delay: number;
  onPick: PickPlayer;
  change: Change | null;
  incoming: LineupPlayer | null;
}) {
  const label = [
    `${p.jersey ? `${p.jersey} ` : ""}${p.name}`,
    p.posName,
    p.goals > 0 ? tn(p.goals, "{n} goal", "{n} goals") : "",
    p.red ? t("Red card") : p.yellow ? t("Yellow card") : "",
    p.subbedOut && p.subMinute ? t("Substituted {min}", { min: shortMinute(p.subMinute) }) : "",
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <div className={`pp${change ? " changed" : ""}`} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${delay}ms` }}>
      <button type="button" className="pp-btn" onClick={() => onPick(p, side)} aria-label={label}>
        <div className="av">
          <div className="ph">
            <PlayerAvatar name={p.name} team={side.name} size={46} color={color} />
          </div>
          {(p.goals > 0 || p.yellow || p.red) && (
            <div className="badges">
              {Array.from({ length: Math.min(p.goals, 3) }, (_, i) => (
                <span key={i}>
                  <IconBall />
                </span>
              ))}
              {p.red ? <i className="c card-r" /> : p.yellow ? <i className="c card-y" /> : null}
            </div>
          )}
          {p.subbedOut && p.subMinute && !change && (
            <span className="sub">
              <IconArrowOut />
              {shortMinute(p.subMinute)}
            </span>
          )}
        </div>
        <span className="nm">
          <span className="jn">{p.jersey}</span>
          {lastName(p.name)}
        </span>
      </button>
      {change && (
        <button
          type="button"
          className="pp-in"
          onClick={() => incoming && onPick(incoming, side)}
          disabled={!incoming}
          aria-label={t("{name} came on for {out}, {min}", { name: change.name, out: p.name, min: shortMinute(change.minute) })}
        >
          <span className="pp-in-arrow" aria-hidden>
            <IconArrowUp />
          </span>
          <PlayerAvatar name={change.name} team={side.name} size={20} color={color} />
          <span className="pp-in-txt">
            <b>{lastName(change.name)}</b>
            <small>{shortMinute(change.minute)}</small>
          </span>
        </button>
      )}
    </div>
  );
}

export function Pitch({
  home,
  away,
  lineups,
  onPick,
  changes,
  showChanges = false,
}: {
  home: Side;
  away: Side;
  lineups: Lineup[];
  onPick: PickPlayer;
  changes?: Map<string, Change>;
  showChanges?: boolean;
}) {
  const hl = lineups.find((l) => l.teamId === home.id);
  const al = lineups.find((l) => l.teamId === away.id);
  const hc = teamTint(home.color, "#0a84ff");
  const ac = teamTint(away.color, "#ff9f0a");

  const place = (l: Lineup | undefined, isHome: boolean, color: string, side: Side) => {
    if (!l) return null;
    const { gk, rows } = lines(l);
    const nodes: JSX.Element[] = [];
    const gkY = 93;
    const span = 37;
    let k = 0;
    const byId = new Map(l.players.map((p) => [p.id, p]));
    const node = (p: LineupPlayer, x: number, y: number) => {
      const ch = showChanges && p.subbedOut ? changes?.get(p.id) ?? null : null;
      return (
        <Node
          key={p.id}
          p={p}
          x={x}
          y={y}
          side={side}
          color={color}
          delay={k++ * 30}
          onPick={onPick}
          change={ch}
          incoming={ch ? byId.get(ch.id) ?? null : null}
        />
      );
    };
    if (gk) nodes.push(node(gk, 50, isHome ? gkY : 100 - gkY));
    rows.forEach((row, ri) => {
      const yHome = gkY - ((ri + 1) * span) / rows.length;
      const y = isHome ? yHome : 100 - yHome;
      row.forEach((p, pi) => {
        let x = ((pi + 1) / (row.length + 1)) * 100;
        if (!isHome) x = 100 - x;
        x = 8 + x * 0.84;
        nodes.push(node(p, x, y));
      });
    });
    return nodes;
  };

  return (
    <div className={`pitch${showChanges ? " show-changes" : ""}`} dir="ltr" role="group" aria-label={t("Starting line-ups on the pitch")}>
      <svg className="lines" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden>
        <g fill="none" stroke="rgba(255,255,255,.38)" strokeWidth=".35">
          <rect x="2.5" y="2.5" width="63" height="100" rx="1" />
          <line x1="2.5" y1="52.5" x2="65.5" y2="52.5" />
          <circle cx="34" cy="52.5" r="9.15" />
          <circle cx="34" cy="52.5" r=".6" fill="rgba(255,255,255,.5)" />
          <rect x="13.84" y="2.5" width="40.32" height="16.5" />
          <rect x="24.84" y="2.5" width="18.32" height="5.5" />
          <rect x="13.84" y="86" width="40.32" height="16.5" />
          <rect x="24.84" y="97" width="18.32" height="5.5" />
          <path d="M26.7 19a9.15 9.15 0 0 0 14.6 0M26.7 86a9.15 9.15 0 0 1 14.6 0" />
        </g>
      </svg>
      <div className="pitch-team-label top">
        <Crest src={away.logo} size={20} alt="" />
        {away.short} {al?.formation && <span className="pitch-formation">· {al.formation}</span>}
      </div>
      <div className="pitch-team-label bottom">
        <Crest src={home.logo} size={20} alt="" />
        {home.short} {hl?.formation && <span className="pitch-formation">· {hl.formation}</span>}
      </div>
      {place(al, false, ac, away)}
      {place(hl, true, hc, home)}
    </div>
  );
}

export function Bench({
  side,
  lineup,
  onPick,
  cls,
  replaced,
}: {
  side: Side;
  lineup?: Lineup;
  onPick: PickPlayer;
  cls: string;
  /** Incoming player id → the starter they replaced. */
  replaced?: Map<string, string>;
}) {
  if (!lineup) return null;
  const subs = lineup.players
    .filter((p) => !p.starter)
    .sort((a, b) => Number(b.subbedIn) - Number(a.subbedIn) || (Number(a.jersey) || 99) - (Number(b.jersey) || 99));
  const color = teamTint(side.color, "#5e5ce6");
  return (
    <section className={`bench ${cls}`} aria-label={t("{team} substitutes", { team: side.short })}>
      <h3 className="bench-head">
        <Crest src={side.logo} size={22} alt="" />
        {t("Substitutes")}
        <span className="formation subtle">{lineup.formation}</span>
      </h3>
      <ul className="list glass bench-list">
        {subs.map((p) => {
          const forName = replaced?.get(p.id);
          const caption = p.subbedIn
            ? forName
              ? t("On {min} for {name}", { min: shortMinute(p.subMinute), name: lastName(forName) })
              : t("On {min}", { min: shortMinute(p.subMinute) })
            : p.posName && !/^sub/i.test(p.posName)
              ? p.posName
              : t("Substitute");
          return (
            <li key={p.id}>
              <button type="button" className="row clickable bench-row" onClick={() => onPick(p, side)}>
                <PlayerAvatar name={p.name} team={side.name} size={36} color={color} />
                <span className="grow">
                  <span className="title">
                    <span className="subtle num bench-jn">{p.jersey}</span>
                    {p.name}
                  </span>
                  <span className="caption">
                    {caption}
                    {p.goals > 0 ? ` · ${tn(p.goals, "{n} goal", "{n} goals")}` : ""}
                  </span>
                </span>
                {p.subbedIn && (
                  <span className="pill bench-in">
                    <IconArrowUp width={12} height={12} />
                    {t("In")}
                  </span>
                )}
                <IconChevronRight className="chev" />
              </button>
            </li>
          );
        })}
        {!subs.length && <li className="row muted">{t("No substitutes listed")}</li>}
      </ul>
    </section>
  );
}
