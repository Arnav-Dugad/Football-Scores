import type { CSSProperties } from "react";
import { t } from "../i18n";

/**
 * Content-shaped loading placeholders. Each piece mirrors the geometry of the
 * real component (same paddings, rows and radii) so nothing jumps when data
 * lands. A single shimmer sweeps each bone (transform-only, reduced-motion
 * aware via the global `.skel` rules).
 */

export function Bone({ w = "100%", h = 12, r = 6, style }: { w?: number | string; h?: number; r?: number; style?: CSSProperties }) {
  return <span className="skel ix-bone" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

export function Dot({ size = 30, style }: { size?: number; style?: CSSProperties }) {
  return <span className="skel ix-bone" style={{ width: size, height: size, borderRadius: "50%", flex: "none", ...style }} />;
}

/** Wrapper announcing a loading region once to assistive tech. */
export function Loading({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="ix-loading">
      <span className="sr-only">{label ?? t("Loading…")}</span>
      <div aria-hidden>{children}</div>
    </div>
  );
}

const NAME_WIDTHS = ["58%", "44%", "66%", "50%", "62%", "40%", "54%", "70%"];

/** Mirrors `.match-card`: two team rows (crest · name · score) + footer. */
export function MatchCardSkeleton({ i = 0 }: { i?: number }) {
  return (
    <div className="match-card glass ix-skel-card" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
      <div className="mc-body">
        {[0, 1].map((r) => (
          <div className="mc-team" key={r}>
            <Dot size={30} />
            <Bone w={NAME_WIDTHS[(i * 2 + r) % NAME_WIDTHS.length]} h={14} />
          </div>
        ))}
        <div className="mc-scores">
          <Bone w={16} h={20} r={5} />
          <Bone w={16} h={20} r={5} />
        </div>
      </div>
      <div className="mc-foot">
        <Bone w={64} h={12} />
        <Bone w={110} h={12} />
      </div>
    </div>
  );
}

export function MatchGridSkeleton({ n = 6, offset = 0 }: { n?: number; offset?: number }) {
  return (
    <div className="match-grid">
      {Array.from({ length: n }, (_, i) => (
        <MatchCardSkeleton key={i} i={i + offset} />
      ))}
    </div>
  );
}

/** Mirrors `.league-head` + a grid of cards. */
export function LeagueGroupSkeleton({ n = 4, offset = 0 }: { n?: number; offset?: number }) {
  return (
    <section className="league-group">
      <div className="league-head">
        <Bone w={36} h={36} r={11} />
        <div style={{ display: "grid", gap: 7, flex: 1 }}>
          <Bone w={150} h={16} />
          <Bone w={110} h={11} />
        </div>
      </div>
      <MatchGridSkeleton n={n} offset={offset} />
    </section>
  );
}

/** Mirrors `.hero`: league + status row, crests either side of the score, meta line. */
export function HeroSkeleton() {
  return (
    <div className="hero glass ix-skel-hero">
      <div className="hero-top">
        <span className="league">
          <Bone w={26} h={26} r={8} />
          <Bone w={150} h={12} />
        </span>
        <Bone w={78} h={26} r={13} />
      </div>
      <div className="hero-body">
        {[0, 1].map((i) => (
          <div className="hero-team" key={i} style={{ order: i * 2 }}>
            <Dot size={88} style={{ width: "clamp(56px, 12vw, 96px)", height: "clamp(56px, 12vw, 96px)" }} />
            <Bone w="70%" h={16} style={{ maxWidth: 140 }} />
          </div>
        ))}
        <div className="hero-score" style={{ order: 1 }}>
          <Bone w="clamp(96px, 20vw, 170px)" h={64} r={18} />
        </div>
      </div>
      <div className="hero-meta">
        <Bone w={150} h={12} />
        <Bone w={120} h={12} />
      </div>
    </div>
  );
}

/** Full Scores page body: hero + two league groups. */
export function ScoresSkeleton() {
  return (
    <Loading label={t("Loading matches…")}>
      <HeroSkeleton />
      <LeagueGroupSkeleton n={4} />
      <LeagueGroupSkeleton n={2} offset={4} />
    </Loading>
  );
}

/** Mirrors `.news-feature` (photo with headline over a gradient). */
export function NewsFeatureSkeleton() {
  return (
    <div className="news-feature ix-skel-feature">
      <div className="body">
        <Bone w={120} h={24} r={12} />
        <Bone w="88%" h={30} r={8} style={{ marginTop: 14 }} />
        <Bone w="62%" h={30} r={8} style={{ marginTop: 8 }} />
        <Bone w="74%" h={14} style={{ marginTop: 14 }} />
      </div>
    </div>
  );
}

/** Mirrors `.news-card` (16:9 image + headline + dek + time). */
export function NewsCardSkeleton({ i = 0 }: { i?: number }) {
  return (
    <div className="news-card glass ix-skel-card" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
      <div className="img skel" style={{ borderRadius: 0 }} />
      <div className="body">
        <Bone w="92%" h={16} />
        <Bone w="70%" h={16} />
        <Bone w="100%" h={11} style={{ marginTop: 6 }} />
        <Bone w="84%" h={11} />
        <Bone w={64} h={10} style={{ marginTop: 10 }} />
      </div>
    </div>
  );
}

export function NewsGridSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div className="news-grid">
      {Array.from({ length: n }, (_, i) => (
        <NewsCardSkeleton key={i} i={i} />
      ))}
    </div>
  );
}

/** Horizontal rail of news cards (Scores → Top stories). */
export function NewsRailSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="rail" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <NewsCardSkeleton key={i} i={i} />
      ))}
    </div>
  );
}

export function NewsPageSkeleton() {
  return (
    <Loading label={t("Loading stories…")}>
      <NewsFeatureSkeleton />
      <div style={{ marginTop: 16 }}>
        <NewsGridSkeleton n={6} />
      </div>
    </Loading>
  );
}

/** Generic list rows (search results, fixtures). */
export function RowSkeleton({ n = 3, avatar = 32 }: { n?: number; avatar?: number }) {
  return (
    <div className="ix-row-skel" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="ix-row-skel-item">
          <Dot size={avatar} />
          <div style={{ display: "grid", gap: 6, flex: 1 }}>
            <Bone w={NAME_WIDTHS[i % NAME_WIDTHS.length]} h={13} />
            <Bone w="30%" h={10} />
          </div>
        </div>
      ))}
    </div>
  );
}
