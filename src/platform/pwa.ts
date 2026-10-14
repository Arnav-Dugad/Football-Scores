import { useSyncExternalStore } from "react";

/* Install state for the "Install Pitch" card. The browser fires
   `beforeinstallprompt` once, early — we capture it at boot (register.ts) so
   the card can offer it whenever Settings is opened. */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState = "installed" | "prompt" | "ios" | "manual";

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

let started = false;
export function captureInstallPrompt() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we offer our own, nicer prompt in Settings
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    emit();
  });
  window.matchMedia("(display-mode: standalone)").addEventListener?.("change", emit);
}

function snapshot(): InstallState {
  if (installedNow || isStandalone()) return "installed";
  if (deferred) return "prompt";
  if (isIOS()) return "ios";
  return "manual";
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, snapshot, () => "manual" as InstallState);
}

/** Show the browser's install dialog. Resolves true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null; // a prompt event can only be used once
  emit();
  try {
    await e.prompt();
    const choice = await e.userChoice;
    if (choice.outcome === "accepted") installedNow = true;
    emit();
    return choice.outcome === "accepted";
  } catch {
    return false;
  }
}
