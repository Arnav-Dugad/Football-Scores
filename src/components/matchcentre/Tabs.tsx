import { useLayoutEffect, useRef, useState } from "react";

/* Scrollable glass tab bar with a sliding thumb. Arrow keys move between
   tabs (WAI-ARIA tabs pattern, automatic activation). */

export interface TabDef<T extends string> {
  value: T;
  label: string;
  badge?: string | null;
}

export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
}: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  idPrefix: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = wrap.current?.querySelector<HTMLButtonElement>(`[data-v="${CSS.escape(value)}"]`);
      if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const el = wrap.current?.querySelector<HTMLButtonElement>(`[data-v="${CSS.escape(value)}"]`);
    // Keep the active tab in view on narrow screens.
    if (el && wrap.current) {
      const s = wrap.current;
      const left = el.offsetLeft - s.clientWidth / 2 + el.offsetWidth / 2;
      s.scrollTo({ left, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
    if (!("ResizeObserver" in window) || !wrap.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [value, tabs.length]);

  const onKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((x) => x.value === value);
    const rtl = document.documentElement.dir === "rtl";
    let n = i;
    if (e.key === (rtl ? "ArrowLeft" : "ArrowRight")) n = (i + 1) % tabs.length;
    else if (e.key === (rtl ? "ArrowRight" : "ArrowLeft")) n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[n].value);
    requestAnimationFrame(() => wrap.current?.querySelector<HTMLButtonElement>(`[data-v="${CSS.escape(tabs[n].value)}"]`)?.focus());
  };

  return (
    <div className="mc-tabs-shell glass">
      <div className="mc-tabs" ref={wrap} role="tablist" aria-label={label} onKeyDown={onKey}>
        {thumb && <span className="mc-tab-thumb" style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }} aria-hidden />}
        {tabs.map((tab) => {
          const on = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${tab.value}`}
              aria-controls={`${idPrefix}-panel`}
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              data-v={tab.value}
              className={`mc-tab${on ? " active" : ""}`}
              onClick={() => onChange(tab.value)}
            >
              {tab.label}
              {tab.badge && <span className="mc-tab-badge">{tab.badge}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
