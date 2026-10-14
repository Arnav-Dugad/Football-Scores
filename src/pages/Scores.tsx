import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Star } from "lucide-react";
import { useApp } from "../lib/state";
import { leagues, matchDate } from "../../shared/model";
import { Title, DataGate, MatchCard, Empty } from "../components/UI";
function dateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export default function Scores() {
  const { data, league, season, favorites } = useApp();
  const [date, setDate] = useState(() => dateString(new Date()));
  const [status, setStatus] = useState("all");
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState("day");
  const [page, setPage] = useState(1);
  const comp = leagues.find((l) => l.id === league)!;
  const day = new Date(date + "T12:00:00");
  const shift = (n: number) => {
    const d = new Date(day);
    d.setDate(d.getDate() + n);
    setDate(dateString(d));
    setPage(1);
  };
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(day);
    d.setDate(d.getDate() + i - 3);
    return d;
  });
  const filtered = (data?.matches ?? [])
    .filter(
      (m) =>
        (mode === "season" || matchDate(m) === date) &&
        (status === "all" ||
          (status === "in-play"
            ? ["in-play", "paused"].includes(m.status)
            : m.status === status)) &&
        (!saved || favorites.includes(`match:${league}:${season}:${m.id}`)),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = data?.meta.latestResult;
  return (
    <>
      <Title
        eyebrow="MATCHDAY, BEAUTIFULLY SIMPLE"
        title="Scores & fixtures"
        description="Pick a day. Follow a rivalry. Get closer to every result."
      />
      <div className="panel calendar-panel">
        <div className="calendar-heading">
          <div>
            <CalendarDays size={18} />
            <h2>
              {day.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </h2>
          </div>
          <label className="date-input">
            Calendar
            <input
              type="date"
              aria-label="Match date"
              value={date}
              onChange={(e) => {
                if (e.target.value) {
                  setDate(e.target.value);
                  setMode("day");
                  setPage(1);
                }
              }}
            />
          </label>
        </div>
        <div className="date-strip">
          <button
            className="icon-button"
            aria-label="Previous day"
            onClick={() => shift(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          <div className="date-days">
            {dates.map((d) => (
              <button
                className={dateString(d) === date ? "selected" : ""}
                key={dateString(d)}
                onClick={() => {
                  setDate(dateString(d));
                  setMode("day");
                  setPage(1);
                }}
              >
                <small>
                  {d.toLocaleDateString(undefined, { weekday: "short" })}
                </small>
                <strong>{d.getDate()}</strong>
                {dateString(d) === dateString(new Date()) && <i />}
              </button>
            ))}
          </div>
          <button
            className="icon-button"
            aria-label="Next day"
            onClick={() => shift(1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="date-shortcuts">
          <button
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() - 1);
              setDate(dateString(d));
              setMode("day");
              setPage(1);
            }}
          >
            Yesterday
          </button>
          <button
            onClick={() => {
              setDate(dateString(new Date()));
              setMode("day");
              setPage(1);
            }}
          >
            Today
          </button>
          <button
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() + 1);
              setDate(dateString(d));
              setMode("day");
              setPage(1);
            }}
          >
            Tomorrow
          </button>
          {latest && (
            <button
              onClick={() => {
                setDate(latest);
                setMode("day");
                setPage(1);
              }}
            >
              Latest results
            </button>
          )}
        </div>
      </div>
      <div className="scores-toolbar">
        <div className="segmented">
          {[
            ["all", "All"],
            ["in-play", "In play"],
            ["scheduled", "Upcoming"],
            ["finished", "Finished"],
          ].map(([v, n]) => (
            <button
              key={v}
              aria-pressed={status === v}
              onClick={() => {
                setStatus(v);
                setPage(1);
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <label className="filter-select">
            <select
              aria-label="Date range"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setPage(1);
              }}
            >
              <option value="day">Selected day</option>
              <option value="season">Entire season</option>
            </select>
          </label>
          <button
            className={`button small ${saved ? "active" : ""}`}
            aria-pressed={saved}
            onClick={() => {
              setSaved(!saved);
              setPage(1);
            }}
          >
            <Star size={15} />
            Saved
          </button>
        </div>
      </div>
      <DataGate>
        <div className="section-heading">
          <div>
            <h2>{comp.name}</h2>
            <p>
              {filtered.length} fixtures ·{" "}
              {mode === "day"
                ? day.toLocaleDateString(undefined, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })
                : season}
            </p>
          </div>
          <span className="subtle-label">
            {data?.meta.mode === "delayed"
              ? "Delayed feed"
              : "Community records"}
          </span>
        </div>
        {status === "in-play" && (
          <div className="notice">
            {data?.meta.mode === "community"
              ? "This source has no live coverage. In-play scores are unavailable."
              : "In-play status and scores are delayed on the free tier. Match minute is not available."}
          </div>
        )}
        {filtered.length ? (
          <>
            <div className="match-grid scores-grid">
              {filtered.slice(0, page * 24).map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
            {filtered.length > page * 24 && (
              <button
                className="button load-more"
                onClick={() => setPage(page + 1)}
              >
                Show more fixtures
                <ChevronRight size={16} />
              </button>
            )}
          </>
        ) : (
          <div className="panel">
            <Empty
              title={
                saved
                  ? "No saved matches in this view"
                  : "No fixtures in this view"
              }
            >
              Try another date, change the filters, or choose Entire season to
              explore all recorded fixtures.
            </Empty>
          </div>
        )}
      </DataGate>
    </>
  );
}
