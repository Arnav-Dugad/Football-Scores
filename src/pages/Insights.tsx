import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Segmented } from "../components/ui";
import { t } from "../i18n";
import { countryName } from "../lib/countries";
import { fmtNum, fmtPct } from "../lib/format";
import { useDocumentTitle } from "../lib/hooks";
import { LEAGUE_BY_SLUG, leagueLogo } from "../lib/leagues";
import { LANGS, localeTag } from "../lib/settings";

/* Private, cookie-free audience dashboard. The key lives in sessionStorage only. */

type Dim = "section" | "league" | "country" | "device" | "lang" | "theme" | "standalone" | "ref";
interface Report {
  from: string;
  to: string;
  days: { d: string; pv: number; visits: number }[];
  totals: { pv: number; visits: number };
  dims: Record<Dim, Record<string, number>>;
  updated: string;
}
type Range = "7" | "30" | "90";
type Status = "idle" | "loading" | "ready" | "unauthorized" | "unconfigured" | "throttled" | "error";

const KEY_STORE = "pitch.insights.key";
const readKey = () => {
  try {
    return sessionStorage.getItem(KEY_STORE) ?? "";
  } catch {
    return "";
  }
};
const writeKey = (k: string) => {
  try {
    if (k) sessionStorage.setItem(KEY_STORE, k);
    else sessionStorage.removeItem(KEY_STORE);
  } catch {
    /* ignore */
  }
};

/* ------------------------------------------------------------ fetching -- */

function useReport(key: string, days: number) {
  const [state, setState] = useState<{ status: Status; data: Report | null; prev: { pv: number; visits: number } | null }>({
    status: key ? "loading" : "idle",
    data: null,
    prev: null,
  });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!key) {
      setState({ status: "idle", data: null, prev: null });
      return;
    }
    const ctl = new AbortController();
    setState((s) => ({ ...s, status: "loading" })); // keep the previous frame while refetching
    const get = (n: number) =>
      fetch(`/api/insights?days=${n}`, { headers: { Authorization: `Bearer ${key}` }, signal: ctl.signal, cache: "no-store" });
    // The selected range, plus twice the range for the "vs previous period" deltas.
    Promise.all([get(days), get(days * 2)])
      .then(async ([cur, both]) => {
        for (const res of [cur, both]) {
          if (res.status === 401) return setState({ status: "unauthorized", data: null, prev: null });
          if (res.status === 503) return setState({ status: "unconfigured", data: null, prev: null });
          if (res.status === 429) return setState({ status: "throttled", data: null, prev: null });
          if (!res.ok) throw new Error(String(res.status));
        }
        const [data, wide] = (await Promise.all([cur.json(), both.json()])) as [Report, Report];
        setState({
          status: "ready",
          data,
          prev: { pv: Math.max(0, wide.totals.pv - data.totals.pv), visits: Math.max(0, wide.totals.visits - data.totals.visits) },
        });
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setState((s) => ({ ...s, status: "error" }));
      });
    return () => ctl.abort();
  }, [key, days, nonce]);
  return { ...state, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

/* ------------------------------------------------------------- labels --- */

const SECTION_LABEL: Record<string, string> = {
  "/": "Scores",
  "/match": "Match centre",
  "/tables": "Tables",
  "/stats": "Stats",
  "/leagues": "Leagues",
  "/team": "Clubs",
  "/stadium": "Stadiums",
  "/player": "Players",
  "/compare": "Compare",
  "/news": "News",
  "/settings": "Settings",
  "/widget": "Widget",
  "/other": "Other",
};
const DEVICE_LABEL: Record<string, string> = { mobile: "Mobile", tablet: "Tablet", desktop: "Desktop" };
const THEME_LABEL: Record<string, string> = { dark: "Dark", light: "Light" };

const compact = (n: number) =>
  new Intl.NumberFormat(localeTag(), { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
const dayFmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(localeTag(), { ...opts, timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/* ---------------------------------------------------------- stat tile --- */

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev) return <span className="ins-delta flat">{t("No earlier data")}</span>;
  const d = (now - prev) / prev;
  const up = d > 0.005;
  const down = d < -0.005;
  return (
    <span className={`ins-delta ${up ? "up" : down ? "down" : "flat"}`}>
      <svg viewBox="0 0 12 12" aria-hidden="true">
        {up ? <path d="M6 2.5 10 8H2z" /> : down ? <path d="M6 9.5 2 4h8z" /> : <path d="M2 6h8" />}
      </svg>
      {up || down ? fmtPct(Math.abs(d)) : t("No change")}
      <span className="ins-delta-vs">{t("vs previous period")}</span>
    </span>
  );
}

function Tile({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="ins-tile glass">
      <span className="ins-tile-k">{label}</span>
      <span className="ins-tile-v">{value}</span>
      {children}
    </div>
  );
}

/* --------------------------------------------------------- line chart --- */

interface Series {
  key: "visits" | "pv";
  label: string;
  color: string;
}

function niceMax(v: number): { max: number; step: number } {
  if (v <= 4) return { max: 4, step: 1 };
  const raw = v / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return { max: Math.ceil(v / step) * step, step };
}

function TrendChart({ days, series }: { days: Report["days"]; series: Series[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(280, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 240;
  const m = { top: 14, right: width < 480 ? 16 : 116, bottom: 30, left: 44 };
  const iw = width - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const peak = Math.max(1, ...days.flatMap((d) => series.map((s) => d[s.key])));
  const { max, step } = niceMax(peak);
  const x = (i: number) => m.left + (days.length <= 1 ? iw / 2 : (i / (days.length - 1)) * iw);
  const y = (v: number) => m.top + ih - (v / max) * ih;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const xTickEvery = Math.max(1, Math.ceil(days.length / (width < 480 ? 4 : 7)));
  const path = (k: Series["key"]) => days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join("");

  const last = days.length - 1;
  const ends = series.map((s) => ({ s, y: y(days[last]?.[s.key] ?? 0) }));
  const labelsFit = width >= 480 && (ends.length < 2 || Math.abs(ends[0].y - ends[1].y) >= 16);

  const pick = (clientX: number) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r || !days.length) return;
    const rel = clientX - r.left - m.left;
    setHover(Math.max(0, Math.min(last, Math.round((rel / Math.max(1, iw)) * last))));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? last) - 1));
    else if (e.key === "ArrowRight") setHover((h) => Math.min(last, (h ?? -1) + 1));
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  };

  const tip = hover !== null ? days[hover] : null;
  const tipLeft = hover !== null ? Math.min(Math.max(x(hover), 90), width - 90) : 0;

  return (
    <div className="ins-chart" ref={wrap}>
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={t("Visits and page views per day")}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line className="ins-gridline" x1={m.left} x2={width - m.right} y1={y(v)} y2={y(v)} />
            <text className="ins-axis" x={m.left - 10} y={y(v)} dy="0.32em" textAnchor="end">
              {compact(v)}
            </text>
          </g>
        ))}
        {days.map((d, i) =>
          i % xTickEvery === 0 || i === last ? (
            (i === last || last - i >= xTickEvery * 0.6) && (
              <text key={d.d} className="ins-axis" x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}>
                {dayFmt(d.d, { day: "numeric", month: "short" })}
              </text>
            )
          ) : null,
        )}
        {series.map((s) => (
          <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hover !== null && <line className="ins-crosshair" x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + ih} />}
        {series.map((s) => {
          const i = hover ?? last;
          return <circle key={s.key} className="ins-dot" cx={x(i)} cy={y(days[i]?.[s.key] ?? 0)} r={4} fill={s.color} />;
        })}
        {labelsFit &&
          ends.map(({ s, y: ey }) => (
            <text key={s.key} className="ins-end" x={x(last) + 10} y={ey} dy="0.32em">
              <tspan className="ins-end-v">{compact(days[last]?.[s.key] ?? 0)}</tspan>
              <tspan className="ins-end-k" dx={6}>
                {s.label}
              </tspan>
            </text>
          ))}
      </svg>
      {tip && (
        <div className="ins-tooltip glass-strong" style={{ insetInlineStart: tipLeft }} role="status">
          <span className="ins-tooltip-date">{dayFmt(tip.d, { weekday: "short", day: "numeric", month: "short" })}</span>
          {series.map((s) => (
            <span key={s.key} className="ins-tooltip-row">
              <span className="ins-key-line" style={{ background: s.color }} />
              <strong className="num">{fmtNum(tip[s.key])}</strong>
              <span>{s.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- bar list --- */

interface BarItem {
  key: string;
  label: string;
  icon?: ReactNode;
  value: number;
}

function BarList({ title, items, total, empty, limit = 8 }: { title: string; items: BarItem[]; total: number; empty?: string; limit?: number }) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const shown = sorted.slice(0, limit);
  const rest = sorted.slice(limit).reduce((n, i) => n + i.value, 0);
  if (rest > 0) shown.push({ key: "__other", label: t("Other"), value: rest });
  const max = Math.max(1, ...shown.map((i) => i.value));
  return (
    <section className="ins-panel glass">
      <h2 className="panel-title">{title}</h2>
      {shown.length ? (
        <ul className="ins-bars">
          {shown.map((i) => {
            const share = total ? i.value / total : 0;
            return (
              <li key={i.key} className="ins-bar" title={`${i.label}: ${fmtNum(i.value)} (${fmtPct(share, share < 0.1 ? 1 : 0)})`}>
                <span className="ins-bar-label">
                  {i.icon}
                  <span className="ins-ellipsis">{i.label}</span>
                </span>
                <span className="ins-bar-track">
                  <span className="ins-bar-fill" style={{ width: `${Math.max(1.5, (i.value / max) * 100)}%` }} />
                </span>
                <span className="ins-bar-value num">{fmtNum(i.value)}</span>
                <span className="ins-bar-share num">{fmtPct(share, share < 0.1 && share > 0 ? 1 : 0)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="ins-empty">{empty ?? t("No data yet")}</p>
      )}
    </section>
  );
}

const toItems = (rec: Record<string, number> | undefined, label: (k: string) => string, icon?: (k: string) => ReactNode): BarItem[] =>
  Object.entries(rec ?? {}).map(([k, v]) => ({ key: k, label: k === "other" ? t("Other") : label(k), value: v, icon: k === "other" ? undefined : icon?.(k) }));

/* --------------------------------------------------------------- lock --- */

function Lock({ status, onUnlock }: { status: Status; onUnlock: (k: string) => void }) {
  const [value, setValue] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) onUnlock(value.trim());
  };
  const message =
    status === "unauthorized"
      ? t("That key didn’t work. Check it and try again.")
      : status === "unconfigured"
        ? t("Insights aren’t switched on for this site yet. Set the INSIGHTS_KEY secret, then come back.")
        : status === "throttled"
          ? t("Too many attempts. Please wait a few minutes.")
          : status === "error"
            ? t("Couldn’t reach the server. Try again.")
            : null;
  return (
    <div className="ins-lock glass">
      <span className="ins-lock-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="10.5" width="14" height="10" rx="3" />
          <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
        </svg>
      </span>
      <h2>{t("Private insights")}</h2>
      <p>{t("Cookie-free, aggregate audience numbers for Pitch. Enter your access key to continue.")}</p>
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor="ins-key">
          {t("Access key")}
        </label>
        <input
          id="ins-key"
          className="ins-input"
          type="password"
          autoComplete="current-password"
          placeholder={t("Access key")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <button type="submit" className="btn ins-unlock" disabled={!value.trim()}>
          {t("Unlock")}
        </button>
      </form>
      {message && (
        <p className="ins-lock-msg" role="alert">
          {message}
        </p>
      )}
      <p className="ins-lock-foot">{t("The key is kept for this tab only and never stored on the server.")}</p>
    </div>
  );
}

/* --------------------------------------------------------------- page --- */

export default function Insights() {
  useDocumentTitle(t("Insights"));
  const [key, setKey] = useState(readKey);
  const [range, setRange] = useState<Range>("30");
  const [table, setTable] = useState(false);
  const n = Number(range);
  const { status, data, prev, reload } = useReport(key, n);

  useEffect(() => {
    if (status === "unauthorized" || status === "unconfigured" || status === "throttled") {
      writeKey("");
      setKey("");
    }
  }, [status]);

  const view = useMemo(() => {
    if (!data) return null;
    return { days: data.days, visits: data.totals.visits, pv: data.totals.pv, prevVisits: prev?.visits ?? 0, prevPv: prev?.pv ?? 0 };
  }, [data, prev]);

  const series: Series[] = [
    { key: "visits", label: t("Visits"), color: "var(--series-1)" },
    { key: "pv", label: t("Page views"), color: "var(--series-2)" },
  ];

  if (!key || !data || !view) {
    return (
      <div className="page ins-page">
        <div className="page-head">
          <div>
            <p className="eyebrow">Pitch</p>
            <h1 className="large-title">{t("Insights")}</h1>
          </div>
        </div>
        {key && status === "loading" ? (
          <div className="ins-loading" aria-busy="true">
            <div className="skel" style={{ height: 110 }} />
            <div className="skel" style={{ height: 300 }} />
          </div>
        ) : (
          <Lock
            status={status}
            onUnlock={(k) => {
              writeKey(k);
              setKey(k);
            }}
          />
        )}
      </div>
    );
  }

  const dims = data.dims;
  const installed = dims.standalone?.["1"] ?? 0;
  const visitsWindow = data.totals.visits;
  const pvWindow = data.totals.pv;

  return (
    <div className="page ins-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Pitch</p>
          <h1 className="large-title">{t("Insights")}</h1>
        </div>
        <button
          type="button"
          className="btn ghost ins-lock-btn"
          onClick={() => {
            writeKey("");
            setKey("");
          }}
        >
          {t("Lock")}
        </button>
      </div>

      <div className="ins-filters">
        <Segmented<Range>
          options={[
            { value: "7", label: t("7 days") },
            { value: "30", label: t("30 days") },
            { value: "90", label: t("90 days") },
          ]}
          value={range}
          onChange={setRange}
        />
        <span className="ins-updated">
          {status === "loading" ? t("Updating…") : t("Updated {time}", { time: new Date(data.updated).toLocaleTimeString(localeTag(), { hour: "numeric", minute: "2-digit" }) })}
          {status === "error" && (
            <button type="button" className="text-btn" onClick={reload}>
              {t("Retry")}
            </button>
          )}
        </span>
      </div>

      <div className={`ins-body${status === "loading" ? " is-stale" : ""}`}>
        <div className="ins-tiles">
          <Tile label={t("Visits")} value={fmtNum(view.visits)}>
            <Delta now={view.visits} prev={view.prevVisits} />
          </Tile>
          <Tile label={t("Page views")} value={fmtNum(view.pv)}>
            <Delta now={view.pv} prev={view.prevPv} />
          </Tile>
          <Tile label={t("Pages per visit")} value={view.visits ? fmtNum(view.pv / view.visits, 1) : "–"}>
            <span className="ins-delta flat">{t("Last {n} days", { n })}</span>
          </Tile>
          <Tile label={t("Installed app")} value={visitsWindow ? fmtPct(installed / visitsWindow) : "–"}>
            <span className="ins-meter" aria-hidden="true">
              <span style={{ width: `${visitsWindow ? (installed / visitsWindow) * 100 : 0}%` }} />
            </span>
            <span className="ins-delta flat">{t("of visits")}</span>
          </Tile>
        </div>

        <section className="ins-panel glass ins-trend">
          <div className="ins-trend-head">
            <h2 className="panel-title">{t("Visits and page views")}</h2>
            <div className="ins-legend" aria-hidden={table}>
              {series.map((s) => (
                <span key={s.key} className="ins-legend-item">
                  <span className="ins-key-line" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
              <button type="button" className="text-btn" onClick={() => setTable((v) => !v)} aria-pressed={table}>
                {table ? t("Show chart") : t("Show table")}
              </button>
            </div>
          </div>
          {table ? (
            <div className="ins-table-wrap">
              <table className="ins-table">
                <thead>
                  <tr>
                    <th scope="col">{t("Date")}</th>
                    <th scope="col">{t("Visits")}</th>
                    <th scope="col">{t("Page views")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...view.days].reverse().map((d) => (
                    <tr key={d.d}>
                      <th scope="row">{dayFmt(d.d, { weekday: "short", day: "numeric", month: "short" })}</th>
                      <td className="num">{fmtNum(d.visits)}</td>
                      <td className="num">{fmtNum(d.pv)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <TrendChart days={view.days} series={series} />
          )}
        </section>

        <div className="ins-grid">
          <BarList title={t("Top sections")} items={toItems(dims.section, (k) => t(SECTION_LABEL[k] ?? k))} total={pvWindow} />
          <BarList
            title={t("Top competitions")}
            items={toItems(
              dims.league,
              (k) => t(LEAGUE_BY_SLUG[k]?.name ?? k),
              (k) =>
                LEAGUE_BY_SLUG[k] ? (
                  <span className="ins-logo">
                    <img src={leagueLogo(k, false, 48)} alt="" loading="lazy" />
                  </span>
                ) : null,
            )}
            total={Object.values(dims.league ?? {}).reduce((a, b) => a + b, 0)}
          />
          <BarList
            title={t("Countries")}
            items={toItems(
              dims.country,
              (k) => countryName(k),
              (k) => <img className="ins-flag" src={`https://flagcdn.com/w40/${k.toLowerCase()}.png`} alt="" width={20} height={15} loading="lazy" />,
            )}
            total={visitsWindow}
            limit={10}
          />
          <BarList title={t("Devices")} items={toItems(dims.device, (k) => t(DEVICE_LABEL[k] ?? k))} total={visitsWindow} />
          <BarList title={t("Languages")} items={toItems(dims.lang, (k) => LANGS.find((l) => l.code === k)?.name ?? k)} total={visitsWindow} />
          <BarList title={t("Themes")} items={toItems(dims.theme, (k) => t(THEME_LABEL[k] ?? k))} total={visitsWindow} />
          <BarList
            title={t("Installed app")}
            items={toItems(dims.standalone, (k) => (k === "1" ? t("Installed app") : t("Browser")))}
            total={visitsWindow}
          />
          <BarList
            title={t("Referrers")}
            items={toItems(dims.ref, (k) => k)}
            total={visitsWindow}
            empty={t("No external referrers yet. Direct visits aren’t listed.")}
            limit={10}
          />
        </div>

        <p className="ins-privacy">
          {t("Collected without cookies or personal data: no IP addresses, no identifiers, nothing stored about individual visitors. Do Not Track and Global Privacy Control are respected. Days are counted in UTC.")}
        </p>
      </div>
    </div>
  );
}
