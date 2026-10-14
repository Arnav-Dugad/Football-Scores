import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Trophy, ArrowUpRight } from "lucide-react";
import { useApp } from "../lib/state";
import {
  leagues,
  shortName,
  type LeagueId,
  type Dataset,
} from "../../shared/model";
import {
  Title,
  Favorite,
  Empty,
  Crest,
  MatchCard,
  SectionHead,
} from "../components/UI";
export default function Favorites() {
  const { favorites, data, league, season, path } = useApp();
  const scopes = [
    ...new Set(
      favorites
        .filter((x) => x.startsWith("team:") || x.startsWith("match:"))
        .map((x) => {
          const p = x.split(":");
          return `${p[1]}:${p[0] === "match" ? p[2] : season}`;
        }),
    ),
  ].filter((x) => leagues.some((l) => l.id === x.split(":")[0]));
  const queries = useQueries({
    queries: scopes.map((scope) => {
      const [id, s] = scope.split(":");
      return {
        queryKey: ["saved-data", id, s],
        queryFn: async (): Promise<Dataset> => {
          if (id === league && s === season && data) return data;
          const r = await fetch(`/data/${s}-${id}.json`);
          if (!r.ok) throw new Error("Saved season unavailable");
          const raw = await r.json();
          const { normalizeOpen } = await import("../../shared/normalize");
          return normalizeOpen(
            raw,
            id as LeagueId,
            s,
            raw.provenance.retrievedAt,
            true,
          );
        },
        staleTime: 3600000,
      };
    }),
  });
  const datasets = queries.map((q) => q.data).filter((d): d is Dataset => !!d);
  const clubs = favorites.filter((x) => x.startsWith("team:"));
  const savedMatches = favorites.filter((x) => x.startsWith("match:"));
  return (
    <>
      <Title
        eyebrow="A LITTLE MORE PERSONAL"
        title="Your football"
        description="Your clubs, your competitions, your matches. Saved on this device."
      />
      {!favorites.length ? (
        <div className="panel">
          <Empty title="Make yourself at home">
            Save a club, competition or match using its star. Your favourites
            will appear here without an account.
          </Empty>
          <Link className="button load-more" to={path("/competition")}>
            Explore clubs
            <ArrowUpRight size={16} />
          </Link>
        </div>
      ) : (
        <>
          <SectionHead title="Your competitions" />
          <div className="league-grid">
            {leagues
              .filter((l) => favorites.includes(`league:${l.id}`))
              .map((l) => (
                <article className="panel saved-league" key={l.id}>
                  <Link to={path("/competition", l.id)}>
                    <Trophy size={22} />
                    <span>
                      {l.name}
                      <small>{l.country}</small>
                    </span>
                  </Link>
                  <Favorite id={`league:${l.id}`} label={l.name} />
                </article>
              ))}
          </div>
          <SectionHead title="Your clubs" />
          <div className="club-grid">
            {clubs.map((key) => {
              const [, id, teamId] = key.split(":");
              const team = datasets
                .find((d) => d.league === id)
                ?.standings.find((r) => r.team.id === teamId)?.team;
              return (
                <article className="panel club-card" key={key}>
                  <Favorite id={key} label={team?.name ?? "saved club"} />
                  {team ? (
                    <Link to={path(`/team/${team.id}`, id)}>
                      <Crest team={team} large />
                      <h3>{shortName(team.name)}</h3>
                      <p>{leagues.find((l) => l.id === id)?.name}</p>
                    </Link>
                  ) : (
                    <p role="status">
                      {queries.some((q) => q.isPending)
                        ? "Loading saved club…"
                        : "This club is unavailable in this season. Use the star to remove it."}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          <SectionHead title="Your matches" />
          <div className="match-grid">
            {savedMatches.map((key) => {
              const [, id, s, matchId] = key.split(":");
              const m = datasets
                .find((d) => d.league === id && d.season === s)
                ?.matches.find((m) => m.id === matchId);
              return m ? (
                <div key={key} className="saved-match">
                  <Link
                    className="text-link"
                    to={`/match/${m.id}?league=${id}&season=${s}`}
                  >
                    {leagues.find((l) => l.id === id)?.name} · {s}
                    <ArrowUpRight size={13} />
                  </Link>
                  {id === league && s === season ? (
                    <MatchCard match={m} />
                  ) : (
                    <article className="panel saved-other">
                      <Link to={`/match/${m.id}?league=${id}&season=${s}`}>
                        <span>
                          {shortName(m.home.name)} × {shortName(m.away.name)}
                        </span>
                        <strong>{m.score?.join(" : ") ?? "Scheduled"}</strong>
                        <small>{m.date}</small>
                      </Link>
                      <Favorite id={key} label="saved match" />
                    </article>
                  )}
                </div>
              ) : (
                <article className="panel saved-other" key={key}>
                  <p>
                    {queries.some((q) => q.isPending)
                      ? "Loading saved match…"
                      : "Saved match unavailable."}
                  </p>
                  <Favorite id={key} label="unavailable match" />
                </article>
              );
            })}
          </div>
          <p className="fine-print">
            Club records follow the selected season. Other saved seasons are
            read from timestamped local snapshots. Device storage can be cleared
            by your browser.
          </p>
        </>
      )}
    </>
  );
}
