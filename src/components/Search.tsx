import * as Dialog from "@radix-ui/react-dialog";
import { useState, useEffect, useDeferredValue, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Search as SearchIcon,
  X,
  ArrowUpRight,
  Clock,
  UserRound,
  Trophy,
} from "lucide-react";
import { useApp, usePlayers } from "../lib/state";
import { leagues, shortName } from "../../shared/model";
import { Crest, Empty } from "./UI";
export default function Search({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, path } = useApp();
  const [value, setValue] = useState("");
  const q = useDeferredValue(value.trim().toLowerCase());
  const [type, setType] = useState<"clubs" | "players">("clubs");
  const [recents, setRecents] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("fs-recent") ?? "[]");
      return Array.isArray(v)
        ? v.filter((x) => typeof x === "string").slice(0, 5)
        : [];
    } catch {
      return [];
    }
  });
  const playerQuery = usePlayers(type === "players" ? q : "");
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(!open);
      }
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, setOpen]);
  function close() {
    if (value.trim()) {
      const next = [
        value.trim(),
        ...recents.filter((x) => x !== value.trim()),
      ].slice(0, 5);
      setRecents(next);
      try {
        localStorage.setItem("fs-recent", JSON.stringify(next));
      } catch {
        /* Optional persistence. */
      }
    }
    setOpen(false);
  }
  const teams =
    data?.standings
      .filter((r) => r.team.name.toLowerCase().includes(q))
      .slice(0, 8) ?? [];
  const competitions = leagues.filter((l) =>
    (l.name + " " + l.country).toLowerCase().includes(q),
  );
  const matches =
    q.length > 2
      ? (data?.matches
          .filter((m) =>
            (m.home.name + " " + m.away.name).toLowerCase().includes(q),
          )
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 4) ?? [])
      : [];
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="search-dialog"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            document
              .querySelector<HTMLButtonElement>(".search-trigger")
              ?.focus();
          }}
        >
          <div className="search-title">
            <div>
              <Dialog.Title>Find your football.</Dialog.Title>
              <Dialog.Description>
                Clubs, competitions, matches and player name lookup.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close search">
              <X size={19} />
            </Dialog.Close>
          </div>
          <div className="search-input">
            <SearchIcon size={22} />
            <input
              ref={inputRef}
              placeholder="Search the beautiful game…"
              aria-label="Global search"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <kbd>esc</kbd>
          </div>
          <div className="segmented">
            <button
              aria-pressed={type === "clubs"}
              onClick={() => setType("clubs")}
            >
              Clubs & matches
            </button>
            <button
              aria-pressed={type === "players"}
              onClick={() => setType("players")}
            >
              Players
            </button>
          </div>
          <div className="search-results">
            {type === "clubs" ? (
              <>
                {!q && recents.length > 0 && (
                  <>
                    <div className="eyebrow">RECENT SEARCHES</div>
                    {recents.map((r) => (
                      <button
                        className="search-result"
                        key={r}
                        onClick={() => setValue(r)}
                      >
                        <Clock size={18} />
                        {r}
                      </button>
                    ))}
                  </>
                )}
                <div className="eyebrow">COMPETITIONS</div>
                {competitions.map((l) => (
                  <Link
                    onClick={close}
                    to={path("/competition", l.id)}
                    className="search-result"
                    key={l.id}
                  >
                    <Trophy size={20} />
                    <span>
                      {l.name}
                      <small>{l.country}</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </Link>
                ))}
                <div className="eyebrow">CLUBS · SELECTED SEASON</div>
                {teams.map((r) => (
                  <Link
                    onClick={close}
                    to={path(`/team/${r.team.id}`)}
                    className="search-result"
                    key={r.team.id}
                  >
                    <Crest team={r.team} />
                    <span>{shortName(r.team.name)}</span>
                    <ArrowUpRight size={16} />
                  </Link>
                ))}
                {matches.map((m) => (
                  <Link
                    onClick={close}
                    to={path(`/match/${m.id}`)}
                    className="search-result"
                    key={m.id}
                  >
                    <span>
                      {shortName(m.home.name)} × {shortName(m.away.name)}
                      <small>{m.date}</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </Link>
                ))}
                {!competitions.length && !teams.length && !matches.length && (
                  <Empty title="No matches for that search">
                    Try a club in the selected competition, or switch to
                    Players.
                  </Empty>
                )}
              </>
            ) : (
              <>
                {q.length < 3 ? (
                  <Empty title="Who are you looking for?">
                    Enter at least three letters. TheSportsDB’s free lookup may
                    return one result.
                  </Empty>
                ) : playerQuery.isPending ? (
                  <p role="status">Looking up player…</p>
                ) : playerQuery.error ? (
                  <Empty title="Player lookup paused">
                    {playerQuery.error.message}
                  </Empty>
                ) : (
                  <>
                    {playerQuery.data?.players.map((p) => (
                      <Link
                        onClick={close}
                        className="search-result"
                        key={p.id}
                        to={`${path(`/player/${p.id}`)}&name=${encodeURIComponent(p.name)}`}
                      >
                        <UserRound size={24} />
                        <span>
                          {p.name}
                          <small>
                            {p.team} · {p.nationality}
                          </small>
                        </span>
                        <ArrowUpRight size={16} />
                      </Link>
                    ))}
                    {!playerQuery.data?.players.length && (
                      <Empty title="No player found">
                        Try the player’s full name.
                      </Empty>
                    )}
                    <p className="fine-print">
                      Data: TheSportsDB. Statistics and cleared photographs are
                      not included in this lookup.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
