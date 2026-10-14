import { useState } from "react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import { fmtFull, initials, lastName } from "../../lib/format";
import { LEAGUE_BY_SLUG } from "../../lib/leagues";
import { haptic, toggleFollow, useSettings } from "../../lib/settings";
import { IconStar, IconStarFill } from "../Icons";
import { Crest, tsdbSize } from "../ui";
import { POS_NAME, type Availability, type Foot, type NextGame } from "./data";
import { IconAlert, IconCake, IconCard, IconCheckCircle, IconCompare, IconCross, IconRuler, IconBoot, IconShirt } from "./icons";
import { compareHref } from "./links";
import type { Profile } from "./profile";

/* ------------------------------------------------------- availability -- */

export function availabilityLabel(a: Availability): string {
  const status = a.status ? t(a.status) : "";
  switch (a.tone) {
    case "out":
      return status && !/^injur/i.test(a.status) ? `${t("Injured")} — ${status.toLowerCase()}` : t("Injured");
    case "doubt":
      return status ? `${t("Doubtful")} — ${status.toLowerCase()}` : t("Doubtful");
    case "suspended":
      return t("Suspended");
    default:
      return t("Available");
  }
}

export function AvailBadge({ a, size = "md" }: { a: Availability; size?: "sm" | "md" }) {
  const Icon = a.tone === "out" ? IconCross : a.tone === "doubt" ? IconAlert : a.tone === "suspended" ? IconCard : IconCheckCircle;
  const label = availabilityLabel(a);
  return (
    <span className={`pl-avail ${a.tone} ${size}`} title={a.status || label}>
      <Icon />
      <span>{label}</span>
    </span>
  );
}

/* --------------------------------------------------------------- hero -- */

export function footLabel(f: Foot | null): string | null {
  if (f === "left") return t("Left foot");
  if (f === "right") return t("Right foot");
  if (f === "both") return t("Both feet");
  return null;
}

/** Cinematic header: club-colour light, a giant shirt number, the cutout and the essentials. */
export function PlayerHero({ p }: { p: Profile }) {
  const [settings] = useSettings();
  const [cutErr, setCutErr] = useState(false);
  const [photoErr, setPhotoErr] = useState(false);
  const cutFull = !cutErr ? p.info?.cutout ?? null : null;
  const cutMed = tsdbSize(cutFull, "medium");
  const photo = !cutFull && !photoErr ? p.info?.photo ?? null : null;
  const imgErr = cutErr || photoErr;
  const following = !!p.team && settings.teams.some((x) => x.id === p.team!.id);
  const last = lastName(p.name);
  const first = p.name.slice(0, Math.max(0, p.name.length - last.length)).trim();
  const leagueName = LEAGUE_BY_SLUG[p.league]?.name;
  const pos = p.posName || (p.pos ? POS_NAME[p.pos] : "");
  const foot = footLabel(p.foot);

  return (
    <section className="pl-hero" style={{ ["--club" as string]: p.tint }} aria-labelledby="pl-name">
      <div className="pl-hero-bg" aria-hidden />
      {p.jersey && (
        <span className="pl-hero-num" aria-hidden>
          {p.jersey}
        </span>
      )}
      <div className="pl-hero-media" aria-hidden={!cutFull && !photo}>
        {cutFull ? (
          <img
            className="pl-cutout"
            src={cutMed ?? cutFull}
            srcSet={cutMed && cutMed !== cutFull ? `${cutMed} 500w, ${cutFull} 1000w` : undefined}
            sizes="(max-width: 760px) 80vw, 460px"
            alt={p.name}
            onError={() => setCutErr(true)}
          />
        ) : photo ? (
          <img className="pl-portrait" src={tsdbSize(photo, "medium") ?? photo} alt={p.name} onError={() => setPhotoErr(true)} />
        ) : p.infoDone || imgErr ? (
          <span className="pl-initials">{initials(p.name)}</span>
        ) : (
          <span className="pl-media-skel skel" />
        )}
      </div>

      <div className="pl-hero-body">
        <p className="pl-hero-eyebrow">
          {[pos ? t(pos) : null, leagueName].filter(Boolean).join(" · ") || t("Player")}
        </p>
        <h1 className="pl-hero-name" id="pl-name">
          {first && <span className="first">{first}</span>}
          <span className="last">{last}</span>
        </h1>
        <div className="pl-hero-club">
          {p.team && (
            <Link to={`/team/${p.league}/${p.team.id}`} className="pl-club-chip">
              <span className="pl-crest-tile">
                <Crest src={p.team.logo} size={22} alt="" />
              </span>
              <span>{p.team.name}</span>
            </Link>
          )}
          {p.availKnown && p.avail.tone !== "ok" && <AvailBadge a={p.avail} />}
        </div>
        <ul className="pl-hero-facts" aria-label={t("Player details")}>
          {p.nat && (
            <li>
              {p.flag ? <img className="flag" src={p.flag} alt="" /> : null}
              <span>{p.nat}</span>
            </li>
          )}
          {p.age != null && (
            <li>
              <IconCake />
              <span>{t("{n} years", { n: p.age })}</span>
            </li>
          )}
          {p.height && (
            <li>
              <IconRuler />
              <span>{p.height}</span>
            </li>
          )}
          {foot && (
            <li>
              <IconBoot />
              <span>{foot}</span>
            </li>
          )}
          {p.jersey && (
            <li>
              <IconShirt />
              <span>{t("No. {n}", { n: p.jersey })}</span>
            </li>
          )}
        </ul>
        <div className="pl-hero-actions">
          <Link className="pl-btn primary" to={compareHref({ league: p.league, id: p.id })}>
            <IconCompare />
            {t("Compare")}
          </Link>
          {p.team && (
            <button
              type="button"
              className={`pl-btn${following ? " on" : ""}`}
              aria-pressed={following}
              onClick={() => {
                haptic();
                toggleFollow({ id: p.team!.id, league: p.league, name: p.team!.name, logo: p.team!.logo, color: p.team!.color });
              }}
            >
              {following ? <IconStarFill /> : <IconStar />}
              {following ? t("Following {club}", { club: p.team.short || p.team.name }) : t("Follow {club}", { club: p.team.short || p.team.name })}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export function HeroSkeleton() {
  return (
    <div className="pl-hero pl-hero-skel" aria-busy="true" aria-label={t("Loading player")}>
      <div className="pl-hero-body">
        <span className="skel" style={{ width: 140, height: 14, borderRadius: 7 }} />
        <span className="skel" style={{ width: "min(320px, 70%)", height: 44, borderRadius: 14, marginTop: 14 }} />
        <span className="skel" style={{ width: 200, height: 34, borderRadius: 17, marginTop: 18 }} />
        <span className="skel" style={{ width: "min(360px, 80%)", height: 28, borderRadius: 14, marginTop: 16 }} />
      </div>
      <span className="skel pl-hero-skel-media" />
    </div>
  );
}

/* ---------------------------------------------------------- next match -- */

export function NextMatch({ g, team }: { g: NextGame; team: Profile["team"] }) {
  const when = Number.isNaN(Date.parse(g.date)) ? "" : fmtFull(g.date);
  return (
    <Link to={`/match/${g.slug}/${g.id}`} className="glass pl-next">
      <span className="pl-next-k">{t("Next match")}</span>
      <span className="pl-next-teams">
        {team && <Crest src={team.logo} size={24} alt={team.name} />}
        <span className="pl-next-vs">{g.home === false ? t("at") : t("vs")}</span>
        {g.opponent && <Crest src={g.opponent.logo} size={24} alt="" />}
        <b>{g.opponent?.name ?? g.league}</b>
      </span>
      <span className="pl-next-meta">
        {when}
        {g.league ? ` · ${g.league}` : ""}
      </span>
    </Link>
  );
}
