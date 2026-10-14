import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { t } from "../../i18n";
import { useSwipe } from "../../lib/gestures";
import { prefersReducedMotion } from "../../lib/motion";
import { IconChevronLeft, IconChevronRight } from "../Icons";
import { IconPause, IconPlay, IconStadium } from "./icons";

/**
 * Full-bleed photo carousel: crossfade with a slow Ken Burns drift,
 * auto-advance (pausable, off under reduced motion, paused on hover/focus),
 * swipe on touch, arrow keys when focused, and dot navigation.
 */
export function Gallery({ photos, label, children }: { photos: string[]; label: string; children: ReactNode }) {
  const n = photos.length;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [hold, setHold] = useState(false);
  const [failed, setFailed] = useState<Set<number>>(() => new Set());
  const go = (d: number) => setI((x) => (n ? (x + d + n) % n : 0));
  const swipe = useSwipe<HTMLElement>((dir) => go(dir === -1 ? 1 : -1), { enabled: n > 1 });

  useEffect(() => {
    if (n < 2 || !playing || hold) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setI((x) => (x + 1) % n);
    }, 6500);
    return () => window.clearInterval(id);
  }, [n, playing, hold]);

  // Skip images that failed to load.
  useEffect(() => {
    if (failed.has(i) && failed.size < n) setI((x) => (x + 1) % n);
  }, [failed, i, n]);

  const onKey = (e: KeyboardEvent) => {
    if (n < 2) return;
    const rtl = document.documentElement.dir === "rtl";
    if (e.key === "ArrowRight") go(rtl ? -1 : 1);
    else if (e.key === "ArrowLeft") go(rtl ? 1 : -1);
    else return;
    e.preventDefault();
    setPlaying(false);
  };

  const visible = (k: number) => k === i || k === (i + 1) % n || k === (i - 1 + n) % n;
  const allFailed = n > 0 && failed.size >= n;

  return (
    <section
      className={`cl-gallery${n === 0 ? " empty" : ""}`}
      ref={swipe}
      aria-roledescription={n > 1 ? t("carousel") : undefined}
      aria-label={label}
      tabIndex={n > 1 ? 0 : undefined}
      onKeyDown={onKey}
      onPointerEnter={() => setHold(true)}
      onPointerLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false);
      }}
      data-no-swipe=""
    >
      <div className="cl-gallery-frames" aria-live={playing && !hold ? "off" : "polite"}>
        {n === 0 || allFailed ? (
          <div className="cl-gallery-empty" aria-hidden="true">
            <IconStadium />
          </div>
        ) : (
          photos.map((src, k) =>
            visible(k) && !failed.has(k) ? (
              <img
                key={src}
                src={src}
                alt=""
                className={`cl-frame${k === i ? " on" : ""}`}
                loading={k === i ? "eager" : "lazy"}
                decoding="async"
                onError={() => setFailed((s) => new Set(s).add(k))}
              />
            ) : null,
          )
        )}
        {n > 1 && (
          <span className="sr-only">
            {t("Photo {i} of {n}", { i: i + 1, n })}
          </span>
        )}
      </div>
      <div className="cl-gallery-shade" aria-hidden="true" />
      <div className="cl-gallery-content">{children}</div>
      {n > 1 && (
        <div className="cl-gallery-controls">
          <button type="button" className="cl-gbtn cl-flip" onClick={() => (go(-1), setPlaying(false))} aria-label={t("Previous photo")}>
            <IconChevronLeft />
          </button>
          <div className="cl-dots">
            {photos.map((_, k) => (
              <button
                key={k}
                type="button"
                className={k === i ? "on" : ""}
                aria-label={t("Photo {i} of {n}", { i: k + 1, n })}
                aria-current={k === i ? "true" : undefined}
                onClick={() => (setI(k), setPlaying(false))}
              />
            ))}
          </div>
          <button type="button" className="cl-gbtn cl-flip" onClick={() => (go(1), setPlaying(false))} aria-label={t("Next photo")}>
            <IconChevronRight />
          </button>
          <button
            type="button"
            className="cl-gbtn"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? t("Pause slideshow") : t("Play slideshow")}
          >
            {playing ? <IconPause /> : <IconPlay />}
          </button>
        </div>
      )}
    </section>
  );
}
