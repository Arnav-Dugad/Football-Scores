import { Suspense, useState, useEffect } from "react";
import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import {
  CircleDot,
  Search as SearchIcon,
  Sun,
  Moon,
  Monitor,
  LayoutGrid,
  Activity,
  Trophy,
  ChartNoAxesCombined,
  Star,
  ChevronDown,
  ArrowUpRight,
} from "lucide-react";
import { useApp } from "../lib/state";
import { leagues, seasons } from "../../shared/model";
import Search from "./Search";
import { Freshness } from "./UI";
const nav = [
  { to: "/", name: "Overview", icon: LayoutGrid },
  { to: "/scores", name: "Scores", icon: Activity },
  { to: "/competition", name: "Leagues", icon: Trophy },
  { to: "/analytics", name: "Analytics", icon: ChartNoAxesCombined },
  { to: "/favorites", name: "Saved", icon: Star },
];
export default function Shell() {
  const [search, setSearch] = useState(false);
  const { league, season, setLeague, setSeason, theme, cycleTheme, path } =
    useApp();
  const location = useLocation();
  const active = leagues.find((l) => l.id === league)!;
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link to={path("/")} className="brand">
          <span className="brand-mark">
            <CircleDot size={22} />
          </span>
          <span>
            football<span className="brand-light"> scores</span>
            <small>THE BEAUTIFUL GAME, IN FOCUS.</small>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {nav.map((n) => (
            <NavLink key={n.to} end={n.to === "/"} to={path(n.to)}>
              {n.name}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="search-trigger"
            onClick={() => setSearch(true)}
            aria-label="Open search"
          >
            <SearchIcon size={18} />
            <span>Search</span>
            <kbd>⌘ K</kbd>
          </button>
          <button
            className="icon-button"
            aria-label={`Theme: ${theme}. Change theme`}
            title={`Theme: ${theme}`}
            onClick={cycleTheme}
          >
            {theme === "system" ? (
              <Monitor size={19} />
            ) : theme === "dark" ? (
              <Moon size={19} />
            ) : (
              <Sun size={19} />
            )}
          </button>
        </div>
      </header>
      <div className="app-container">
        <div className="context-bar">
          <div className="context-select">
            <Trophy size={16} />
            <select
              aria-label="Competition"
              value={league}
              onChange={(e) => setLeague(e.target.value as typeof league)}
            >
              {leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <ChevronDown size={13} />
          </div>
          <div className="context-select season-select">
            <select
              aria-label="Season"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
            >
              {seasons.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <ChevronDown size={13} />
          </div>
          <span className="context-label">
            {active.country} <span>/</span> Football, without the noise
          </span>
        </div>
        <main id="main" key={location.pathname} className="page-enter">
          <Suspense
            fallback={
              <div
                className="skeleton page-skeleton"
                role="status"
                aria-label="Loading page"
              />
            }
          >
            <Outlet />
          </Suspense>
        </main>
        <Freshness />
        <footer>
          <div>
            <CircleDot size={16} />
            <strong>Football Scores</strong>
            <span>Made for the love of the game.</span>
          </div>
          <Link to={path("/about")}>
            Data & methodology <ArrowUpRight size={13} />
          </Link>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {nav.map((n) => (
          <NavLink key={n.to} to={path(n.to)} end={n.to === "/"}>
            <n.icon size={20} />
            <span>{n.name}</span>
          </NavLink>
        ))}
      </nav>
      <Search open={search} setOpen={setSearch} />
    </>
  );
}
