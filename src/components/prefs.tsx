import { useMemo, useRef, useState, type ReactNode } from "react";
import { t } from "../i18n";
import { endpoints, normaliseStandings } from "../lib/api";
import { countryName, flagUrl, sortedCountries } from "../lib/countries";
import { useApi } from "../lib/hooks";
import { LEAGUES, leagueLogo } from "../lib/leagues";
import { LANGS, type FollowTeam, type Lang } from "../lib/settings";
import { IconCheck, IconSearch } from "./Icons";
import { Crest, Skeleton } from "./ui";

/* Building blocks shared by Settings and Onboarding. */

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch${on ? " on" : ""}`}
      onClick={() => onChange(!on)}
    >
      <span className="knob" />
    </button>
  );
}

export function Group({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="pref-group">
      {title && <h2 className="pref-title">{title}</h2>}
      <div className="pref-card glass">{children}</div>
      {footer && <p className="pref-footer">{footer}</p>}
    </section>
  );
}

export function PrefRow({
  icon,
  tint,
  label,
  detail,
  children,
  onClick,
}: {
  icon?: ReactNode;
  tint?: string;
  label: ReactNode;
  detail?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
}) {
  const inner = (
    <>
      {icon && (
        <span className="pref-icon" style={{ background: tint }}>
          {icon}
        </span>
      )}
      <span className="pref-label">
        <span>{label}</span>
        {detail && <small>{detail}</small>}
      </span>
      {children && <span className="pref-control">{children}</span>}
    </>
  );
  return onClick ? (
    <button type="button" className="pref-row clickable" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="pref-row">{inner}</div>
  );
}

export function Flag({ code, size = 20 }: { code: string; size?: number }) {
  return <img className="flag-img" src={flagUrl(code, size <= 20 ? 20 : 40)} alt="" width={size} height={Math.round(size * 0.75)} loading="lazy" />;
}

/* ------------------------------------------------------- country list --- */

export function CountryList({ value, onPick, autoFocus }: { value: string | null; onPick: (code: string) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const all = useMemo(() => sortedCountries(), []);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((c) => c.name.toLowerCase().includes(s) || c.code.toLowerCase() === s);
  }, [all, q]);
  const selected = value ? all.find((c) => c.code === value) : null;
  return (
    <div className="country-list">
      <label className="search-field">
        <IconSearch />
        <input
          type="search"
          placeholder={t("Search countries")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus={autoFocus}
          aria-label={t("Search countries")}
        />
      </label>
      <div className="option-list" role="listbox" aria-label={t("Country")}>
        {!q && selected && (
          <button type="button" role="option" aria-selected className="option selected" onClick={() => onPick(selected.code)}>
            <Flag code={selected.code} />
            <span>{selected.name}</span>
            <IconCheck className="tick" />
          </button>
        )}
        {list
          .filter((c) => q || c.code !== value)
          .map((c) => (
            <button
              type="button"
              role="option"
              aria-selected={c.code === value}
              key={c.code}
              className={`option${c.code === value ? " selected" : ""}`}
              onClick={() => onPick(c.code)}
            >
              <Flag code={c.code} />
              <span>{c.name}</span>
              {c.code === value && <IconCheck className="tick" />}
            </button>
          ))}
        {!list.length && <p className="muted" style={{ padding: 16, margin: 0 }}>{t("No matches")}</p>}
      </div>
    </div>
  );
}

export function countryLabel(code: string | null): string {
  return code ? countryName(code) : t("Not set");
}

/* ------------------------------------------------------ language list --- */

export function LanguageList({ value, onPick }: { value: Lang; onPick: (l: Lang) => void }) {
  return (
    <div className="option-list" role="listbox" aria-label={t("Language")}>
      {LANGS.map((l) => (
        <button
          type="button"
          role="option"
          aria-selected={l.code === value}
          key={l.code}
          className={`option${l.code === value ? " selected" : ""}`}
          onClick={() => onPick(l.code)}
          lang={l.code}
          dir={l.dir}
        >
          <span className="lang-name">{l.name}</span>
          {l.code !== "en" && <span className="subtle" lang="en" dir="ltr">{l.english}</span>}
          {l.code === value && <IconCheck className="tick" />}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------- club picker -- */

export function ClubPicker({ selected, onToggle }: { selected: FollowTeam[]; onToggle: (t: FollowTeam) => void }) {
  const [league, setLeague] = useState(LEAGUES[0].slug);
  const q = useApi<any>(endpoints.standings(league));
  const teams = useMemo(() => {
    if (!q.data) return [];
    const seen = new Set<string>();
    return normaliseStandings(q.data)
      .groups.flatMap((g) => g.rows)
      .map((r) => r.team)
      .filter((tm) => (seen.has(tm.id) ? false : (seen.add(tm.id), true)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [q.data]);
  const scroller = useRef<HTMLDivElement>(null);
  const ids = new Set(selected.map((s) => s.id));

  return (
    <div className="club-picker">
      <div className="chips" ref={scroller} role="tablist" aria-label={t("Competition")}>
        {LEAGUES.map((l) => (
          <button
            type="button"
            key={l.slug}
            role="tab"
            aria-selected={league === l.slug}
            className={`chip${league === l.slug ? " active" : ""}`}
            onClick={() => setLeague(l.slug)}
          >
            <span className="chip-logo">
              <img src={leagueLogo(l.slug, false, 64)} alt="" loading="lazy" />
            </span>
            {t(l.short)}
          </button>
        ))}
      </div>
      {q.loading ? (
        <div className="club-grid">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} h={108} r={20} />
          ))}
        </div>
      ) : (
        <div className="club-grid">
          {teams.map((tm) => {
            const on = ids.has(tm.id);
            return (
              <button
                type="button"
                key={tm.id}
                className={`club-tile${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() => onToggle({ id: tm.id, league, name: tm.name, logo: tm.logo })}
              >
                <Crest src={tm.logo} size={44} alt="" />
                <span>{tm.short}</span>
                {on && (
                  <span className="club-check">
                    <IconCheck />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
