import { useParams, useSearchParams } from "react-router-dom";
import { UserRound } from "lucide-react";
import { usePlayers } from "../lib/state";
import { Title, Empty, Metrics } from "../components/UI";
export default function Player() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const name = params.get("name") ?? "";
  const query = usePlayers(name);
  const p = query.data?.players.find((p) => p.id === id);
  const born =
    p?.born && /^\d{4}-\d{2}-\d{2}$/.test(p.born)
      ? new Date(p.born + "T12:00:00")
      : null;
  let age = born ? new Date().getFullYear() - born.getFullYear() : null;
  if (born && age !== null) {
    const now = new Date();
    if (
      now.getMonth() < born.getMonth() ||
      (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())
    )
      age--;
  }
  return (
    <>
      <Title
        eyebrow="THE PEOPLE BEHIND THE GAME"
        title={p?.name ?? "Player profile"}
        description="Player directory · TheSportsDB"
      />
      {query.isPending && name.length >= 3 ? (
        <div
          className="skeleton page-skeleton"
          role="status"
          aria-label="Loading player"
        />
      ) : query.error ? (
        <div className="panel">
          <Empty title="Player lookup paused">{query.error.message}</Empty>
          <button className="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      ) : p ? (
        <>
          <div className="panel player-banner">
            <div className="player-avatar">
              <UserRound size={52} />
            </div>
            <div>
              <span className="eyebrow">
                {p.position ?? "Position unrecorded"}
              </span>
              <h2>{p.name}</h2>
              <p>
                {p.team ?? "Team unrecorded"} ·{" "}
                {p.nationality ?? "Nationality unrecorded"}
              </p>
            </div>
          </div>
          <Metrics
            items={[
              {
                label: "Age",
                value:
                  age !== null && Number.isFinite(age) ? age : "Unavailable",
              },
              { label: "Position", value: p.position ?? "Unavailable" },
              { label: "Nationality", value: p.nationality ?? "Unavailable" },
              { label: "Team", value: p.team ?? "Unavailable" },
            ]}
          />
          {p.bio && (
            <div className="panel methodology">
              <h3>Player background</h3>
              <p>{p.bio}</p>
            </div>
          )}
          <div className="panel methodology">
            <h3>Statistics availability</h3>
            <p>
              Goals, assists, appearances, minutes, discipline and career
              comparisons are not included in this free directory integration.
              These values are unavailable. The player’s team may reflect the
              community directory’s last update.
            </p>
            <p>
              Source:{" "}
              <a
                href="https://www.thesportsdb.com/"
                target="_blank"
                rel="noreferrer"
              >
                TheSportsDB
              </a>
              . Retrieved{" "}
              {query.data && new Date(query.data.fetchedAt).toLocaleString()}.
            </p>
          </div>
        </>
      ) : (
        <div className="panel">
          <Empty title="Player not found">
            Open global search, choose Players, and search by full name. Player
            links include the provider lookup name.
          </Empty>
        </div>
      )}
    </>
  );
}
