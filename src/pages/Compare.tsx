import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { IconSwap } from "../components/Icons";
import { HeadToHead, Radar, type Series } from "../components/player/CompareCharts";
import { AvailBadge } from "../components/player/Hero";
import { PlayerPicker } from "../components/player/Picker";
import { percentiles } from "../components/player/data";
import { IconPlus } from "../components/player/icons";
import { encodeKey, parseKey, playerHref, type PlayerKey } from "../components/player/links";
import { useProfile, type Profile } from "../components/player/profile";
import { Crest, Skeleton, tsdbSize } from "../components/ui";
import { t } from "../i18n";
import { initials, lastName } from "../lib/format";
import { useDocumentTitle } from "../lib/hooks";
import { DEFAULT_LEAGUE, LEAGUE_BY_SLUG } from "../lib/leagues";
import { usePeople } from "../lib/season";

type Slot = "a" | "b";

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const a = parseKey(params.get("a"));
  const b = parseKey(params.get("b"));
  const [editing, setEditing] = useState<Slot | null>(null);

  const pa = useProfile(a?.league, a?.id);
  const pb = useProfile(b?.league, b?.id);
  const supported = (k: PlayerKey | null) => (k && LEAGUE_BY_SLUG[k.league] ? k.league : null);
  const peopleA = usePeople(supported(a));
  const peopleB = usePeople(supported(b));

  const title =
    pa.name && pb.name
      ? t("{a} vs {b}", { a: lastName(pa.name), b: lastName(pb.name) })
      : pa.name || pb.name
        ? t("Compare {name}", { name: pa.name || pb.name })
        : t("Compare players");
  useDocumentTitle(title);

  const setSlot = (slot: Slot, k: PlayerKey | null) => {
    const next = new URLSearchParams(params);
    if (k) next.set(slot, encodeKey(k));
    else next.delete(slot);
    setParams(next, { replace: true });
    setEditing(null);
  };
  const swap = () => {
    const next = new URLSearchParams(params);
    const av = params.get("a");
    const bv = params.get("b");
    if (bv) next.set("a", bv);
    else next.delete("a");
    if (av) next.set("b", av);
    else next.delete("b");
    setParams(next, { replace: true });
  };

  const series: Series[] = useMemo(() => {
    const out: Series[] = [];
    for (const [p, people] of [
      [pa, peopleA.data],
      [pb, peopleB.data],
    ] as const) {
      if (!p.valid || !p.name) continue;
      const r = p.person && people ? percentiles(p.person, people.players) : null;
      out.push({
        name: p.name,
        short: lastName(p.name),
        league: p.league,
        pcts: r && r.list.some((x) => x.pct != null) ? r.list : null,
        peers: r?.peers ?? 0,
        person: p.person,
      });
    }
    return out;
  }, [pa, pb, peopleA.data, peopleB.data]);

  const showPicker = (slot: Slot) => editing === slot || (slot === "a" ? !a : !b);
  const defaultLeague = (slot: Slot) => (slot === "a" ? b?.league : a?.league) ?? DEFAULT_LEAGUE;
  const both = !!(a && b && pa.name && pb.name);

  return (
    <div className="page pl-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{t("Players")}</p>
          <h1 className="large-title">{t("Compare")}</h1>
        </div>
        {(a || b) && (
          <button type="button" className="pl-btn ghost" onClick={swap} aria-label={t("Swap players")}>
            <IconSwap />
            <span>{t("Swap")}</span>
          </button>
        )}
      </div>

      <section className="pl-vs" dir="ltr" aria-label={t("Players being compared")}>
        <VsSide key={a ? encodeKey(a) : "a"} p={pa} k={a} slot="a" onChange={() => setEditing("a")} onClear={() => setSlot("a", null)} />
        <div className="pl-vs-mid" aria-hidden>
          <span>{t("vs")}</span>
        </div>
        <VsSide key={b ? encodeKey(b) : "b"} p={pb} k={b} slot="b" onChange={() => setEditing("b")} onClear={() => setSlot("b", null)} />
      </section>

      {(showPicker("a") || showPicker("b")) && (
        <div className="pl-pickers" dir="ltr">
          {showPicker("a") ? (
            <PlayerPicker
              label={a ? t("Change first player") : t("Choose the first player")}
              initialLeague={a?.league ?? defaultLeague("a")}
              exclude={b}
              accent="var(--series-1)"
              onPick={(k) => setSlot("a", k)}
              onCancel={editing === "a" ? () => setEditing(null) : undefined}
            />
          ) : (
            <span className="pl-picker-spacer" />
          )}
          {showPicker("b") ? (
            <PlayerPicker
              label={b ? t("Change second player") : t("Choose the second player")}
              initialLeague={b?.league ?? defaultLeague("b")}
              exclude={a}
              accent="var(--series-2)"
              onPick={(k) => setSlot("b", k)}
              onCancel={editing === "b" ? () => setEditing(null) : undefined}
            />
          ) : (
            <span className="pl-picker-spacer" />
          )}
        </div>
      )}

      {series.length > 0 && (
        <div className="section">
          <Radar series={series} />
        </div>
      )}

      {both && pa.person && pb.person ? (
        <div className="section">
          <HeadToHead a={pa.person} b={pb.person} names={[pa.name, pb.name]} />
        </div>
      ) : both ? (
        <p className="glass pl-card pl-empty-line section">{t("Head-to-head numbers need both players to have league appearances this season.")}</p>
      ) : series.length === 1 ? (
        <p className="pl-hint-line section">{t("Pick a second player to see them head to head.")}</p>
      ) : null}
    </div>
  );
}

function VsSide({ p, k, slot, onChange, onClear }: { p: Profile; k: PlayerKey | null; slot: Slot; onChange: () => void; onClear: () => void }) {
  const [cutErr, setCutErr] = useState(false);
  const [photoErr, setPhotoErr] = useState(false);
  const cut = !cutErr ? tsdbSize(p.info?.cutout, "medium") : null;
  const photo = !cut && !photoErr ? tsdbSize(p.info?.photo, "medium") : null;
  const color = slot === "a" ? "var(--series-1)" : "var(--series-2)";

  if (!k) {
    return (
      <div className={`pl-vs-side is-empty ${slot}`}>
        <span className="pl-vs-ghost" aria-hidden>
          <IconPlus />
        </span>
        <span className="pl-vs-empty-text">{slot === "a" ? t("Choose the first player") : t("Choose the second player")}</span>
      </div>
    );
  }
  if (p.loading || (!p.name && !p.notFound)) {
    return (
      <div className={`pl-vs-side ${slot}`} aria-busy="true">
        <Skeleton h={220} r={28} style={{ width: "100%" }} />
      </div>
    );
  }
  if (!p.name) {
    return (
      <div className={`pl-vs-side is-empty ${slot}`}>
        <span className="pl-vs-empty-text">{t("Player not found")}</span>
        <button type="button" className="pl-btn" onClick={onChange}>
          {t("Choose another")}
        </button>
      </div>
    );
  }
  return (
    <div className={`pl-vs-side ${slot}`} style={{ ["--club" as string]: p.tint, ["--series" as string]: color }}>
      <div className="pl-vs-bg" aria-hidden />
      {p.jersey && (
        <span className="pl-vs-num" aria-hidden>
          {p.jersey}
        </span>
      )}
      <div className="pl-vs-media">
        {cut ? (
          <img className="pl-cutout" src={cut} alt="" onError={() => setCutErr(true)} />
        ) : photo ? (
          <img className="pl-portrait" src={photo} alt="" onError={() => setPhotoErr(true)} />
        ) : p.infoDone ? (
          <span className="pl-initials">{initials(p.name)}</span>
        ) : (
          <span className="pl-media-skel skel" />
        )}
      </div>
      <div className="pl-vs-info">
        <span className="pl-vs-key" aria-hidden />
        <Link to={playerHref(p.league, p.id)} className="pl-vs-name">
          {p.name}
        </Link>
        <span className="pl-vs-club">
          {p.team && <Crest src={p.team.logo} size={16} alt="" />}
          <span>{[p.team?.short || p.team?.name, LEAGUE_BY_SLUG[p.league]?.short].filter(Boolean).join(" · ")}</span>
        </span>
        {p.availKnown && p.avail.tone !== "ok" && <AvailBadge a={p.avail} size="sm" />}
        <span className="pl-vs-actions">
          <button type="button" className="pl-chip-btn" onClick={onChange}>
            {t("Change")}
          </button>
          <button type="button" className="pl-chip-btn" onClick={onClear} aria-label={t("Remove {name}", { name: p.name })}>
            {t("Remove")}
          </button>
        </span>
      </div>
    </div>
  );
}
