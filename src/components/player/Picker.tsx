import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { t } from "../../i18n";
import { fmtNum, teamTint } from "../../lib/format";
import { TABLE_LEAGUES as LEAGUES, LEAGUE_BY_SLUG } from "../../lib/leagues";
import { usePeople, useSeason } from "../../lib/season";
import { LANGS, useSettings } from "../../lib/settings";
import { IconSearch } from "../Icons";
import { Crest, LeagueBadge, PlayerAvatar } from "../ui";
import { searchPeople } from "./data";
import type { PlayerKey } from "./links";

/* Pick a player: choose a competition, then search its squad list (accent-insensitive). */

export function PlayerPicker({
  label,
  initialLeague,
  exclude,
  onPick,
  onCancel,
  accent,
}: {
  label: string;
  initialLeague: string;
  exclude?: PlayerKey | null;
  onPick: (k: PlayerKey) => void;
  onCancel?: () => void;
  accent: string;
}) {
  const [league, setLeague] = useState(LEAGUE_BY_SLUG[initialLeague] ? initialLeague : LEAGUES[0].slug);
  const [q, setQ] = useState("");
  const people = usePeople(league);
  const season = useSeason(league);
  const teams = useMemo(() => new Map((season.data?.teams ?? []).map((x) => [x.id, x])), [season.data]);
  const results = useMemo(
    () => searchPeople((people.data?.players ?? []).filter((p) => !(exclude && exclude.league === league && exclude.id === p.id)), q, 8),
    [people.data, q, exclude, league],
  );
  const listRef = useRef<HTMLUListElement>(null);
  const uid = useId();
  // The compare layout pins slots left/right; the picker itself follows the reading direction.
  const [settings] = useSettings();
  const pageDir = LANGS.find((l) => l.code === settings.lang)?.dir ?? "ltr";

  const focusItem = (i: number) => {
    const items = listRef.current?.querySelectorAll<HTMLButtonElement>("button");
    if (!items?.length) return;
    items[Math.max(0, Math.min(items.length - 1, i))].focus();
  };
  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "Enter" && results[0]) {
      e.preventDefault();
      onPick({ league, id: results[0].id });
    } else if (e.key === "Escape" && onCancel) onCancel();
  };
  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const items = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(i + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (i <= 0) document.getElementById(`${uid}-q`)?.focus();
      else focusItem(i - 1);
    } else if (e.key === "Escape" && onCancel) onCancel();
  };

  const loading = people.loading;
  const empty = !loading && !!people.data && people.data.players.length === 0;

  return (
    <div className="glass pl-picker" dir={pageDir} style={{ ["--pick" as string]: accent }} role="group" aria-label={label}>
      <div className="pl-picker-head">
        <span className="pl-picker-dot" aria-hidden />
        <b>{label}</b>
        {onCancel && (
          <button type="button" className="pl-link-btn" onClick={onCancel}>
            {t("Cancel")}
          </button>
        )}
      </div>
      <label className="pl-field">
        <span className="pl-field-k">{t("Competition")}</span>
        <span className="pl-select">
          <LeagueBadge slug={league} size={24} />
          <select value={league} onChange={(e) => setLeague(e.target.value)}>
            {LEAGUES.map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.name}
              </option>
            ))}
          </select>
        </span>
      </label>
      <label className="pl-search" htmlFor={`${uid}-q`}>
        <IconSearch />
        <span className="sr-only">{t("Search players")}</span>
        <input
          id={`${uid}-q`}
          type="search"
          value={q}
          placeholder={t("Search players")}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onInputKey}
          aria-describedby={`${uid}-hint`}
        />
      </label>
      <p className="pl-picker-hint" id={`${uid}-hint`} aria-live="polite">
        {loading
          ? t("Loading players…")
          : empty
            ? t("Squads for this competition are still loading. Try again in a minute.")
            : q.trim()
              ? results.length
                ? t("{n} matching players", { n: results.length })
                : t("No players match “{q}”.", { q: q.trim() })
              : t("Top performers — or type a name")}
      </p>
      <ul className="pl-results" ref={listRef} onKeyDown={onListKey}>
        {loading
          ? Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="pl-result-skel">
                <span className="skel" style={{ width: 40, height: 40, borderRadius: 20 }} />
                <span className="skel" style={{ flex: 1, height: 14, borderRadius: 7 }} />
              </li>
            ))
          : results.map((p) => {
              const team = teams.get(p.t);
              return (
                <li key={p.id}>
                  <button type="button" className="pl-result" onClick={() => onPick({ league, id: p.id })}>
                    <PlayerAvatar name={p.n} team={team?.n} size={40} color={teamTint(team?.c, "#5e5ce6")} />
                    <span className="pl-result-main">
                      <b>{p.n}</b>
                      <span className="pl-result-sub">
                        {team && <Crest src={team.l} size={14} alt="" />}
                        <span>{team?.s || team?.n || p.posName}</span>
                      </span>
                    </span>
                    <span className="pl-result-stats num" aria-label={t("{g} goals, {a} assists", { g: p.g, a: p.a })}>
                      {t("{g} G · {a} A", { g: fmtNum(p.g), a: fmtNum(p.a) })}
                    </span>
                  </button>
                </li>
              );
            })}
      </ul>
    </div>
  );
}
