import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { t } from "../i18n";

/* "Update available — Refresh". Self-mounted into <body> so it works on every
   route (including the chrome-less /widget) without touching App.tsx. */

function UpdateToast({ onRefresh, onClose }: { onRefresh: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className={`update-toast glass-strong${shown ? " in" : ""}`} role="status" aria-live="polite">
      <img className="update-icon" src="/icons/icon-192.png" alt="" width={36} height={36} />
      <div className="update-copy">
        <strong>{t("Update available")}</strong>
        <span>{t("A new version of Pitch is ready.")}</span>
      </div>
      <button
        type="button"
        className="update-refresh"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          onRefresh();
        }}
      >
        {busy ? t("Refreshing…") : t("Refresh")}
      </button>
      <button type="button" className="update-close" onClick={onClose} aria-label={t("Dismiss")}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function showUpdateToast(onRefresh: () => void) {
  if (root) return;
  host = document.createElement("div");
  host.className = "update-toast-host";
  document.body.appendChild(host);
  root = createRoot(host);
  const close = () => {
    root?.unmount();
    host?.remove();
    root = null;
    host = null;
  };
  root.render(<UpdateToast onRefresh={onRefresh} onClose={close} />);
}
