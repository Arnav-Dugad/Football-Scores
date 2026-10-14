import { NavLink, Outlet, ScrollRestoration, useLocation } from "react-router-dom";
import { IconAuto, IconBrand, IconGear, IconMoon, IconNews, IconScores, IconStats, IconSun, IconTable } from "./components/Icons";
import { Onboarding } from "./components/Onboarding";
import { t } from "./i18n";
import { InteractionLayer, LiveDot, LiveTicker, NavTitle, SearchButton } from "./interaction";
import { useTheme } from "./lib/hooks";
import { useLiveChannel } from "./lib/live";
import { useSettings } from "./lib/settings";

export const TABS = [
  { to: "/", label: "Scores", icon: IconScores, match: (p: string) => p === "/" || p.startsWith("/match") },
  {
    to: "/tables",
    label: "Tables",
    icon: IconTable,
    match: (p: string) => p.startsWith("/tables") || p.startsWith("/team") || p.startsWith("/stadium"),
  },
  {
    to: "/stats",
    label: "Stats",
    icon: IconStats,
    match: (p: string) => p.startsWith("/stats") || p.startsWith("/leagues") || p.startsWith("/player") || p.startsWith("/compare"),
  },
  { to: "/news", label: "News", icon: IconNews, match: (p: string) => p.startsWith("/news") },
];

function ThemeToggle() {
  const { pref, setPref } = useTheme();
  const next = pref === "system" ? "dark" : pref === "dark" ? "light" : "system";
  const Icon = pref === "system" ? IconAuto : pref === "dark" ? IconMoon : IconSun;
  const names = { system: t("Automatic"), dark: t("Dark"), light: t("Light") };
  return (
    <button className="icon-btn" onClick={() => setPref(next)} aria-label={`${t("Appearance")}: ${names[pref]}`} title={`${t("Appearance")}: ${names[pref]}`}>
      <Icon />
    </button>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const [settings] = useSettings();
  useLiveChannel();

  return (
    <div className="app">
      <a href="#main" className="skip-link">
        {t("Skip to content")}
      </a>
      <div className="ambient" aria-hidden>
        <div className="orb o1" />
        <div className="orb o2" />
        <div className="orb o3" />
        <div className="orb o4" />
      </div>

      <header className="nav glass-strong">
        <NavLink to="/" className="brand" aria-label={t("Pitch home")}>
          <span className="brand-mark">
            <IconBrand />
          </span>
          <span className="brand-name">Pitch</span>
        </NavLink>
        <nav className="nav-links" aria-label={t("Primary")}>
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={() => `nav-link${tab.match(pathname) ? " active" : ""}`}
              aria-current={tab.match(pathname) ? "page" : undefined}
            >
              {t(tab.label)}
              {tab.to === "/" && <LiveDot />}
            </NavLink>
          ))}
        </nav>
        <NavTitle />
        <div className="nav-actions">
          <SearchButton />
          <ThemeToggle />
          <NavLink to="/settings" className={({ isActive }) => `icon-btn${isActive ? " on" : ""}`} aria-label={t("Settings")} title={t("Settings")}>
            <IconGear />
          </NavLink>
        </div>
      </header>

      <LiveTicker />

      <main className="main" id="main" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="footer">
        <span>Pitch · {t("Live football scores & analytics")}</span>
        <span>{t("Data: ESPN · Photos: TheSportsDB & Wikimedia Commons · Logos are trademarks of their owners")}</span>
      </footer>

      <nav className="tabbar glass-strong" aria-label={t("Primary")}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={() => `tab${tab.match(pathname) ? " active" : ""}`}
            aria-current={tab.match(pathname) ? "page" : undefined}
          >
            <tab.icon />
            {t(tab.label)}
            {tab.to === "/" && <LiveDot />}
          </NavLink>
        ))}
      </nav>

      <InteractionLayer />
      {!settings.onboarded && <Onboarding />}
      <ScrollRestoration getKey={(loc) => loc.pathname + loc.search} />
    </div>
  );
}
