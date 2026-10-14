import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import Analytics from "./pages/Analytics";
import Compare from "./pages/Compare";
import Insights from "./pages/Insights";
import Leagues from "./pages/Leagues";
import MatchPage from "./pages/Match";
import News from "./pages/News";
import NotFound from "./pages/NotFound";
import Player from "./pages/Player";
import Scores from "./pages/Scores";
import SettingsPage from "./pages/Settings";
import Stadium from "./pages/Stadium";
import Standings from "./pages/Standings";
import Team from "./pages/Team";
import Widget from "./pages/Widget";

export const router = createBrowserRouter([
  // Embeddable widget renders without the app chrome.
  { path: "/widget", element: <Widget /> },
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Scores /> },
      { path: "match/:league/:id", element: <MatchPage /> },
      { path: "tables", element: <Standings /> },
      { path: "tables/:league", element: <Standings /> },
      { path: "stats", element: <Analytics /> },
      { path: "stats/:league", element: <Analytics /> },
      { path: "leagues", element: <Leagues /> },
      { path: "team/:league/:id", element: <Team /> },
      { path: "stadium/:league/:id", element: <Stadium /> },
      { path: "player/:league/:id", element: <Player /> },
      { path: "compare", element: <Compare /> },
      { path: "news", element: <News /> },
      { path: "news/:league", element: <News /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "insights", element: <Insights /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
