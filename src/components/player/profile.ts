import { useMemo } from "react";
import type { PlayerInfo } from "../../lib/api";
import { useApi, usePlayer } from "../../lib/hooks";
import { usePeople, useSeason } from "../../lib/season";
import { teamTint } from "../../lib/format";
import { LEAGUE_BY_SLUG } from "../../lib/leagues";
import {
  ageFrom,
  athletePath,
  availability,
  footOf,
  isoDob,
  metricHeight,
  parseBio,
  posGroup,
  type Availability,
  type Bio,
  type Foot,
  type PersonRow,
} from "./data";
import { isLeagueSlug, isPlayerId } from "./links";

export interface ProfileTeam {
  id: string;
  name: string;
  short: string;
  logo: string;
  color: string | null;
}

export interface Profile {
  id: string;
  league: string;
  valid: boolean;
  name: string;
  person: PersonRow | null;
  bio: Bio | null;
  info: PlayerInfo | null;
  infoDone: boolean;
  team: ProfileTeam | null;
  tint: string;
  pos: "G" | "D" | "M" | "F" | "";
  posName: string;
  jersey: string;
  age: number | null;
  dob: string | null;
  nat: string;
  flag: string;
  height: string | null;
  foot: Foot | null;
  avail: Availability;
  /** Is the availability claim backed by squad data? */
  availKnown: boolean;
  loading: boolean;
  notFound: boolean;
  error: boolean;
  reload: () => void;
}

/**
 * Everything known about one player, merged from (in priority order) the
 * league people table, ESPN's athlete bio and TheSportsDB. Each source is
 * optional; the profile degrades field by field.
 */
export function useProfile(league: string | undefined, id: string | undefined, opts: { photos?: boolean } = {}): Profile {
  const valid = isLeagueSlug(league) && isPlayerId(id);
  const lg = valid ? league! : null;
  const pid = valid ? id! : "";
  // Season tables exist only for supported competitions; other slugs use ESPN data alone.
  const known = lg && LEAGUE_BY_SLUG[lg] ? lg : null;
  const people = usePeople(known);
  const season = useSeason(known);
  const bioQ = useApi<any>(lg ? athletePath(lg, pid) : null);

  const person = useMemo(() => people.data?.players.find((p) => p.id === pid) ?? null, [people.data, pid]);
  const bio = useMemo(() => (bioQ.data ? parseBio(bioQ.data) : null), [bioQ.data]);
  const name = person?.n || bio?.name || "";

  const seasonTeam = useMemo(() => {
    const tid = bio?.team?.id ?? person?.t;
    return tid ? season.data?.teams.find((x) => x.id === tid) ?? null : null;
  }, [season.data, bio, person]);

  const team: ProfileTeam | null = bio?.team
    ? {
        ...bio.team,
        logo: bio.team.logo || seasonTeam?.l || "",
        color: seasonTeam?.c ?? bio.team.color,
      }
    : seasonTeam
      ? { id: seasonTeam.id, name: seasonTeam.n, short: seasonTeam.s, logo: seasonTeam.l, color: seasonTeam.c }
      : null;

  const { info, done } = usePlayer(name || null, team?.name, { full: true, enabled: opts.photos !== false && !!name });

  const pos = posGroup(person?.pos || bio?.pos, person?.posName || bio?.posName);
  const dob = isoDob(person?.dob) ?? bio?.dob ?? isoDob(info?.born);
  const injText = person ? person.inj : bio?.injury ?? null;

  const peopleSettled = !!people.data || !!people.error || !known;
  const bioSettled = !!bioQ.data || !!bioQ.error || !lg;

  return {
    id: pid,
    league: lg ?? league ?? "",
    valid,
    name,
    person,
    bio,
    info,
    infoDone: done,
    team,
    tint: teamTint(team?.color, "#3a3a6e"),
    pos,
    posName: person?.posName || bio?.posName || info?.position || "",
    jersey: person?.j || bio?.jersey || info?.number || "",
    age: ageFrom(dob) ?? person?.age ?? bio?.age ?? null,
    dob,
    nat: person?.nat || bio?.nat || info?.nationality || "",
    flag: person?.flag || bio?.flag || "",
    height: metricHeight(info?.height) ?? bio?.height ?? null,
    foot: footOf(info?.foot),
    avail: availability(injText),
    availKnown: !!person || !!injText,
    loading: valid && !name && !(peopleSettled && bioSettled),
    notFound: !valid || (peopleSettled && bioSettled && !name),
    error: (!!people.error || !known) && !!bioQ.error && !/\(404\)/.test(bioQ.error.message),
    reload: () => {
      people.reload();
      bioQ.reload();
    },
  };
}
