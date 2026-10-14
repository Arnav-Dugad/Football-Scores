import React, { lazy, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StateProvider } from "./lib/state";
import Shell from "./components/Shell";
import "./style.css";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Scores = lazy(() => import("./pages/Scores"));
const Competition = lazy(() => import("./pages/Competition"));
const Standings = lazy(() => import("./pages/Standings"));
const Team = lazy(() => import("./pages/Team"));
const Match = lazy(() => import("./pages/Match"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Favorites = lazy(() => import("./pages/Favorites"));
const Player = lazy(() => import("./pages/Player"));
const About = lazy(() => import("./pages/About"));
class Boundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <h1>A little pause in play.</h1>
        <p>Reload to restore the application.</p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
const client = new QueryClient();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Boundary>
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <StateProvider>
            <Routes>
              <Route element={<Shell />}>
                <Route index element={<Dashboard />} />
                <Route path="scores" element={<Scores />} />
                <Route path="competition" element={<Competition />} />
                <Route path="standings" element={<Standings />} />
                <Route path="team/:id" element={<Team />} />
                <Route path="match/:id" element={<Match />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="favorites" element={<Favorites />} />
                <Route path="player/:id" element={<Player />} />
                <Route path="about" element={<About />} />
                <Route
                  path="*"
                  element={
                    <div className="empty">
                      <h1>Off the pitch.</h1>
                      <p>This page could not be found.</p>
                      <a href="/">Back to football</a>
                    </div>
                  }
                />
              </Route>
            </Routes>
          </StateProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </Boundary>
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
