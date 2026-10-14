import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "../components/Icons";
import { t } from "../i18n";

/**
 * Accessible modal surface used by search, the match peek and the shortcuts
 * sheet: portal, focus trap, Esc, focus restore, scroll lock, inert
 * background, animated exit, and (on phones) drag-down-to-dismiss.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let locks = 0;
let savedOverflow = "";
function lockScroll() {
  if (locks++ === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.getElementById("root")?.setAttribute("inert", "");
  }
}
function unlockScroll() {
  if (--locks <= 0) {
    locks = 0;
    document.body.style.overflow = savedOverflow;
    document.getElementById("root")?.removeAttribute("inert");
  }
}

export interface DialogProps {
  label: string;
  onClose: () => void;
  children: (close: () => void) => ReactNode;
  /** Visual variant — controls placement and animation. */
  variant: "palette" | "peek" | "sheet";
  initialFocus?: RefObject<HTMLElement>;
  className?: string;
  /** Show the round close button (top-end corner). */
  closeButton?: boolean;
  describedBy?: string;
}

export function Dialog({ label, onClose, children, variant, initialFocus, className = "", closeButton, describedBy }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      onCloseRef.current();
      return;
    }
    setClosing(true);
    window.setTimeout(() => onCloseRef.current(), 200);
  }, []);

  // Focus management + scroll lock.
  useLayoutEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    lockScroll();
    const target = initialFocus?.current ?? panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current;
    target?.focus({ preventScroll: true });
    return () => {
      unlockScroll();
      // Restore focus to the opener if it is still in the document.
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (!items.length) {
      e.preventDefault();
      panel.current.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Backdrop: close only when the press both starts and ends on it.
  const downOnBackdrop = useRef(false);

  // Drag-to-dismiss (phones): only from the grabber zone so content scrolls normally.
  const drag = useRef<{ y0: number; t0: number; dy: number; id: number } | null>(null);
  const onGrabDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    drag.current = { y0: e.clientY, t0: performance.now(), dy: 0, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onGrabMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !panel.current) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    panel.current.style.transform = `translate3d(0, ${d.dy}px, 0)`;
    panel.current.style.transition = "none";
  };
  const onGrabUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !panel.current) return;
    const v = d.dy / Math.max(1, performance.now() - d.t0);
    panel.current.style.transition = "";
    if (d.dy > 110 || v > 0.6) {
      panel.current.style.transform = `translate3d(0, 100%, 0)`;
      closingRef.current = true;
      window.setTimeout(() => onCloseRef.current(), 220);
    } else {
      panel.current.style.transform = "";
    }
  };

  return createPortal(
    <div
      className={`ix-backdrop ix-${variant}-backdrop${closing ? " closing" : ""}`}
      onPointerDown={(e) => (downOnBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnBackdrop.current) close();
      }}
    >
      <div
        ref={panel}
        className={`ix-panel ix-${variant} glass-strong ${className}${closing ? " closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-describedby={describedBy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div
          className="ix-grab"
          aria-hidden
          onPointerDown={onGrabDown}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabUp}
          onPointerCancel={onGrabUp}
        >
          <span />
        </div>
        {closeButton && (
          <button type="button" className="ix-close" onClick={close} aria-label={t("Close")}>
            <IconClose />
          </button>
        )}
        {children(close)}
      </div>
    </div>,
    document.body,
  );
}

/** Keyboard key cap. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ix-kbd">{children}</kbd>;
}

export function isApple(): boolean {
  if (typeof navigator === "undefined") return false;
  const p = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || "";
  return /mac|iphone|ipad|ipod/i.test(p);
}

/** Close when the route changes (e.g. a link inside the dialog was followed). */
export function useCloseOnRoute(pathname: string, onClose: () => void) {
  const first = useRef(pathname);
  useEffect(() => {
    if (pathname !== first.current) onClose();
  }, [pathname, onClose]);
}
