import { useEffect } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { IconAuto, IconBrand, IconMoon, IconNews, IconScores, IconStats, IconSun, IconTable } from "./components/Icons";
import { useTheme } from "./lib/hooks";
import Analytics from "./pages/Analytics";
import MatchPage from "./pages/Match";
import News from "./pages/News";
import Scores from "./pages/Scores";
import Standings from "./pages/Standings";
import Team from "./pages/Team";

const TABS = [
  { to: "/", label: "Scores", icon: IconScores, match: (p: string) => p === "/" || p.startsWith("/match") },
  { to: "/tables", label: "Tables", icon: IconTable, match: (p: string) => p.startsWith("/tables") || p.startsWith("/team") },
  { to: "/stats", label: "Stats", icon: IconStats, match: (p: string) => p.startsWith("/stats") },
  { to: "/news", label: "News", icon: IconNews, match: (p: string) => p.startsWith("/news") },
];

function ThemeToggle() {
  const { pref, setPref } = useTheme();
  const next = pref === "system" ? "dark" : pref === "dark" ? "light" : "system";
  const Icon = pref === "system" ? IconAuto : pref === "dark" ? IconMoon : IconSun;
  return (
    <button
      className="icon-btn"
      onClick={() => setPref(next)}
      aria-label={`Theme: ${pref}. Switch to ${next}`}
      title={`Appearance: ${pref[0].toUpperCase() + pref.slice(1)}`}
    >
      <Icon />
    </button>
  );
}

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  return (
    <div className="app">
      <div className="ambient" aria-hidden>
        <div className="orb o1" />
        <div className="orb o2" />
        <div className="orb o3" />
        <div className="orb o4" />
      </div>

      <header className="nav glass-strong">
        <NavLink to="/" className="brand" aria-label="Pitch home">
          <span className="brand-mark">
            <IconBrand />
          </span>
          Pitch
        </NavLink>
        <nav className="nav-links" aria-label="Primary">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={() => `nav-link${t.match(pathname) ? " active" : ""}`}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="nav-actions">
          <ThemeToggle />
        </div>
      </header>

      <main className="main" key={pathname.split("/")[1] || "home"}>
        <Routes>
          <Route path="/" element={<Scores />} />
          <Route path="/match/:league/:id" element={<MatchPage />} />
          <Route path="/tables" element={<Standings />} />
          <Route path="/tables/:league" element={<Standings />} />
          <Route path="/stats" element={<Analytics />} />
          <Route path="/stats/:league" element={<Analytics />} />
          <Route path="/team/:league/:id" element={<Team />} />
          <Route path="/news" element={<News />} />
          <Route path="/news/:league" element={<News />} />
          <Route path="*" element={<Scores />} />
        </Routes>
      </main>

      <footer className="footer">
        <span>Pitch · Live football scores & analytics</span>
        <span>Data: ESPN · Photos: TheSportsDB & Wikimedia Commons · Logos are trademarks of their owners</span>
      </footer>

      <nav className="tabbar glass-strong" aria-label="Primary">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={() => `tab${t.match(pathname) ? " active" : ""}`}>
            <t.icon />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
