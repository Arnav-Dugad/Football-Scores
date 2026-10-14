import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { darkVariant, sized } from "../lib/api";
import { initials, onColor } from "../lib/format";
import { useInView, usePlayer, useTheme } from "../lib/hooks";
import { leagueLogo } from "../lib/leagues";
import { IconClose } from "./Icons";

/* ------------------------------------------------------------- Crest --- */

export function Crest({ src, size = 32, alt = "", style }: { src?: string | null; size?: number; alt?: string; style?: CSSProperties }) {
  const { dark } = useTheme();
  const px = Math.min(240, Math.round(size * 2.2));
  const candidates = useMemo(() => {
    if (!src) return [];
    const list: string[] = [];
    const d = dark ? darkVariant(src) : null;
    if (d) list.push(sized(d, px));
    list.push(sized(src, px));
    if (sized(src, px) !== src) list.push(src);
    return list;
  }, [src, dark, px]);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [candidates]);

  if (!candidates.length || i >= candidates.length) {
    return (
      <div className="crest-fallback" style={{ width: size, height: size, fontSize: size * 0.34, ...style }} aria-label={alt}>
        {initials(alt || "?")}
      </div>
    );
  }
  return (
    <img
      className="crest"
      src={candidates[i]}
      width={size}
      height={size}
      alt={alt}
      loading="lazy"
      decoding="async"
      style={{ width: size, height: size, ...style }}
      onError={() => setI((n) => n + 1)}
    />
  );
}

/** League marks sit on a white tile in both themes, like an app icon. */
export function LeagueBadge({ slug, src, size = 36 }: { slug?: string; src?: string; size?: number }) {
  const url = slug ? leagueLogo(slug, false, 96) : sized(src, 96);
  return (
    <span className="league-badge" style={{ width: size, height: size, borderRadius: size * 0.3, padding: size * 0.14 }}>
      {url && <img src={url} alt="" loading="lazy" />}
    </span>
  );
}

/* ------------------------------------------------------ Player photo --- */

export function tsdbSize(url: string | null | undefined, size: "tiny" | "small" | "medium" | "full"): string | null {
  if (!url) return null;
  if (size === "full" || !/r2\.thesportsdb\.com|thesportsdb\.com\/images/.test(url)) return url;
  return url.replace(/\/(tiny|small|medium|preview)$/, "") + `/${size}`;
}

export function PlayerAvatar({
  name,
  team,
  size = 44,
  color = "#5e5ce6",
  ring,
}: {
  name: string;
  team?: string;
  size?: number;
  color?: string;
  ring?: string;
}) {
  const [ref, seen] = useInView<HTMLDivElement>("300px");
  const { info } = usePlayer(name, team, { enabled: seen });
  const [err, setErr] = useState(false);
  const cut = info?.cutout ? tsdbSize(info.cutout, size > 80 ? "medium" : "small") : null;
  const photo = !cut && info?.photo ? tsdbSize(info.photo, size > 80 ? "medium" : "small") : null;
  const src = !err ? cut || photo : null;
  return (
    <div
      ref={ref}
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        color: color.startsWith("#") ? onColor(color) : "#fff",
        background: `radial-gradient(120% 120% at 30% 20%, color-mix(in srgb, ${color} 70%, white), ${color})`,
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
      }}
    >
      {!src && <span className="initials">{initials(name)}</span>}
      {src && <img src={src} alt={name} className={cut ? "cutout" : ""} loading="lazy" onError={() => setErr(true)} />}
    </div>
  );
}

/* --------------------------------------------------------- Segmented --- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  full,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  full?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLButtonElement>(`button[data-v="${CSS.escape(value)}"]`);
    if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth });
    const ro = new ResizeObserver(() => {
      const b = wrap.current?.querySelector<HTMLButtonElement>(`button[data-v="${CSS.escape(value)}"]`);
      if (b) setThumb({ x: b.offsetLeft, w: b.offsetWidth });
    });
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [value, options.length]);
  return (
    <div className={`segmented${full ? " full" : ""}`} ref={wrap} role="tablist">
      {thumb && <span className="thumb" style={{ width: thumb.w, transform: `translateX(${thumb.x - 3}px)`, left: 3 }} />}
      {options.map((o) => (
        <button
          key={o.value}
          data-v={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? "active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- Form --- */

export function FormDots({ form, max = 5 }: { form: string; max?: number }) {
  const letters = form.replace(/[^WDL]/g, "").slice(-max).split("");
  if (!letters.length) return null;
  return (
    <span className="form-dots" aria-label={`Form: ${letters.join(" ")}`}>
      {letters.map((l, i) => (
        <span key={i} className={`form-dot ${l}`}>
          {l}
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------ Sheet --- */

export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet glass-strong" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <span className="grabber" />
        <button className="sheet-close" onClick={onClose} aria-label="Close">
          <IconClose />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------------------------------------------------- States ----- */

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty glass">
      <div className="ic">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ h = 120, r, style }: { h?: number; r?: number; style?: CSSProperties }) {
  return <div className="skel" style={{ height: h, borderRadius: r, ...style }} />;
}

export function SkeletonGrid({ n = 6, h = 132 }: { n?: number; h?: number }) {
  return (
    <div className="match-grid">
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} h={h} />
      ))}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="empty glass">
      <h3>Couldn’t load this right now</h3>
      <p>The data provider didn’t respond. Check your connection and try again.</p>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
