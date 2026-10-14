import { useState } from "react";
import { IconCheck, IconShare } from "../components/Icons";
import { t } from "../i18n";
import { haptic } from "../lib/settings";
import { promptInstall, useInstallState } from "./pwa";

/** "Install Pitch" card for Settings. */

function IconAddSquare() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

function IconMenuDots() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="18" cy="12" r="1.8" />
    </svg>
  );
}

export function InstallCard() {
  const state = useInstallState();
  const [busy, setBusy] = useState(false);

  return (
    <section className="pref-group install-card" aria-labelledby="install-title">
      <h2 className="pref-title">{t("App")}</h2>
      <div className="pref-card glass install-body">
        <div className="install-hero">
          <img className="install-icon" src="/icons/icon-192.png" alt="" width={64} height={64} />
          <div className="install-copy">
            <h3 id="install-title">{state === "installed" ? t("Pitch is on your device") : t("Pitch for your Home Screen")}</h3>
            <p>
              {state === "installed"
                ? t("You’re using the installed app. Updates arrive automatically.")
                : t("Opens full screen in a tap, launches instantly and keeps your latest scores available offline.")}
            </p>
          </div>
        </div>

        {state === "prompt" && (
          <button
            type="button"
            className="install-btn"
            disabled={busy}
            onClick={async () => {
              haptic();
              setBusy(true);
              await promptInstall();
              setBusy(false);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
            </svg>
            {t("Install Pitch")}
          </button>
        )}

        {state === "ios" && (
          <ol className="install-steps">
            <li>
              <span className="install-step-icon">
                <IconShare />
              </span>
              <span>{t("Tap the Share button in Safari’s toolbar")}</span>
            </li>
            <li>
              <span className="install-step-icon">
                <IconAddSquare />
              </span>
              <span>{t("Choose “Add to Home Screen”, then tap Add")}</span>
            </li>
          </ol>
        )}

        {state === "manual" && (
          <ol className="install-steps">
            <li>
              <span className="install-step-icon">
                <IconMenuDots />
              </span>
              <span>{t("Open your browser’s menu")}</span>
            </li>
            <li>
              <span className="install-step-icon">
                <IconAddSquare />
              </span>
              <span>{t("Choose “Install app”, “Add to Home Screen” or “Add to Dock”")}</span>
            </li>
          </ol>
        )}

        {state === "installed" && (
          <div className="install-done" role="status">
            <span className="install-done-icon">
              <IconCheck />
            </span>
            {t("Installed")}
          </div>
        )}
      </div>
    </section>
  );
}
