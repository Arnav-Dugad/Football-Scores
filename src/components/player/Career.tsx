import { useMemo } from "react";
import { nameKey } from "../../../shared/text";
import { t, tn } from "../../i18n";
import { endpoints } from "../../lib/api";
import { fmtNum } from "../../lib/format";
import { useApi } from "../../lib/hooks";
import { IconTrophy } from "../Icons";
import { Crest, Skeleton, tsdbSize } from "../ui";

/* Career path (TheSportsDB former teams + the current club) and honours. */

interface Club {
  team: string;
  badge: string;
  joined: string;
  departed: string;
  move: string;
  apps: number | null;
  goals: number | null;
}
interface Honour {
  honour: string;
  season: string;
  team: string;
  badge: string;
}
interface CareerData {
  clubs: Club[];
  honours: Honour[];
}

const year = (s: string) => /\d{4}/.exec(s ?? "")?.[0] ?? "";

const CLUB_NOISE = /\b(fc|afc|cf|sc|ac|club|de|the|football|calcio|hotspur|united|city)\b/g;
/** Loose club-name equality ("Brentford" ~ "Brentford FC"); keeps "Man City" ≠ "Man United". */
function sameClub(a: string, b: string): boolean {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (ka === kb) return true;
  const sa = ka.replace(CLUB_NOISE, "").replace(/\s+/g, " ").trim();
  const sb = kb.replace(CLUB_NOISE, "").replace(/\s+/g, " ").trim();
  return !!sa && sa === sb && (ka.includes(kb) || kb.includes(ka));
}

const MOVE_LABEL: Record<string, string> = { youth: "Youth", loan: "Loan", permanent: "Transfer", free: "Free transfer" };

export function useCareer(tsdbId: string | null | undefined) {
  return useApi<CareerData>(tsdbId ? endpoints.career(tsdbId) : null);
}

export function CareerTimeline({
  data,
  loading,
  current,
}: {
  data: CareerData | undefined;
  loading: boolean;
  current: { name: string; logo: string } | null;
}) {
  const items = useMemo(() => {
    const clubs = [...(data?.clubs ?? [])].filter((c) => c.team);
    const list = clubs
      .map((c, i) => ({ ...c, key: `${c.team}-${c.joined}-${i}`, current: false }))
      .sort(
        (a, b) =>
          (year(b.joined) || "0").localeCompare(year(a.joined) || "0") ||
          (year(b.departed) || "9999").localeCompare(year(a.departed) || "9999"),
      );
    const open = current ? list.find((c) => !year(c.departed) && sameClub(c.team, current.name)) : undefined;
    if (open) {
      open.current = true;
      open.badge = open.badge || current!.logo;
      list.splice(list.indexOf(open), 1);
      list.unshift(open);
    } else if (current) {
      list.unshift({
        team: current.name,
        badge: current.logo,
        joined: "",
        departed: "",
        move: "",
        apps: null,
        goals: null,
        key: "current",
        current: true,
      });
    }
    return list;
  }, [data, current]);

  return (
    <section className="glass pl-card" aria-labelledby="pl-career-title">
      <header className="pl-card-head">
        <div className="pl-card-titles">
          <h2 className="panel-title" id="pl-career-title">
            {t("Career")}
          </h2>
          <p className="pl-card-sub">{t("Clubs, most recent first")}</p>
        </div>
      </header>
      {loading && !data ? (
        <div className="pl-tl-skel" aria-hidden>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={52} r={16} />
          ))}
        </div>
      ) : items.length ? (
        <ol className="pl-timeline">
          {items.map((c) => {
            const from = year(c.joined);
            const to = year(c.departed);
            const move = MOVE_LABEL[c.move.toLowerCase()] ?? (c.move ? c.move : "");
            return (
              <li key={c.key} className={c.current ? "current" : undefined}>
                <span className="pl-tl-node">
                  <Crest src={tsdbSize(c.badge, "small") ?? c.badge} size={30} alt="" />
                </span>
                <div className="pl-tl-body">
                  <div className="pl-tl-top">
                    <b>{c.team}</b>
                    {c.current ? (
                      <span className="pill pl-now">{t("Current club")}</span>
                    ) : move ? (
                      <span className="pill">{t(move)}</span>
                    ) : null}
                  </div>
                  <div className="pl-tl-meta">
                    {from && to && from === to ? (
                      <span className="num">{from}</span>
                    ) : from && (to || c.current) ? (
                      <span className="num">{`${from} – ${to || t("now")}`}</span>
                    ) : from ? (
                      <span className="num">{t("From {y}", { y: from })}</span>
                    ) : to ? (
                      <span className="num">{t("Until {y}", { y: to })}</span>
                    ) : !c.current ? (
                      <span>{t("Dates unknown")}</span>
                    ) : null}
                    {c.apps != null && <span>{tn(c.apps, "{n} app", "{n} apps", { n: fmtNum(c.apps) })}</span>}
                    {c.goals != null && <span>{tn(c.goals, "{n} goal", "{n} goals", { n: fmtNum(c.goals) })}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="pl-empty-line">{t("No career history is available for this player yet.")}</p>
      )}
    </section>
  );
}

export function Honours({ data, loading }: { data: CareerData | undefined; loading: boolean }) {
  const groups = useMemo(() => {
    const map = new Map<string, { honour: string; items: Honour[] }>();
    for (const h of data?.honours ?? []) {
      if (!h.honour) continue;
      const k = nameKey(h.honour);
      const g = map.get(k) ?? { honour: h.honour, items: [] };
      if (!g.items.some((x) => x.season === h.season)) g.items.push(h);
      map.set(k, g);
    }
    return [...map.values()]
      .map((g) => ({ ...g, items: g.items.sort((a, b) => b.season.localeCompare(a.season)) }))
      .sort((a, b) => b.items.length - a.items.length || a.honour.localeCompare(b.honour));
  }, [data]);
  const total = groups.reduce((a, g) => a + g.items.length, 0);

  return (
    <section className="glass pl-card" aria-labelledby="pl-honours-title">
      <header className="pl-card-head">
        <div className="pl-card-titles">
          <h2 className="panel-title" id="pl-honours-title">
            {t("Honours")}
          </h2>
          {total > 0 && <p className="pl-card-sub">{tn(total, "{n} trophy", "{n} trophies", { n: total })}</p>}
        </div>
      </header>
      {loading && !data ? (
        <div className="pl-honours" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={92} r={20} />
          ))}
        </div>
      ) : groups.length ? (
        <ul className="pl-honours">
          {groups.map((g) => {
            const badges = [...new Map(g.items.filter((i) => i.badge).map((i) => [nameKey(i.team), i])).values()].slice(0, 3);
            return (
              <li key={g.honour} className="pl-honour">
                <span className="pl-honour-cup" aria-hidden>
                  <IconTrophy />
                  {g.items.length > 1 && <span className="pl-honour-count">×{g.items.length}</span>}
                </span>
                <div className="pl-honour-body">
                  <b>{g.honour}</b>
                  <span className="pl-honour-seasons">{g.items.map((i) => i.season).filter(Boolean).join(", ")}</span>
                </div>
                <span className="pl-honour-clubs">
                  {badges.map((b) => (
                    <Crest key={b.team} src={tsdbSize(b.badge, "small") ?? b.badge} size={22} alt={b.team} />
                  ))}
                </span>
                <span className="sr-only">{tn(g.items.length, "Won once", "Won {n} times", { n: g.items.length })}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pl-empty-line">{t("No major honours on record.")}</p>
      )}
    </section>
  );
}
