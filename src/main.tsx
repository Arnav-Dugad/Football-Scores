import { StrictMode, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { loadLang } from "./i18n";
import { applyDocumentSettings, getSettings, subscribeSettings } from "./lib/settings";
import "./platform/register";
import { router } from "./router";
import "./styles/global.css";
import "./styles/match.css";
import "./styles/analytics.css";
import "./styles/player.css";
import "./styles/club.css";
import "./styles/platform.css";
import "./styles/interaction.css";
import "./styles/settings.css";

/** Remount the whole tree when the language changes so every string re-renders. */
function Root() {
  const lang = useSyncExternalStore(subscribeSettings, () => getSettings().lang);
  return <RouterProvider key={lang} router={router} />;
}

async function boot() {
  applyDocumentSettings();
  await loadLang(getSettings().lang);
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}

void boot();
