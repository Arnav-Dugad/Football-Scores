import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { t } from "../i18n";
import { endpoints } from "../lib/api";
import { fmtDate, fmtNum, initials, teamTint } from "../lib/format";
import { useApi, usePlayer } from "../lib/hooks";
import { LEAGUE_BY_SLUG } from "../lib/leagues";
import { usePeople } from "../lib/season";
import { AvailBadge } from "./player/Hero";
import { ageFrom, availability, isoDob, metricHeight, parseOverview, shortBio } from "./player/data";
import { IconCompare } from "./player/icons";
import { compareHref, isLeagueSlug, isPlayerId, playerHref } from "./player/links";
import { IconChevronRight } from "./Icons";
import { Crest, Sheet, tsdbSize } from "./ui";

export interface PlayerRef {
  name: string;
  id?: string;
  jersey?: string;
  position?: string;
  league?: string;
  team: { name: string; logo?: string; color?: string | null };
  nationality?: string;
  flag?: string;
  dob?: string;
  height?: string;
}

const COLS: { name: string; label: string; title: string }[] = [
  { name: "starts", label: "GS", title: "Starts" },
  { name: "totalGoals", label: "G", title: "Goals" },
  { name: "goalAssists", label: "A", title: "Assists" },
  { name: "totalShots", label: "Sh", title: "Shots" },
  { name: "yellowCards", label: "YC", title: "Yellow cards" },
];

/** Quick view of a player. Opens from lineups, stats and squads; links to the full profile. */
export function PlayerSheet({ p, onClose }: { p: PlayerRef; onClose: () => void }) {
  const { info, done } = usePlayer(p.name, p.team.name, { full: true });
  const linkable = isLeagueSlug(p.league) && isPlayerId(p.id);
  const overview = useApi<any>(linkable ? endpoints.athlete(p.league!, p.id!) : null);
  // Season tables exist only for supported competitions (avoid spinning up stores for cup/international slugs).
  const people = usePeople(linkable && LEAGUE_BY_SLUG[p.league!] ? p.league! : null);
  const person = useMemo(() => (linkable ? people.data?.players.find((x) => x.id === p.id) ?? null : null), [people.data, linkable, p.id]);
  const color = teamTint(p.team.color, "#5e5ce6");
  const [cutErr, setCutErr] = useState(false);
  const [photoErr, setPhotoErr] = useState(false);

  const cut = !cutErr ? tsdbSize(info?.cutout, "medium") : null;
  const photo = !cut && !photoErr ? tsdbSize(info?.photo, "medium") : null;
  const dob = isoDob(p.dob) ?? isoDob(person?.dob) ?? isoDob(info?.born);
  const yrs = ageFrom(dob);
  const nat = p.nationality || person?.nat || info?.nationality;
  const flag = p.flag || person?.flag;
  const num = p.jersey || person?.j || info?.number;
  const position = p.position || person?.posName || info?.position;
  const height = p.height || metricHeight(info?.height);

  const ov = useMemo(() => (overview.data ? parseOverview(overview.data, p.league ?? "") : null), [overview.data, p.league]);
  const comps = useMemo(
    () => [...(ov?.comps ?? [])].sort((a, b) => Number(b.slug === p.league) - Number(a.slug === p.league)),
    [ov, p.league],
  );
  const cols = COLS.filter((c) => comps.some((r) => r.stats[c.name] != null));
  const bio = shortBio(info?.bio);
  const avail = availability(person?.inj);

  return (
    <Sheet onClose={onClose} label={p.name}>
      <div className="ps-hero">
        <div
          className="bg"
          style={{
            background: `radial-gradient(90% 90% at 80% 20%, color-mix(in srgb, ${color} 60%, white 10%), ${color} 55%, color-mix(in srgb, ${color} 55%, black))`,
          }}
        />
        {num && (
          <span className="num-bg" aria-hidden>
            {num}
          </span>
        )}
        {cut ? (
          <img className="cut" src={cut} alt="" onError={() => setCutErr(true)} />
        ) : photo ? (
          <img className="ph" src={photo} alt="" onError={() => setPhotoErr(true)} />
        ) : done || cutErr || photoErr ? (
          <span className="num-bg" aria-hidden style={{ top: "auto", bottom: 10, fontSize: 120, color: "rgba(255,255,255,.25)" }}>
            {initials(p.name)}
          </span>
        ) : null}
        <div className="who">
          <div className="ps-pos">{position ? t(position) : t("Player")}</div>
          <h2>{p.name}</h2>
          <div className="tm">
            {p.team.logo && (
              <span className="ps-crest">
                <Crest src={p.team.logo} size={18} alt="" />
              </span>
            )}
            {p.team.name}
          </div>
          {avail.tone !== "ok" && <AvailBadge a={avail} size="sm" />}
        </div>
      </div>
      <div className="ps-body">
        {linkable && (
          <div className="ps-actions">
            <Link className="pl-btn primary ps-profile" to={playerHref(p.league!, p.id!)} onClick={onClose}>
              {t("View full profile")}
              <IconChevronRight />
            </Link>
            <Link className="pl-btn" to={compareHref({ league: p.league!, id: p.id! })} onClick={onClose}>
              <IconCompare />
              {t("Compare")}
            </Link>
          </div>
        )}
        <div className="facts-grid">
          <Fact k={t("Age")} v={yrs != null ? fmtNum(yrs) : "—"} />
          <Fact
            k={t("Nation")}
            v={
              <>
                {flag && <img className="flag" src={flag} alt="" />}
                {nat || "—"}
              </>
            }
          />
          <Fact k={t("Shirt")} v={num ? `#${num}` : "—"} />
          <Fact k={t("Height")} v={height || "—"} />
          <Fact k={t("Position")} v={position ? t(position) : "—"} />
          <Fact k={t("Born")} v={dob ? fmtDate(`${dob}T12:00:00`) : "—"} />
        </div>

        {person && (person.apps > 0 || person.g > 0) && (
          <div className="ps-season" role="group" aria-label={LEAGUE_BY_SLUG[p.league!]?.name ?? t("League season")}>
            <SeasonStat k={t("Apps")} v={person.apps} />
            <SeasonStat k={t("Goals")} v={person.g} />
            <SeasonStat k={t("Assists")} v={person.a} />
            <SeasonStat k={t("xG")} v={person.xg} digits={1} />
          </div>
        )}

        {comps.length > 0 && cols.length > 0 && (
          <>
            <p className="panel-title" style={{ marginTop: 22, marginBottom: 4 }}>
              {t("This season")}
            </p>
            <table className="mini-table">
              <thead>
                <tr>
                  <th scope="col">{t("Competition")}</th>
                  {cols.map((c) => (
                    <th scope="col" key={c.name}>
                      <abbr title={t(c.title)}>{t(c.label)}</abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comps.slice(0, 6).map((s, i) => (
                  <tr key={`${s.full}-${i}`}>
                    <td title={s.full}>{s.name}</td>
                    {cols.map((c) => (
                      <td key={c.name}>{s.stats[c.name] == null ? "–" : fmtNum(s.stats[c.name]!)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {bio && (
          <p className="bio" lang="en" dir="auto">
            {bio}
          </p>
        )}
        {info?.source && (
          <p className="subtle" style={{ fontSize: 11.5, marginTop: 14 }}>
            {info.source === "thesportsdb" ? t("Photo via TheSportsDB") : t("Photo via Wikimedia Commons")}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="fact">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function SeasonStat({ k, v, digits = 0 }: { k: string; v: number; digits?: number }) {
  return (
    <div className="ps-stat">
      <b>{fmtNum(v, digits)}</b>
      <span>{k}</span>
    </div>
  );
}
