import { t } from "../../i18n";
import { fmtNum } from "../../lib/format";
import { LEAGUE_BY_SLUG } from "../../lib/leagues";
import { IconTrophy } from "../Icons";
import { LeagueBadge } from "../ui";
import type { Overview } from "./data";

/* Per-competition season breakdown from ESPN's athlete overview. */

export function CompTable({ ov, league }: { ov: Overview; league: string }) {
  const rows = [...ov.comps].sort((a, b) => Number(b.slug === league) - Number(a.slug === league));
  return (
    <section className="glass pl-card" aria-labelledby="pl-comp-title">
      <header className="pl-card-head">
        <div className="pl-card-titles">
          <h2 className="panel-title" id="pl-comp-title">
            {t("By competition")}
          </h2>
          <p className="pl-card-sub">{t("Club and international, this season")}</p>
        </div>
      </header>
      {rows.length && ov.cols.length ? (
        <div className="pl-scroll" tabIndex={0} role="region" aria-labelledby="pl-comp-title">
          <table className="pl-table">
            <thead>
              <tr>
                <th scope="col">{t("Competition")}</th>
                {ov.cols.map((c) => (
                  <th scope="col" key={c.name}>
                    <abbr title={t(c.label)}>{t(c.short)}</abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.full}-${i}`} className={r.slug === league ? "hl" : undefined}>
                  <th scope="row" title={r.full}>
                    <span className="pl-comp">
                      {r.slug && LEAGUE_BY_SLUG[r.slug] ? (
                        <LeagueBadge slug={r.slug} size={26} />
                      ) : (
                        <span className="pl-comp-ic" aria-hidden>
                          <IconTrophy />
                        </span>
                      )}
                      <span className="pl-comp-name">{r.name}</span>
                    </span>
                  </th>
                  {ov.cols.map((c) => {
                    const v = r.stats[c.name];
                    return (
                      <td key={c.name} className="num">
                        {v == null ? "–" : fmtNum(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="pl-empty-line">{t("No competition stats yet this season.")}</p>
      )}
    </section>
  );
}
