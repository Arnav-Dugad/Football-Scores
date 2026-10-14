import type { ReactNode } from "react";
import { t } from "../../i18n";
import { fmtNum } from "../../lib/format";
import { useInView } from "../../lib/hooks";
import { useCountUp } from "../../lib/motion";
import type { Overview, PersonRow } from "./data";
import type { Profile } from "./profile";

/* Season stat tiles with count-up numbers. */

export interface TileSpec {
  key: string;
  label: string;
  value: number | null;
  decimals?: number;
  suffix?: string;
  sub?: ReactNode;
  render?: (shown: number) => ReactNode;
}

export interface SeasonLine {
  apps: number | null;
  starts: number | null;
  g: number | null;
  a: number | null;
  xg: number | null;
  sh: number | null;
  sot: number | null;
  y: number | null;
  r: number | null;
  saves: number | null;
  conceded: number | null;
  clean: number | null;
  source: "people" | "espn" | "none";
}

/** League-season numbers: Pitch's season table first, ESPN's competition split as a fallback. */
export function seasonLine(p: Profile, ov: Overview | null): SeasonLine {
  const comp = ov?.comps.find((c) => c.slug === p.league) ?? null;
  const cs = comp?.stats ?? {};
  const pick = (k: string) => (k in cs ? cs[k] : null);
  const person: PersonRow | null = p.person;
  if (person) {
    return {
      apps: person.apps,
      starts: person.starts,
      g: person.g,
      a: person.a,
      xg: person.xg,
      sh: person.sh,
      sot: person.sot,
      y: person.y,
      r: person.r,
      saves: pick("saves"),
      conceded: pick("goalsConceded"),
      clean: pick("cleanSheet"),
      source: "people",
    };
  }
  if (comp || p.bio?.starts != null) {
    const starts = pick("starts") ?? p.bio?.starts ?? null;
    const apps = pick("appearances") ?? (p.bio?.starts != null && p.bio.subs != null ? p.bio.starts + p.bio.subs : null);
    return {
      apps,
      starts,
      g: pick("totalGoals"),
      a: pick("goalAssists"),
      xg: null,
      sh: pick("totalShots"),
      sot: pick("shotsOnTarget"),
      y: pick("yellowCards"),
      r: pick("redCards"),
      saves: pick("saves"),
      conceded: pick("goalsConceded"),
      clean: pick("cleanSheet"),
      source: "espn",
    };
  }
  return { apps: null, starts: null, g: null, a: null, xg: null, sh: null, sot: null, y: null, r: null, saves: null, conceded: null, clean: null, source: "none" };
}

const per = (v: number | null, apps: number | null) => (v != null && apps ? v / apps : null);

export function tilesFor(s: SeasonLine, gk: boolean): TileSpec[] {
  const pg = (v: number | null, d = 2) => {
    const x = per(v, s.apps);
    return x == null ? undefined : t("{n} per game", { n: fmtNum(x, d) });
  };
  const apps: TileSpec = {
    key: "apps",
    label: t("Appearances"),
    value: s.apps,
    sub: s.apps != null && s.starts != null && s.apps >= s.starts ? t("{n} off the bench", { n: s.apps - s.starts }) : undefined,
  };
  const starts: TileSpec = {
    key: "starts",
    label: t("Starts"),
    value: s.starts,
    sub: s.apps && s.starts != null ? t("{n}% of appearances", { n: fmtNum((s.starts / s.apps) * 100) }) : undefined,
  };
  const goals: TileSpec = { key: "g", label: t("Goals"), value: s.g, sub: pg(s.g) };
  const assists: TileSpec = { key: "a", label: t("Assists"), value: s.a, sub: pg(s.a) };
  const diff = s.xg != null && s.g != null ? s.g - s.xg : null;
  const xg: TileSpec = {
    key: "xg",
    label: t("Expected goals (xG)"),
    value: s.xg,
    decimals: 1,
    sub:
      diff == null
        ? undefined
        : Math.abs(diff) < 0.05
          ? t("Scoring in line with xG")
          : diff > 0
            ? t("{n} more goals than xG", { n: fmtNum(diff, 1) })
            : t("{n} fewer goals than xG", { n: fmtNum(Math.abs(diff), 1) }),
  };
  const shots: TileSpec = { key: "sh", label: t("Shots"), value: s.sh, sub: pg(s.sh, 1) };
  const acc = s.sh && s.sot != null ? (s.sot / s.sh) * 100 : null;
  const onTarget: TileSpec = {
    key: "acc",
    label: t("Shots on target"),
    value: acc,
    suffix: "%",
    sub: s.sh && s.sot != null ? t("{a} of {b} shots", { a: s.sot, b: s.sh }) : undefined,
  };
  const cards: TileSpec = {
    key: "cards",
    label: t("Cards"),
    value: s.y == null && s.r == null ? null : (s.y ?? 0) + (s.r ?? 0),
    render: () => (
      <span className="pl-cards">
        <span className="pl-cardval" aria-label={t("{n} yellow cards", { n: s.y ?? 0 })}>
          <i className="card-y" aria-hidden />
          {fmtNum(s.y ?? 0)}
        </span>
        <span className="pl-cardval" aria-label={t("{n} red cards", { n: s.r ?? 0 })}>
          <i className="card-r" aria-hidden />
          {fmtNum(s.r ?? 0)}
        </span>
      </span>
    ),
  };
  if (gk) {
    const list: TileSpec[] = [apps, starts];
    if (s.clean != null) list.push({ key: "cs", label: t("Clean sheets"), value: s.clean, sub: pg(s.clean) });
    if (s.saves != null) list.push({ key: "sv", label: t("Saves"), value: s.saves, sub: pg(s.saves, 1) });
    if (s.conceded != null) list.push({ key: "ga", label: t("Goals conceded"), value: s.conceded, sub: pg(s.conceded) });
    list.push(assists, cards, goals);
    return list.length >= 8 ? list.slice(0, 8) : list.length >= 6 ? list.slice(0, 6) : list.slice(0, 4);
  }
  return [apps, starts, goals, assists, xg, shots, onTarget, cards];
}

export function Tiles({ tiles }: { tiles: TileSpec[] }) {
  const [ref, seen] = useInView<HTMLDivElement>("0px");
  const cols = tiles.length % 4 === 0 ? 4 : 3;
  return (
    <div ref={ref} className={`pl-tiles cols-${cols}`}>
      {tiles.map((x, i) => (
        <Tile key={x.key} spec={x} start={seen} delay={i} />
      ))}
    </div>
  );
}

function Tile({ spec, start, delay }: { spec: TileSpec; start: boolean; delay: number }) {
  const shown = useCountUp(spec.value ?? 0, { decimals: spec.decimals ?? 0, start, duration: 1000 });
  return (
    <div className="glass tile pl-tile" style={{ animationDelay: `${delay * 45}ms` }}>
      <div className="k">{spec.label}</div>
      <div className="v">
        {spec.value == null ? (
          <span className="pl-dash" aria-label={t("Not available")}>
            —
          </span>
        ) : spec.render ? (
          spec.render(shown)
        ) : (
          <>
            <span aria-hidden>
              {fmtNum(shown, spec.decimals ?? 0)}
              {spec.suffix && <span className="pl-suffix">{spec.suffix}</span>}
            </span>
            <span className="sr-only">
              {fmtNum(spec.value, spec.decimals ?? 0)}
              {spec.suffix ?? ""}
            </span>
          </>
        )}
      </div>
      {spec.sub && <div className="s">{spec.sub}</div>}
    </div>
  );
}

export function TilesSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="pl-tiles cols-4" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skel pl-tile-skel" />
      ))}
    </div>
  );
}
