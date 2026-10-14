import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { t, tn } from "../../i18n";
import { sized } from "../../lib/api";
import { initials, lastName, fmtNum } from "../../lib/format";
import { useLongPress } from "../../lib/gestures";
import { useInView, usePlayer } from "../../lib/hooks";
import { IconInfo, IconPeople } from "../Icons";
import { PlayerSheet, type PlayerRef } from "../PlayerSheet";
import { Empty, ErrorState, Skeleton, tsdbSize } from "../ui";
import { useSquad, type SquadMember } from "./data";
import { IconCross } from "./icons";
import { MiniEmpty, SectionHead } from "./ui";

interface Props {
  league: string;
  teamId: string;
  teamName: string;
  logo: string;
  hero: string;
}

export function Squad({ league, teamId, teamName, logo, hero }: Props) {
  const { squad, roster, people, hasStats } = useSquad(league, teamId);
  const [sheet, setSheet] = useState<PlayerRef | null>(null);

  const open = (p: SquadMember) =>
    setSheet({
      name: p.name,
      id: p.id,
      league,
      jersey: p.jersey,
      position: p.posName,
      nationality: p.nat,
      flag: p.flag,
      dob: p.dob,
      height: p.height,
      team: { name: teamName, logo, color: hero },
    });

  if (roster.loading) {
    return (
      <div className="cl-stack" aria-busy="true">
        <Skeleton h={520} r={28} />
        <div className="squad-grid">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} h={230} r={24} />
          ))}
        </div>
      </div>
    );
  }
  if (!squad.length) {
    return roster.error ? (
      <ErrorState onRetry={roster.reload} />
    ) : (
      <Empty icon={<IconPeople />} title={t("No squad listed")}>
        {t("This club’s squad hasn’t been published yet.")}
      </Empty>
    );
  }

  const unavailable = squad.filter((p) => p.injury);
  return (
    <div className="cl-stack">
      <DepthChart squad={squad} league={league} team={teamName} hero={hero} ready={hasStats} building={!people.data} onOpen={open} />

      <section aria-labelledby="cl-unavail">
        <SectionHead id="cl-unavail" title={t("Unavailable")} aside={unavailable.length ? <span className="subtle num">{fmtNum(unavailable.length)}</span> : undefined} />
        {unavailable.length ? (
          <ul className="list glass cl-rows">
            {unavailable.map((p) => (
              <li key={p.id}>
                <Link to={`/player/${league}/${p.id}`} className="row clickable">
                  <Face p={p} team={teamName} hero={hero} size={40} />
                  <span className="grow">
                    <span className="title">{p.name}</span>
                    <span className="caption">{[p.posName && t(p.posName), p.jersey && `#${p.jersey}`].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="cl-inj-pill">
                    <IconCross width={11} height={11} />
                    {p.injury}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cl-all-fit">
            <span className="dot" aria-hidden="true" />
            {t("No injuries or suspensions reported.")}
          </p>
        )}
      </section>

      <SquadGrid squad={squad} league={league} team={teamName} hero={hero} onOpen={open} stats={hasStats} />

      {sheet && <PlayerSheet p={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------- depth chart -- */

/** Pitch lines from attack (0) to goal (5). */
const LINES = ["Forwards", "Attacking midfield", "Midfield", "Defensive midfield", "Defence", "Goalkeeper"];

interface Slot {
  line: number;
  x: number;
}

/** Map a lineup position code (G, CD-L, RB, AM-R, LF, RCF…) to a pitch line and lateral position (−2 left … 2 right). */
export function parseLpos(code: string | null): Slot | null {
  if (!code) return null;
  let c = code.toUpperCase().trim();
  if (c === "G" || c === "GK") return { line: 5, x: 0 };
  let side = 0;
  const suffix = /^(.+)-(L|R)$/.exec(c);
  if (suffix) {
    c = suffix[1];
    side = suffix[2] === "L" ? -1 : 1;
  }
  const wide = /^(L|R)(B|WB|M|W|F|CF|CB|CM|DM|AM)$/.exec(c);
  if (wide) {
    side = wide[1] === "L" ? -1 : 1;
    c = wide[2];
  }
  switch (c) {
    case "CD":
    case "CB":
      return { line: 4, x: side * 0.7 };
    case "SW":
      return { line: 4, x: 0 };
    case "B":
      return { line: 4, x: side * 2 };
    case "WB":
      return { line: 4, x: side * 2.2 };
    case "DM":
      return { line: 3, x: side * 0.8 };
    case "CM":
      return { line: 2, x: side * 0.8 };
    case "M":
      return { line: 2, x: side * 2 };
    case "AM":
      return { line: 1, x: side * 1.2 };
    case "W":
      return { line: 1, x: side * 2 };
    case "CF":
    case "ST":
      return { line: 0, x: side * 0.7 };
    case "F":
      return { line: 0, x: side * 1.4 };
    default:
      return null;
  }
}

function slotOf(p: SquadMember): Slot | null {
  const s = parseLpos(p.lpos);
  if (s) return s;
  if (p.pos === "G") return { line: 5, x: 0 };
  if (p.pos === "D") return { line: 4, x: 0 };
  if (p.pos === "M") return { line: 2, x: 0 };
  if (p.pos === "F") return { line: 0, x: 0 };
  return null;
}

const byUsage = (a: SquadMember, b: SquadMember) => b.starts - a.starts || b.apps - a.apps || b.g + b.a - (a.g + a.a) || a.name.localeCompare(b.name);

interface Placed {
  p: SquadMember;
  slot: Slot;
  depth: SquadMember[];
}

function buildDepth(squad: SquadMember[]) {
  const keepers = squad.filter((p) => p.pos === "G" || p.lpos === "G").sort(byUsage);
  const outfield = squad.filter((p) => !(p.pos === "G" || p.lpos === "G")).sort(byUsage);
  const gk = keepers[0] && keepers[0].starts > 0 ? keepers[0] : null;
  const xiOut = outfield.filter((p) => p.starts > 0).slice(0, 10);
  const xi: Placed[] = [];
  if (gk) xi.push({ p: gk, slot: { line: 5, x: 0 }, depth: [] });
  for (const p of xiOut) {
    const s = slotOf(p);
    if (s) xi.push({ p, slot: s, depth: [] });
  }
  const inXi = new Set(xi.map((x) => x.p.id));
  const unused: SquadMember[] = [];
  for (const p of [...keepers, ...outfield].sort(byUsage)) {
    if (inXi.has(p.id)) continue;
    const s = slotOf(p);
    if (!s || (p.apps === 0 && !p.lpos)) {
      unused.push(p);
      continue;
    }
    // Nearest starter: same line first, then closest laterally.
    let best: Placed | null = null;
    let cost = Infinity;
    for (const x of xi) {
      if ((s.line === 5) !== (x.slot.line === 5)) continue; // keepers only back up keepers
      const c = Math.abs(x.slot.line - s.line) * 3 + Math.abs(x.slot.x - s.x);
      if (c < cost) {
        cost = c;
        best = x;
      }
    }
    if (best) best.depth.push(p);
    else unused.push(p);
  }
  const lines = LINES.map((name, i) => ({ name, i, players: xi.filter((x) => x.slot.line === i).sort((a, b) => a.slot.x - b.slot.x) })).filter(
    (l) => l.players.length,
  );
  const shape = lines
    .filter((l) => l.i !== 5)
    .reverse()
    .map((l) => l.players.length)
    .join("-");
  return { lines, unused, shape, count: xi.length };
}

function DepthChart({
  squad,
  league,
  team,
  hero,
  ready,
  building,
  onOpen,
}: {
  squad: SquadMember[];
  league: string;
  team: string;
  hero: string;
  ready: boolean;
  building: boolean;
  onOpen: (p: SquadMember) => void;
}) {
  const { lines, unused, shape, count } = useMemo(() => buildDepth(squad), [squad]);
  const enough = ready && count >= 7;
  return (
    <section aria-labelledby="cl-depth">
      <SectionHead
        id="cl-depth"
        title={t("Depth chart")}
        aside={enough && shape ? <span className="pill num">{t("Usual shape {shape}", { shape })}</span> : undefined}
      />
      {!enough ? (
        building ? (
          <Skeleton h={420} r={28} />
        ) : (
          <MiniEmpty>{t("The depth chart appears once this season’s lineups have synced.")}</MiniEmpty>
        )
      ) : (
        <>
          <div className="cl-pitch" role="list" aria-label={t("Likely starting eleven, ordered by starts, with depth behind each position")}>
            <svg className="cl-pitch-lines" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
              <rect x="3" y="3" width="94" height="134" rx="3" />
              <line x1="3" y1="70" x2="97" y2="70" />
              <circle cx="50" cy="70" r="11" />
              <rect x="24" y="3" width="52" height="20" />
              <rect x="24" y="117" width="52" height="20" />
              <rect x="38" y="3" width="24" height="7" />
              <rect x="38" y="130" width="24" height="7" />
            </svg>
            {lines.map((l) => (
              <div className="cl-pline" key={l.i} role="listitem" aria-label={t(l.name)}>
                <span className="cl-line-name" aria-hidden="true">
                  {t(l.name)}
                </span>
                <ul className="cl-line-players" style={{ "--n": l.players.length } as CSSProperties}>
                  {l.players.map((x) => (
                    <li key={x.p.id} className="cl-slot">
                      <StarterToken p={x.p} league={league} team={team} hero={hero} onOpen={onOpen} />
                      {x.depth.length > 0 && (
                        <ul className="cl-depth" aria-label={t("Depth behind {name}", { name: x.p.name })}>
                          {x.depth.slice(0, 2).map((d) => (
                            <li key={d.id}>
                              <Link to={`/player/${league}/${d.id}`} className={d.injury ? "inj" : ""} title={d.name}>
                                {lastName(d.name)}
                                <small className="num">{fmtNum(d.starts)}</small>
                                {d.injury && <span className="sr-only">{t("Unavailable")}</span>}
                              </Link>
                            </li>
                          ))}
                          {x.depth.length > 2 && <li className="more">{t("+{n} more", { n: x.depth.length - 2 })}</li>}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="subtle cl-foot">{t("Starters ranked by league starts this season; the small number is each player’s starts.")}</p>
          {unused.length > 0 && (
            <div className="cl-unused">
              <p className="panel-title">{t("Yet to feature")}</p>
              <div className="cl-chiprow">
                {unused.map((p) => (
                  <Link key={p.id} to={`/player/${league}/${p.id}`} className="chip text-only">
                    {p.jersey && <span className="subtle num">{p.jersey}</span>}
                    {p.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function StarterToken({ p, league, team, hero, onOpen }: { p: SquadMember; league: string; team: string; hero: string; onOpen: (p: SquadMember) => void }) {
  const press = useLongPress(() => onOpen(p));
  return (
    <Link
      to={`/player/${league}/${p.id}`}
      className={`cl-token${p.injury ? " inj" : ""}`}
      aria-label={`${p.name}, ${tn(p.starts, "{n} start", "{n} starts")}${p.injury ? `, ${t("Unavailable")}: ${p.injury}` : ""}`}
      {...press}
    >
      <span className="av">
        <Face p={p} team={team} hero={hero} size={46} />
        {p.injury && (
          <span className="cl-inj-dot" aria-hidden="true">
            <IconCross width={9} height={9} />
          </span>
        )}
      </span>
      <span className="nm">
        {p.jersey && <span className="jn num">{p.jersey}</span>}
        {lastName(p.name)}
      </span>
      <span className="st num" aria-hidden="true">
        {tn(p.starts, "{n} start", "{n} starts")}
      </span>
    </Link>
  );
}

/* ---------------------------------------------------------- photo face -- */

function Face({ p, team, hero, size }: { p: SquadMember; team: string; hero: string; size: number }) {
  const [ref, seen] = useInView<HTMLSpanElement>("200px");
  const { info } = usePlayer(p.headshot ? null : p.name, team, { enabled: seen });
  const [err, setErr] = useState(0);
  const cut = tsdbSize(info?.cutout, "small");
  const photo = !cut ? tsdbSize(info?.photo, "small") : null;
  const candidates = [p.headshot ? sized(p.headshot, 160) : null, cut, photo].filter(Boolean) as string[];
  const src = candidates[err] ?? null;
  return (
    <span
      ref={ref}
      className="cl-face"
      style={{ width: size, height: size, fontSize: size * 0.34, "--tint": hero } as CSSProperties}
    >
      <span className="ini" aria-hidden="true">
        {initials(p.name)}
      </span>
      {src && <img src={src} alt="" loading="lazy" className={src === cut ? "cutout" : ""} onError={() => setErr((n) => n + 1)} />}
    </span>
  );
}

/* ----------------------------------------------------------- squad grid -- */

const GROUPS: { pos: SquadMember["pos"]; label: string }[] = [
  { pos: "G", label: "Goalkeepers" },
  { pos: "D", label: "Defenders" },
  { pos: "M", label: "Midfielders" },
  { pos: "F", label: "Forwards" },
  { pos: "", label: "Squad" },
];

function SquadGrid({ squad, league, team, hero, onOpen, stats }: { squad: SquadMember[]; league: string; team: string; hero: string; onOpen: (p: SquadMember) => void; stats: boolean }) {
  const groups = GROUPS.map((g) => ({
    ...g,
    list: squad.filter((p) => p.pos === g.pos).sort((a, b) => (Number(a.jersey) || 99) - (Number(b.jersey) || 99) || a.name.localeCompare(b.name)),
  })).filter((g) => g.list.length);
  return (
    <>
      {groups.map((g) => (
        <section key={g.label} aria-labelledby={`cl-g-${g.label}`}>
          <SectionHead id={`cl-g-${g.label}`} title={t(g.label)} aside={<span className="subtle num">{fmtNum(g.list.length)}</span>} />
          <ul className="squad-grid cl-squad">
            {g.list.map((p, i) => (
              <li key={p.id}>
                <SquadCard p={p} league={league} team={team} hero={hero} index={i} onOpen={onOpen} stats={stats} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function SquadCard({ p, league, team, hero, index, onOpen, stats }: { p: SquadMember; league: string; team: string; hero: string; index: number; onOpen: (p: SquadMember) => void; stats: boolean }) {
  const press = useLongPress(() => onOpen(p));
  const [ref, seen] = useInView<HTMLDivElement>("200px");
  const { info } = usePlayer(p.headshot ? null : p.name, team, { enabled: seen });
  const [err, setErr] = useState(0);
  const cut = tsdbSize(info?.cutout, "small");
  const photo = !cut ? tsdbSize(info?.photo, "small") : null;
  const candidates = [p.headshot ? sized(p.headshot, 320) : null, cut, photo].filter(Boolean) as string[];
  const src = candidates[err] ?? null;
  const meta = [p.age != null ? tn(p.age, "{n} yr", "{n} yrs") : null, p.nat || null].filter(Boolean).join(" · ");
  return (
    <div className="player-card glass cl-card" ref={ref} style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}>
      <Link to={`/player/${league}/${p.id}`} className="cl-card-link" {...press}>
        <div className="photo">
          <div className="tint" style={{ background: `radial-gradient(100% 90% at 50% 100%, color-mix(in srgb, ${hero} 75%, white 10%), color-mix(in srgb, ${hero} 55%, black))` }} />
          {!src && <span className="ini">{initials(p.name)}</span>}
          {src && <img src={src} alt="" className={src === cut ? "cutout" : ""} loading="lazy" onError={() => setErr((n) => n + 1)} />}
          {p.jersey && <span className="jn">{p.jersey}</span>}
          {p.injury && (
            <span className="cl-inj-badge" title={p.injury}>
              <IconCross width={10} height={10} />
              <span>{t("Out")}</span>
            </span>
          )}
        </div>
        <div className="meta">
          <b>{p.name}</b>
          <span>
            {p.flag && <img className="flag" src={sized(p.flag, 40)} alt="" loading="lazy" />}
            <span className="cl-ellipsis">{meta || (p.posName ? t(p.posName) : "")}</span>
          </span>
          {stats && (
          <span className="cl-card-stats" aria-label={t("{apps} appearances, {g} goals, {a} assists", { apps: p.apps, g: p.g, a: p.a })}>
            <span aria-hidden="true">
              <b className="num">{fmtNum(p.apps)}</b> {t("Apps")}
            </span>
            <span aria-hidden="true">
              <b className="num">{fmtNum(p.g)}</b> {t("Goals")}
            </span>
            <span aria-hidden="true">
              <b className="num">{fmtNum(p.a)}</b> {t("Ast")}
            </span>
          </span>
          )}
          {p.injury && <span className="sr-only">{`${t("Unavailable")}: ${p.injury}`}</span>}
        </div>
      </Link>
      <button type="button" className="cl-peek" onClick={() => onOpen(p)} aria-label={t("Quick look at {name}", { name: p.name })}>
        <IconInfo />
      </button>
    </div>
  );
}
