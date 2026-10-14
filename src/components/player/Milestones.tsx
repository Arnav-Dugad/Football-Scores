import { Link } from "react-router-dom";
import { t } from "../../i18n";
import { fmtDate } from "../../lib/format";
import { IconChevronRight } from "../Icons";
import type { Milestone } from "./data";
import { MedalGlyph } from "./icons";

/* Season achievements as medal-style badges (gold / silver / bronze discs). */

const TIER_LABEL = { gold: "Gold", silver: "Silver", bronze: "Bronze" } as const;

function detailText(m: Milestone): string {
  const date = m.date && !Number.isNaN(Date.parse(m.date)) ? fmtDate(m.date) : "";
  return t(m.detail, { ...(m.detailVars ?? {}), date }).replace(/^\s*·\s*|\s*·\s*$/g, "");
}

export function Milestones({ items, building }: { items: Milestone[]; building: boolean }) {
  return (
    <section className="glass pl-card pl-milestones" aria-labelledby="pl-ms-title">
      <header className="pl-card-head">
        <div className="pl-card-titles">
          <h2 className="panel-title" id="pl-ms-title">
            {t("Milestones")}
          </h2>
          <p className="pl-card-sub">{t("Earned in league play this season")}</p>
        </div>
      </header>
      {items.length ? (
        <ul className="pl-medals">
          {items.map((m, i) => {
            const title = t(m.title, m.titleVars);
            const detail = detailText(m);
            const body = (
              <>
                <span className={`pl-medal ${m.tier}`} aria-hidden>
                  <span className={`pl-medal-face${m.face ? " numeral" : ""}`}>{m.face ? m.face : <MedalGlyph icon={m.icon} />}</span>
                </span>
                <span className="pl-medal-text">
                  <b>{title}</b>
                  {detail && <span>{detail}</span>}
                </span>
                {m.href && <IconChevronRight className="chev" />}
                <span className="sr-only">{t(TIER_LABEL[m.tier])}</span>
              </>
            );
            return (
              <li key={m.key} style={{ animationDelay: `${i * 60}ms` }}>
                {m.href ? (
                  <Link to={m.href} className="pl-medal-row is-link">
                    {body}
                  </Link>
                ) : (
                  <div className="pl-medal-row">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pl-empty-line">
          {building ? t("Milestones appear as this season’s matches are processed.") : t("No milestones yet this season.")}
        </p>
      )}
    </section>
  );
}
