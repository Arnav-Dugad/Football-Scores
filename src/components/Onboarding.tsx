import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { changeLanguage, t } from "../i18n";
import { endpoints, getJSON } from "../lib/api";
import { COUNTRY_CODES, guessCountry } from "../lib/countries";
import { toggleFollow, updateSettings, useSettings } from "../lib/settings";
import { IconBrand, IconChevronLeft } from "./Icons";
import { ClubPicker, CountryList, LanguageList } from "./prefs";

/**
 * First-run welcome: country (for where-to-watch), language, favourite clubs.
 * Every step can be skipped; choices live in Settings afterwards.
 */

const STEPS = ["welcome", "country", "language", "clubs"] as const;
type Step = (typeof STEPS)[number];

export function Onboarding() {
  const [s, set] = useSettings();
  const [step, setStep] = useState<Step>("welcome");
  const [dir, setDir] = useState<1 | -1>(1);
  const dialog = useRef<HTMLDivElement>(null);

  // Default the country from the edge (Cloudflare geo) or the browser locale.
  useEffect(() => {
    if (s.country) return;
    let cancelled = false;
    getJSON<{ country: string | null }>(endpoints.geo())
      .then((g) => {
        const c = g.country && COUNTRY_CODES.includes(g.country) ? g.country : guessCountry();
        if (!cancelled && c) set({ country: c });
      })
      .catch(() => {
        const c = guessCountry();
        if (!cancelled && c) set({ country: c });
      });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const i = STEPS.indexOf(step);
  const go = (n: number) => {
    setDir(n > i ? 1 : -1);
    if (n >= STEPS.length) finish();
    else setStep(STEPS[n]);
  };
  const finish = () => updateSettings({ onboarded: true });

  return createPortal(
    <div className="onboard-backdrop">
      <div
        className="onboard glass-strong"
        role="dialog"
        aria-modal="true"
        aria-label={t("Welcome to Pitch")}
        ref={dialog}
        tabIndex={-1}
        onKeyDown={(e) => e.key === "Escape" && finish()}
      >
        <div className="onboard-top">
          {i > 0 ? (
            <button type="button" className="back" onClick={() => go(i - 1)}>
              <IconChevronLeft />
              {t("Back")}
            </button>
          ) : (
            <span />
          )}
          <div className="dots" aria-hidden>
            {STEPS.map((x, n) => (
              <span key={x} className={n === i ? "on" : n < i ? "done" : ""} />
            ))}
          </div>
          <button type="button" className="text-btn" onClick={finish}>
            {t("Skip")}
          </button>
        </div>

        <div className={`onboard-body ${dir > 0 ? "fwd" : "bwd"}`} key={step}>
          {step === "welcome" && (
            <div className="onboard-hero">
              <div className="onboard-mark">
                <IconBrand />
              </div>
              <h1>{t("Football, beautifully.")}</h1>
              <p>{t("Live scores, lineups, deep analytics and where to watch — for the competitions you love.")}</p>
            </div>
          )}
          {step === "country" && (
            <>
              <h2 className="onboard-title">{t("Where are you watching from?")}</h2>
              <p className="onboard-sub">{t("We’ll show the broadcasters and streaming services available in your country.")}</p>
              <CountryList value={s.country} onPick={(country) => set({ country })} />
            </>
          )}
          {step === "language" && (
            <>
              <h2 className="onboard-title">{t("Choose your language")}</h2>
              <LanguageList value={s.lang} onPick={(l) => void changeLanguage(l)} />
            </>
          )}
          {step === "clubs" && (
            <>
              <h2 className="onboard-title">{t("Pick your clubs")}</h2>
              <p className="onboard-sub">{t("Their matches appear first, with goal alerts while Pitch is open.")}</p>
              <ClubPicker selected={s.teams} onToggle={(tm) => toggleFollow(tm)} />
            </>
          )}
        </div>

        <div className="onboard-foot">
          <button type="button" className="btn wide" onClick={() => go(i + 1)}>
            {step === "welcome"
              ? t("Get started")
              : step === "clubs"
                ? s.teams.length
                  ? t("Follow {n} and finish", { n: s.teams.length })
                  : t("Finish")
                : t("Continue")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
