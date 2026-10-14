import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { PeopleData } from "../../shared/season";
import {
  IconChevronRight,
  IconClock,
  IconClose,
  IconGear,
  IconNews,
  IconPeople,
  IconScores,
  IconSearch,
  IconStats,
  IconSwap,
  IconTable,
  IconTrophy,
} from "../components/Icons";
import { Crest } from "../components/ui";
import { t } from "../i18n";
import { endpoints, normaliseStandings } from "../lib/api";
import { initials } from "../lib/format";
import { useApi } from "../lib/hooks";
import { LEAGUES, LEAGUE_BY_SLUG, leagueLogo } from "../lib/leagues";
import { peoplePath } from "../lib/season";
import { Dialog, Kbd, isApple, useCloseOnRoute } from "./dialog";
import { fold, prepare, score, type Prepared } from "./fuzzy";
import { RowSkeleton } from "./skeletons";
import { searchOpen, useAtom } from "./store";

/* ================================================================ types == */

type Kind = "competition" | "club" | "player" | "page";

interface Item {
  kind: Kind;
  id: string;
  title: string;
  sub: string;
  href: string;
  /** league slug (competition), crest url (club), player id (player), page icon key (page) */
  img: string;
  keys: Prepared[];
  /** small tie-break bonus (0–60) */
  weight: number;
}

type Stored = Omit<Item, "keys" | "weight">;

const GROUPS: { kind: Kind; title: string; limit: number }[] = [
  { kind: "competition", title: "Competitions", limit: 4 },
  { kind: "club", title: "Clubs", limit: 6 },
  { kind: "player", title: "Players", limit: 8 },
  { kind: "page", title: "Pages", limit: 4 },
];

/* ======================================================== static index == */

const ALIASES: Record<string, string[]> = {
  "eng.1": ["EPL", "English Premier League", "Prem"],
  "esp.1": ["La Liga", "Spain"],
  "ita.1": ["Calcio", "Italy"],
  "ger.1": ["Buli", "Germany"],
  "fra.1": ["Ligue Un", "France"],
  "uefa.champions": ["UCL", "Champions League", "CL"],
  "uefa.europa": ["UEL", "Europa"],
  "usa.1": ["Major League Soccer"],
  "ned.1": ["Netherlands", "Holland"],
  "por.1": ["Primeira Liga", "Liga NOS"],
  "ind.1": ["ISL"],
};

function competitionItems(): Item[] {
  return LEAGUES.map((l) => ({
    kind: "competition" as const,
    id: l.slug,
    title: t(l.name),
    sub: t(l.region),
    href: `/tables/${l.slug}`,
    img: l.slug,
    keys: [l.name, t(l.name), l.short, ...(ALIASES[l.slug] ?? [])].map(prepare),
    weight: 40,
  }));
}

const PAGES: { id: string; label: string; href: string; extra?: string[] }[] = [
  { id: "scores", label: "Scores", href: "/", extra: ["Fixtures", "Results", "Live"] },
  { id: "tables", label: "Tables", href: "/tables", extra: ["Standings", "League table"] },
  { id: "stats", label: "Stats", href: "/stats", extra: ["Top scorers", "Analytics"] },
  { id: "news", label: "News", href: "/news", extra: ["Stories"] },
  { id: "leagues", label: "Compare leagues", href: "/leagues" },
  { id: "compare", label: "Compare players", href: "/compare" },
  { id: "settings", label: "Settings", href: "/settings", extra: ["Preferences", "Language", "Country", "Follow"] },
];

function pageItems(): Item[] {
  return PAGES.map((p) => ({
    kind: "page" as const,
    id: p.id,
    title: t(p.label),
    sub: t("Page"),
    href: p.href,
    img: p.id,
    keys: [p.label, t(p.label), ...(p.extra ?? []), ...(p.extra ?? []).map((x) => t(x))].map(prepare),
    weight: 20,
  }));
}

/* ======================================================= remote index === */

/** Loaded payloads survive palette close so reopening is instant. */
const loaded = new Map<string, { data: unknown; at: number }>();
const FRESH = 10 * 60_000;

const DOMESTIC_FIRST = [...LEAGUES].filter((l) => l.kind !== "cup").sort((a, b) => Number(a.slug.startsWith("uefa.")) - Number(b.slug.startsWith("uefa.")));

function Loader({ path, onData }: { path: string; onData: (p: string, d: unknown) => void }) {
  const q = useApi<unknown>(path);
  useEffect(() => {
    if (q.data !== undefined) onData(path, q.data);
    else if (q.error) onData(path, null);
  }, [q.data, q.error, path, onData]);
  return null;
}

interface Club {
  id: string;
  name: string;
  short: string;
  logo: string;
  league: string;
}

function useRemoteIndex() {
  const [version, setVersion] = useState(0);
  const [peopleReady, setPeopleReady] = useState(false);
  const onData = useCallback((p: string, d: unknown) => {
    const prev = loaded.get(p);
    if (prev && prev.data === d) return;
    loaded.set(p, { data: d, at: Date.now() });
    setVersion((v) => v + 1);
  }, []);

  // Clubs first; players a beat later so the first results land sooner.
  useEffect(() => {
    const id = window.setTimeout(() => setPeopleReady(true), 350);
    return () => window.clearTimeout(id);
  }, []);

  const standingPaths = DOMESTIC_FIRST.map((l) => endpoints.standings(l.slug));
  const peoplePaths = DOMESTIC_FIRST.map((l) => peoplePath(l.slug));
  const isFresh = (p: string) => {
    const e = loaded.get(p);
    return !!e && Date.now() - e.at < FRESH;
  };
  const loaders: ReactNode[] = [
    ...standingPaths.filter((p) => !isFresh(p)).map((p) => <Loader key={p} path={p} onData={onData} />),
    ...(peopleReady ? peoplePaths.filter((p) => !isFresh(p)).map((p) => <Loader key={p} path={p} onData={onData} />) : []),
  ];

  const clubs = useMemo(() => {
    const byId = new Map<string, Club>();
    for (const l of DOMESTIC_FIRST) {
      const d = loaded.get(endpoints.standings(l.slug))?.data;
      if (!d) continue;
      try {
        for (const g of normaliseStandings(d).groups)
          for (const r of g.rows) {
            if (!r.team?.id || byId.has(r.team.id)) continue;
            byId.set(r.team.id, { id: r.team.id, name: r.team.name, short: r.team.short, logo: r.team.logo, league: l.slug });
          }
      } catch {
        /* malformed payload — skip */
      }
    }
    return byId;
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const clubItems = useMemo<Item[]>(
    () =>
      [...clubs.values()].map((c) => ({
        kind: "club",
        id: c.id,
        title: c.name,
        sub: t(LEAGUE_BY_SLUG[c.league]?.name ?? c.league),
        href: `/team/${c.league}/${c.id}`,
        img: c.logo,
        keys: [c.name, c.short].map(prepare),
        weight: 30,
      })),
    [clubs],
  );

  const playerItems = useMemo<Item[]>(() => {
    const seen = new Set<string>();
    const out: Item[] = [];
    for (const l of DOMESTIC_FIRST) {
      const d = loaded.get(peoplePath(l.slug))?.data as PeopleData | null | undefined;
      if (!d?.players) continue;
      for (const p of d.players) {
        if (!p?.id || !p.n || seen.has(p.id)) continue;
        seen.add(p.id);
        const club = clubs.get(p.t);
        const pos = p.posName ? t(p.posName) : "";
        out.push({
          kind: "player",
          id: p.id,
          title: p.n,
          sub: [club?.short || club?.name || t(LEAGUE_BY_SLUG[l.slug]?.name ?? ""), pos].filter(Boolean).join(" · "),
          href: `/player/${l.slug}/${p.id}`,
          img: p.id,
          keys: [prepare(p.n)],
          weight: Math.min(60, (p.apps ?? 0) + (p.g ?? 0) * 3 + (p.a ?? 0) * 2),
        });
      }
    }
    return out;
  }, [version, clubs]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingClubs = standingPaths.filter((p) => !loaded.has(p)).length;
  const pendingPlayers = peoplePaths.filter((p) => !loaded.has(p)).length;
  return { loaders, clubItems, playerItems, pending: pendingClubs + pendingPlayers };
}

/* ============================================================ recents === */

const RECENT_KEY = "pitch.search.recent";

function readRecent(): Stored[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as Stored[]) : [];
    return Array.isArray(list) ? list.filter((x) => x && x.kind && x.href && x.title).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function writeRecent(list: Stored[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* storage unavailable */
  }
}

/* ============================================================== UI ====== */

export function SearchButton() {
  const mod = isApple() ? "⌘" : "Ctrl";
  return (
    <button
      type="button"
      className="icon-btn ix-search-btn"
      onClick={() => searchOpen.set(true)}
      aria-label={t("Search")}
      aria-keyshortcuts="Meta+K Control+K /"
      title={`${t("Search")} (${mod} K)`}
    >
      <IconSearch />
      <span className="ix-search-btn-label">{t("Search")}</span>
      <span className="ix-search-btn-kbd" aria-hidden>
        {mod === "⌘" ? "⌘K" : "Ctrl K"}
      </span>
    </button>
  );
}

export function SearchHost() {
  const open = useAtom(searchOpen);
  const close = useCallback(() => searchOpen.set(false), []);
  const { pathname } = useLocation();
  useCloseOnRoute(pathname, close);
  if (!open) return null;
  return <SearchPalette onClose={close} />;
}

function Thumb({ item }: { item: Pick<Item, "kind" | "img" | "title"> }) {
  const [err, setErr] = useState(false);
  if (item.kind === "competition")
    return (
      <span className="ix-thumb league">
        <img src={leagueLogo(item.img, false, 64)} alt="" loading="lazy" />
      </span>
    );
  if (item.kind === "club")
    return (
      <span className="ix-thumb crest">
        <Crest src={item.img} size={28} alt="" />
      </span>
    );
  if (item.kind === "player")
    return (
      <span className="ix-thumb photo">
        {!err ? (
          <img
            src={`https://a.espncdn.com/combiner/i?img=/i/headshots/soccer/players/full/${item.img}.png&w=96&h=70`}
            alt=""
            loading="lazy"
            onError={() => setErr(true)}
          />
        ) : (
          <span className="ini">{initials(item.title)}</span>
        )}
      </span>
    );
  const Icon =
    { scores: IconScores, tables: IconTable, stats: IconStats, news: IconNews, leagues: IconTrophy, compare: IconSwap, settings: IconGear }[
      item.img
    ] ?? IconPeople;
  return (
    <span className="ix-thumb icon">
      <Icon />
    </span>
  );
}

function SearchPalette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, "");
  const [raw, setRaw] = useState("");
  const query = useDeferredValue(raw);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<Stored[]>(readRecent);
  const { loaders, clubItems, playerItems, pending } = useRemoteIndex();
  const statics = useMemo(() => [...competitionItems(), ...pageItems()], []);
  const mod = isApple() ? "⌘" : "Ctrl";

  const q = fold(query);
  const tokens = q.split(" ").filter(Boolean);

  const groups = useMemo(() => {
    if (!q) return [];
    const pool = [...statics, ...clubItems, ...playerItems];
    const scored: { item: Item; s: number }[] = [];
    for (const item of pool) {
      const s = score(q, tokens, item.keys);
      if (s > 0) scored.push({ item, s: s + item.weight });
    }
    scored.sort((a, b) => b.s - a.s || a.item.title.localeCompare(b.item.title));
    return GROUPS.map((g) => {
      const rows = scored.filter((x) => x.item.kind === g.kind).slice(0, g.limit);
      return { ...g, rows: rows.map((r) => r.item), best: rows[0]?.s ?? 0 };
    })
      .filter((g) => g.rows.length)
      .sort((a, b) => b.best - a.best);
  }, [q, statics, clubItems, playerItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // Empty query: recents, then shortcuts to pages & competitions.
  const idle = useMemo(() => {
    if (q) return [];
    const out: { kind: string; title: string; rows: Stored[]; recent?: boolean }[] = [];
    if (recent.length) out.push({ kind: "recent", title: t("Recent"), rows: recent, recent: true });
    out.push({ kind: "page", title: t("Jump to"), rows: pageItems().slice(0, 4) });
    out.push({ kind: "competition", title: t("Competitions"), rows: competitionItems().slice(0, 6) });
    return out;
  }, [q, recent]);

  const flat: Stored[] = q ? groups.flatMap((g) => g.rows) : idle.flatMap((g) => g.rows);
  const activeIndex = Math.min(active, Math.max(0, flat.length - 1));
  const optionId = (i: number) => `${uid}-opt-${i}`;

  useEffect(() => setActive(0), [q]);

  // Keep the active option visible.
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(activeIndex))}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (item: Stored) => {
    const entry: Stored = { kind: item.kind, id: item.id, title: item.title, sub: item.sub, href: item.href, img: item.img };
    const next = [entry, ...recent.filter((r) => !(r.kind === entry.kind && r.id === entry.id))].slice(0, 8);
    writeRecent(next);
    onClose();
    nav(item.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (flat.length ? (Math.min(i, flat.length - 1) + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (flat.length ? (Math.min(i, flat.length - 1) - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Home" && e.ctrlKey) {
      setActive(0);
    } else if (e.key === "Enter") {
      const item = flat[activeIndex];
      if (item) {
        e.preventDefault();
        choose(item);
      }
    }
  };

  let index = -1;
  const renderRow = (item: Stored) => {
    const i = ++index;
    const on = i === activeIndex;
    return (
      <div
        key={`${item.kind}-${item.id}`}
        id={optionId(i)}
        role="option"
        aria-selected={on}
        className={`ix-opt${on ? " active" : ""}`}
        onPointerMove={() => i !== activeIndex && setActive(i)}
        onClick={() => choose(item)}
      >
        <Thumb item={item} />
        <span className="ix-opt-text">
          <b>{item.title}</b>
          {item.sub && <small>{item.sub}</small>}
        </span>
        <span className="ix-opt-kind">{kindLabel(item.kind)}</span>
        <IconChevronRight className="ix-opt-chev" width={16} height={16} />
      </div>
    );
  };

  const loadingMore = pending > 0;
  const nothing = q && !flat.length;
  const status = q
    ? nothing
      ? loadingMore
        ? t("Searching…")
        : t("No results for “{q}”", { q: query.trim() })
      : t(flat.length === 1 ? "{n} result" : "{n} results", { n: flat.length })
    : "";

  return (
    <Dialog label={t("Search")} onClose={onClose} variant="palette" initialFocus={input}>
      {(close) => (
        <div className="ix-search">
          {loaders}
          <div className="ix-search-field">
            <IconSearch className="ix-search-icon" />
            <input
              ref={input}
              type="search"
              role="combobox"
              aria-expanded={flat.length > 0}
              aria-controls={`${uid}-list`}
              aria-autocomplete="list"
              aria-activedescendant={flat.length ? optionId(activeIndex) : undefined}
              placeholder={t("Search clubs, players, competitions…")}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="go"
            />
            {raw && (
              <button
                type="button"
                className="ix-search-clear"
                aria-label={t("Clear search")}
                onClick={() => {
                  setRaw("");
                  input.current?.focus();
                }}
              >
                <IconClose />
              </button>
            )}
            <button type="button" className="ix-search-cancel" onClick={close}>
              {t("Cancel")}
            </button>
            <span className="ix-search-esc" aria-hidden>
              <Kbd>Esc</Kbd>
            </span>
          </div>

          <div className="ix-search-results" ref={list} id={`${uid}-list`} role="listbox" aria-label={t("Search results")}>
            {q
              ? groups.map((g) => (
                  <div role="group" aria-labelledby={`${uid}-g-${g.kind}`} key={g.kind} className="ix-group">
                    <div className="ix-group-title" id={`${uid}-g-${g.kind}`} role="presentation">
                      {t(g.title)}
                    </div>
                    {g.rows.map(renderRow)}
                  </div>
                ))
              : idle.map((g) => (
                  <div role="group" aria-labelledby={`${uid}-g-${g.kind}`} key={g.kind} className="ix-group">
                    <div className="ix-group-title" id={`${uid}-g-${g.kind}`} role="presentation">
                      {g.recent && <IconClock width={13} height={13} />}
                      {g.title}
                      {g.recent && (
                        <button
                          type="button"
                          className="ix-group-action"
                          onClick={() => {
                            writeRecent([]);
                            setRecent([]);
                            input.current?.focus();
                          }}
                        >
                          {t("Clear")}
                        </button>
                      )}
                    </div>
                    {g.rows.map(renderRow)}
                  </div>
                ))}

            {nothing &&
              (loadingMore ? (
                <div className="ix-search-loading">
                  <RowSkeleton n={3} />
                </div>
              ) : (
                <div className="ix-search-empty">
                  <span className="ix-empty-ic">
                    <IconSearch />
                  </span>
                  <b>{t("No results for “{q}”", { q: query.trim() })}</b>
                  <small>{t("Try a club, a player or a competition — spelling doesn’t need to be perfect.")}</small>
                </div>
              ))}
            {q && !nothing && loadingMore && (
              <div className="ix-search-more" role="presentation">
                <span className="ix-spinner" aria-hidden />
                {t("Searching more clubs and players…")}
              </div>
            )}
          </div>

          <div className="sr-only" role="status" aria-live="polite">
            {status}
          </div>

          <div className="ix-search-foot" aria-hidden>
            <span>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> {t("to navigate")}
            </span>
            <span>
              <Kbd>↵</Kbd> {t("to open")}
            </span>
            <span>
              <Kbd>{mod}</Kbd>
              <Kbd>K</Kbd> {t("to close")}
            </span>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function kindLabel(k: string): string {
  return k === "competition" ? t("Competition") : k === "club" ? t("Club") : k === "player" ? t("Player") : t("Page");
}
