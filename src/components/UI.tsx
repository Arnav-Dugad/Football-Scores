import { useEffect, type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronRight,
  Star,
  RefreshCw,
  WifiOff,
  Info,
} from "lucide-react";
import { useApp } from "../lib/state";
import {
  matchDate,
  initials,
  shortName,
  type Match,
  type Team,
  type Standing,
} from "../../shared/model";
export function Title({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} — Football Scores`;
  }, [title]);
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Crest({
  team,
  large = false,
}: {
  team: Team;
  large?: boolean;
}) {
  const n = [...team.name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span
      aria-hidden="true"
      title="Club initials · original fallback artwork"
      className={`crest ${large ? "large" : ""}`}
      style={{ "--club-hue": `${n % 360}` } as React.CSSProperties}
    >
      {initials(team.name)}
    </span>
  );
}
export function Favorite({ id, label }: { id: string; label: string }) {
  const { favorites, toggle } = useApp();
  const active = favorites.includes(id);
  return (
    <button
      className={`icon-button favorite ${active ? "saved" : ""}`}
      aria-label={`${active ? "Unsave" : "Save"} ${label}`}
      aria-pressed={active}
      onClick={() => toggle(id)}
    >
      <Star size={17} fill={active ? "currentColor" : "none"} />
    </button>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-symbol">
        <Info size={23} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function DataGate({ children }: { children: ReactNode }) {
  const { loading, error, refresh } = useApp();
  if (loading)
    return (
      <div
        className="loading-grid"
        aria-label="Loading football data"
        role="status"
      >
        {[1, 2, 3, 4].map((x) => (
          <div key={x} className="skeleton" />
        ))}
      </div>
    );
  if (error)
    return (
      <div className="panel">
        <Empty title="A little pause in play">{error.message}</Empty>
        <button className="button" onClick={refresh}>
          Try again <RefreshCw size={16} />
        </button>
      </div>
    );
  return children;
}
export function Freshness() {
  const { data, refresh, fetching } = useApp();
  if (!data) return null;
  return (
    <div className={`freshness ${data.meta.stale ? "stale" : ""}`}>
      <span>
        {data.meta.stale ? (
          <WifiOff size={14} />
        ) : (
          <span className="status-dot" />
        )}
        {data.meta.stale
          ? "Saved snapshot · provider unavailable"
          : data.meta.mode === "delayed"
            ? "Delayed provider feed"
            : "Community data · no live feed"}
      </span>
      <button
        onClick={refresh}
        disabled={fetching}
        aria-label="Refresh football data"
      >
        <RefreshCw size={13} className={fetching ? "spin" : ""} />
        <span>
          {fetching
            ? "Checking…"
            : `Retrieved ${new Date(data.meta.fetchedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
        </span>
      </button>
    </div>
  );
}
export function SectionHead({
  title,
  subtitle,
  to,
  link = "View all",
}: {
  title: string;
  subtitle?: string;
  to?: string;
  link?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {to && (
        <Link className="text-link" to={to}>
          {link}
          <ArrowUpRight size={15} />
        </Link>
      )}
    </div>
  );
}
export function matchStatus(m: Match) {
  return m.status === "finished"
    ? "FT"
    : m.status === "in-play"
      ? "In play · delayed"
      : m.status === "paused"
        ? "Paused · delayed"
        : m.status === "scheduled"
          ? m.kickoff
            ? new Date(m.kickoff).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Scheduled"
          : m.status === "unconfirmed"
            ? "Result pending"
            : m.status;
}
export function MatchCard({
  match: m,
  compact = false,
}: {
  match: Match;
  compact?: boolean;
}) {
  const { league, season, path } = useApp();
  return (
    <article className={`match-card ${compact ? "compact" : ""}`}>
      <Link
        to={path(`/match/${m.id}`)}
        className="match-link"
        aria-label={`${shortName(m.home.name)} versus ${shortName(m.away.name)}, ${matchStatus(m)}`}
      >
        <div className="match-top">
          <span>{m.round}</span>
          <span
            className={`match-status ${m.status === "finished" ? "finished" : ""}`}
          >
            {matchStatus(m)}
          </span>
        </div>
        <div className="team-line">
          <Crest team={m.home} />
          <span>{shortName(m.home.name)}</span>
          <strong>{m.score?.[0] ?? "–"}</strong>
        </div>
        <div className="team-line">
          <Crest team={m.away} />
          <span>{shortName(m.away.name)}</span>
          <strong>{m.score?.[1] ?? "–"}</strong>
        </div>
        <div className="match-footer">
          <span>
            {new Date(`${matchDate(m)}T12:00:00`).toLocaleDateString(
              undefined,
              {
                month: "short",
                day: "numeric",
              },
            )}
          </span>
          <span>
            Match center
            <ChevronRight size={13} />
          </span>
        </div>
      </Link>
      <Favorite
        id={`match:${league}:${season}:${m.id}`}
        label={`${shortName(m.home.name)} match`}
      />
    </article>
  );
}
export function Form({ form }: { form: string[] }) {
  return (
    <span className="form">
      {form.map((f, i) => (
        <span
          key={i}
          className={`form-${f}`}
          title={f === "W" ? "Win" : f === "D" ? "Draw" : "Loss"}
        >
          {f}
        </span>
      ))}
    </span>
  );
}
export function Table({
  rows,
  limit,
  sort = true,
}: {
  rows: Standing[];
  limit?: number;
  sort?: boolean;
}) {
  const { path } = useApp();
  const [order, setOrder] = useState<"position" | "gf" | "gd">("position");
  const sorted = [...rows]
    .sort((a, b) =>
      order === "position" ? a.position - b.position : b[order] - a[order],
    )
    .slice(0, limit);
  return (
    <div className="table-wrap">
      {sort && (
        <div className="table-tools">
          <label>
            Sort by{" "}
            <select
              aria-label="Sort standings"
              value={order}
              onChange={(e) => setOrder(e.target.value as typeof order)}
            >
              <option value="position">Points / position</option>
              <option value="gf">Goals scored</option>
              <option value="gd">Goal difference</option>
            </select>
          </label>
        </div>
      )}
      <table>
        <caption className="sr-only">
          Result-derived season table. Points, goal difference, then goals
          scored.
        </caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Club</th>
            <th scope="col">P</th>
            <th scope="col" className="desktop-col">
              W
            </th>
            <th scope="col" className="desktop-col">
              D
            </th>
            <th scope="col" className="desktop-col">
              L
            </th>
            <th scope="col" className="desktop-col">
              GF
            </th>
            <th scope="col" className="desktop-col">
              GA
            </th>
            <th scope="col">GD</th>
            <th scope="col">Pts</th>
            <th scope="col" className="form-col">
              Last 5
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.team.id}>
              <td className="position">{r.position}</td>
              <th scope="row">
                <Link to={path(`/team/${r.team.id}`)}>
                  <Crest team={r.team} />
                  <span>{shortName(r.team.name)}</span>
                </Link>
              </th>
              <td>{r.played}</td>
              <td className="desktop-col">{r.won}</td>
              <td className="desktop-col">{r.drawn}</td>
              <td className="desktop-col">{r.lost}</td>
              <td className="desktop-col">{r.gf}</td>
              <td className="desktop-col">{r.ga}</td>
              <td>
                {r.gd > 0 ? "+" : ""}
                {r.gd}
              </td>
              <td className="points">{r.points}</td>
              <td className="form-col">
                <Form form={r.form} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Metrics({
  items,
}: {
  items: { label: string; value: string | number; detail?: string }[];
}) {
  return (
    <div className="metrics">
      {items.map((x) => (
        <div className="metric" key={x.label}>
          <span>{x.label}</span>
          <strong>{x.value}</strong>
          {x.detail && <small>{x.detail}</small>}
        </div>
      ))}
    </div>
  );
}
