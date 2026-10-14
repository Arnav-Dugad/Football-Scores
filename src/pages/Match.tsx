import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Copy, Check, CalendarDays, MapPin } from "lucide-react";
import { useApp } from "../lib/state";
import { leagues, shortName } from "../../shared/model";
import {
  Title,
  DataGate,
  Crest,
  Favorite,
  matchStatus,
  SectionHead,
  MatchCard,
  Metrics,
  Empty,
  Form,
} from "../components/UI";
export default function Match() {
  const { id } = useParams();
  const { data, league, season, path } = useApp();
  const [tab, setTab] = useState("overview");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const m = data?.matches.find((m) => m.id === id);
  const l = leagues.find((x) => x.id === league)!;
  const h2h = m
    ? (data?.matches
        .filter(
          (x) =>
            x.id !== m.id &&
            ((x.home.id === m.home.id && x.away.id === m.away.id) ||
              (x.home.id === m.away.id && x.away.id === m.home.id)),
        )
        .sort((a, b) => b.date.localeCompare(a.date)) ?? [])
    : [];
  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <>
      <Title
        eyebrow="INSIDE THE MATCH"
        title={
          m
            ? `${shortName(m.home.name)} × ${shortName(m.away.name)}`
            : "Match center"
        }
        description={`${l.name} · ${m?.round ?? "Selected fixture"}`}
        action={
          <button className="button small" onClick={() => void copy()}>
            {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
            {copied ? "Link copied" : "Copy match link"}
          </button>
        }
      />
      {copyError && (
        <p role="status" className="notice">
          Copy isn’t available in this browser. Share the URL from your address
          bar.
        </p>
      )}
      <DataGate>
        {m ? (
          <>
            <section className="match-scoreboard panel">
              <div className="scoreboard-heading">
                <span className="pill">{matchStatus(m)}</span>
                <Favorite
                  id={`match:${league}:${season}:${m.id}`}
                  label="this match"
                />
              </div>
              <div className="big-score">
                <Link to={path(`/team/${m.home.id}`)}>
                  <Crest team={m.home} large />
                  <h2>{shortName(m.home.name)}</h2>
                </Link>
                <div>
                  <strong>
                    {m.score?.[0] ?? "–"}
                    <em>:</em>
                    {m.score?.[1] ?? "–"}
                  </strong>
                  {m.half && <p>Half time {m.half.join(" : ")}</p>}
                </div>
                <Link to={path(`/team/${m.away.id}`)}>
                  <Crest team={m.away} large />
                  <h2>{shortName(m.away.name)}</h2>
                </Link>
              </div>
              <div className="scoreboard-details">
                <span>
                  <CalendarDays size={15} />
                  {m.kickoff
                    ? new Date(m.kickoff).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : new Date(m.date + "T12:00:00").toLocaleDateString(
                        undefined,
                        { dateStyle: "long" },
                      )}
                </span>
                {m.venue && (
                  <span>
                    <MapPin size={15} />
                    {m.venue}
                  </span>
                )}
                <span>
                  {m.kickoff
                    ? Intl.DateTimeFormat().resolvedOptions().timeZone
                    : "Kickoff time unverified"}
                </span>
              </div>
            </section>
            <div className="tabs" role="tablist" aria-label="Match views">
              {[
                ["overview", "Overview"],
                ["h2h", "Head to head"],
              ].map(([v, label]) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={tab === v}
                  onClick={() => setTab(v)}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "overview" ? (
              <>
                <Metrics
                  items={[
                    { label: "Home goals", value: m.score?.[0] ?? "–" },
                    { label: "Away goals", value: m.score?.[1] ?? "–" },
                    {
                      label: "Result",
                      value:
                        m.status === "finished" && m.score
                          ? m.score[0] === m.score[1]
                            ? "Draw"
                            : m.score[0] > m.score[1]
                              ? "Home win"
                              : "Away win"
                          : "Pending",
                    },
                    {
                      label: "Coverage",
                      value:
                        data?.meta.mode === "delayed" ? "Delayed" : "Community",
                    },
                  ]}
                />
                <SectionHead
                  title="Season form"
                  subtitle="Last five completed matches, oldest to newest"
                />
                <div className="two-column">
                  {[m.home, m.away].map((t) => (
                    <Link
                      className="panel form-card"
                      key={t.id}
                      to={path(`/team/${t.id}`)}
                    >
                      <Crest team={t} />
                      <strong>{shortName(t.name)}</strong>
                      <Form
                        form={
                          data?.standings.find((r) => r.team.id === t.id)
                            ?.form ?? []
                        }
                      />
                    </Link>
                  ))}
                </div>
                <div className="methodology panel">
                  <h3>The available picture</h3>
                  <p>{data?.meta.notice}</p>
                  <p>
                    Scoring events, cards, substitutions, lineups, possession
                    and shot statistics are not provided by this integration.
                    Those sections are omitted. Final and half-time scores are
                    shown only when recorded.
                  </p>
                </div>
              </>
            ) : (
              <>
                <SectionHead
                  title="Their other meetings"
                  subtitle="Within the selected season only. This is not an all-time head-to-head record."
                />
                <div className="match-grid">
                  {h2h.map((x) => (
                    <MatchCard key={x.id} match={x} />
                  ))}
                </div>
                {!h2h.length && (
                  <Empty title="No other meetings recorded">
                    There are no other fixtures between these clubs in the
                    selected dataset.
                  </Empty>
                )}
              </>
            )}
          </>
        ) : (
          <Empty title="Match not found">
            This match is not present in the selected competition and season.
          </Empty>
        )}
      </DataGate>
    </>
  );
}
