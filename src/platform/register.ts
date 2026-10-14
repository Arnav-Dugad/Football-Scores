/**
 * Platform bootstrap: installability, the service worker and its update
 * prompt, and the first-party analytics beacon. Imported once by main.tsx.
 *
 * Versioning: the page registers /sw.js?v=<build>, where <build> is the
 * content hash of the entry bundle. A new deploy therefore installs a new
 * worker; open tabs on the previous build are offered "Update available —
 * Refresh" (either because a newer worker is waiting, or because a periodic
 * check of "/" finds a different entry bundle).
 */
import { startAnalytics } from "./analytics";
import { captureInstallPrompt } from "./pwa";
import { showUpdateToast } from "./UpdateToast";

const BUILD = (() => {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.src ?? "";
  return /\/assets\/index-([\w-]+)\.js/.exec(src)?.[1] ?? "dev";
})();

const versionOf = (scriptURL: string | undefined) => {
  try {
    return scriptURL ? new URL(scriptURL).searchParams.get("v") : null;
  } catch {
    return null;
  }
};

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/** Local builds only opt in with ?sw=1 (remembered for this tab). Read at boot,
    before the router can rewrite the address. */
const LOCAL_OPT_IN = (() => {
  const asked = new URLSearchParams(location.search).get("sw") === "1";
  try {
    if (asked) sessionStorage.setItem("pitch.sw", "1");
    return asked || sessionStorage.getItem("pitch.sw") === "1";
  } catch {
    return asked;
  }
})();

function swAllowed(): boolean {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return false;
  if (window.top !== window.self) return false; // embedded widget: leave the host page alone
  return !LOCAL || LOCAL_OPT_IN;
}

let reloading = false;
let wantReload = false;

function offerUpdate(reg: ServiceWorkerRegistration | null) {
  showUpdateToast(() => {
    const waiting = reg?.waiting;
    if (waiting) {
      wantReload = true;
      waiting.postMessage({ type: "SKIP_WAITING" }); // reload follows on controllerchange
      window.setTimeout(() => {
        if (!reloading) location.reload();
      }, 3000);
    } else {
      location.reload();
    }
  });
}

function onWaiting(reg: ServiceWorkerRegistration, worker: ServiceWorker) {
  if (versionOf(worker.scriptURL) === BUILD) {
    // This tab already runs the new build — activate silently.
    worker.postMessage({ type: "SKIP_WAITING" });
  } else {
    offerUpdate(reg);
  }
}

async function checkForNewBuild(reg: ServiceWorkerRegistration | null) {
  if (BUILD === "dev" || !navigator.onLine) return;
  try {
    void reg?.update().catch(() => undefined);
    const res = await fetch("/", { cache: "no-store", headers: { Accept: "text/html" } });
    if (!res.ok) return;
    const latest = /\/assets\/index-([\w-]+)\.js/.exec(await res.text())?.[1];
    if (latest && latest !== BUILD) offerUpdate(reg);
  } catch {
    /* offline */
  }
}

async function registerWorker() {
  const sw = navigator.serviceWorker;
  if (!swAllowed()) {
    // Don't leave a stale worker controlling local development.
    if ("serviceWorker" in navigator && LOCAL && window.top === window.self) {
      const regs = await sw.getRegistrations().catch(() => []);
      await Promise.all(regs.map((r) => r.unregister()));
    }
    return;
  }

  sw.addEventListener("controllerchange", () => {
    if (reloading) return;
    if (wantReload) {
      reloading = true;
      location.reload();
      return;
    }
    // Another tab activated a newer worker underneath us.
    const v = versionOf(sw.controller?.scriptURL);
    if (v && v !== BUILD) offerUpdate(null);
  });

  let reg: ServiceWorkerRegistration;
  try {
    reg = await sw.register(`/sw.js?v=${encodeURIComponent(BUILD)}`, { scope: "/", updateViaCache: "none" });
  } catch {
    return;
  }
  if (reg.waiting && sw.controller) onWaiting(reg, reg.waiting);
  reg.addEventListener("updatefound", () => {
    const worker = reg.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" && sw.controller) onWaiting(reg, worker);
    });
  });

  // Long-lived tabs: look for a new deploy every 30 min and when returning to the tab.
  let last = Date.now();
  const check = () => {
    last = Date.now();
    void checkForNewBuild(reg);
  };
  window.setInterval(() => document.visibilityState === "visible" && check(), 30 * 60e3);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - last > 10 * 60e3) check();
  });
}

if (typeof window !== "undefined") {
  captureInstallPrompt();
  startAnalytics();
  if (document.readyState === "complete") void registerWorker();
  else window.addEventListener("load", () => void registerWorker(), { once: true });
}
