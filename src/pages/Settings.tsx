import { useState } from "react";
import { Link } from "react-router-dom";
import {
  IconClock,
  IconContrast,
  IconGlobe,
  IconInfo,
  IconLanguage,
  IconMoon,
  IconPattern,
  IconStar,
  IconTrash,
  IconTv,
  IconVibrate,
} from "../components/Icons";
import { ClubPicker, CountryList, Flag, Group, LanguageList, PrefRow, Toggle, countryLabel } from "../components/prefs";
import { Crest, Segmented, Sheet } from "../components/ui";
import { changeLanguage, t } from "../i18n";
import { useDocumentTitle, useTheme } from "../lib/hooks";
import { LEAGUES, leagueLogo } from "../lib/leagues";
import { LANGS, toggleFollow, toggleLeagueFollow, useSettings, type Clock } from "../lib/settings";
import { InstallCard } from "../platform/install";

type SheetKind = "country" | "language" | "clubs" | null;

export default function SettingsPage() {
  useDocumentTitle(t("Settings"));
  const [s, set] = useSettings();
  const { pref, setPref } = useTheme();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const lang = LANGS.find((l) => l.code === s.lang) ?? LANGS[0];

  return (
    <div className="page settings-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Pitch</p>
          <h1 className="large-title">{t("Settings")}</h1>
        </div>
      </div>

      <div className="settings-grid">
        <div>
          <Group title={t("Region")} footer={t("Used for where-to-watch listings. Kick-off times always follow your device’s time zone.")}>
            <PrefRow
              icon={<IconTv />}
              tint="#ff375f"
              label={t("Country")}
              detail={t("Where to watch")}
              onClick={() => setSheet("country")}
            >
              {s.country && <Flag code={s.country} />}
              <span className="value">{countryLabel(s.country)}</span>
            </PrefRow>
            <PrefRow icon={<IconLanguage />} tint="#5e5ce6" label={t("Language")} onClick={() => setSheet("language")}>
              <span className="value">{lang.name}</span>
            </PrefRow>
            <PrefRow icon={<IconClock />} tint="#ff9f0a" label={t("Time format")}>
              <Segmented<Clock>
                options={[
                  { value: "auto", label: t("Auto") },
                  { value: "12", label: "12h" },
                  { value: "24", label: "24h" },
                ]}
                value={s.clock}
                onChange={(clock) => set({ clock })}
              />
            </PrefRow>
          </Group>

          <Group title={t("Appearance")}>
            <PrefRow icon={<IconMoon />} tint="#1c1c1e" label={t("Theme")}>
              <Segmented
                options={[
                  { value: "system", label: t("Auto") },
                  { value: "light", label: t("Light") },
                  { value: "dark", label: t("Dark") },
                ]}
                value={pref}
                onChange={(v) => setPref(v)}
              />
            </PrefRow>
            <PrefRow icon={<IconContrast />} tint="#8e8e93" label={t("Increase contrast")} detail={t("Solid surfaces and stronger borders")}>
              <Toggle on={s.contrast === "more"} onChange={(v) => set({ contrast: v ? "more" : "auto" })} label={t("Increase contrast")} />
            </PrefRow>
            <PrefRow icon={<IconPattern />} tint="#30b0c7" label={t("Chart patterns")} detail={t("Adds textures so charts don’t rely on colour")}>
              <Toggle on={s.patterns} onChange={(v) => set({ patterns: v })} label={t("Chart patterns")} />
            </PrefRow>
            <PrefRow icon={<IconVibrate />} tint="#34c759" label={t("Haptics")} detail={t("A light tap on goals and actions")}>
              <Toggle on={s.haptics} onChange={(v) => set({ haptics: v })} label={t("Haptics")} />
            </PrefRow>
          </Group>
        </div>

        <div>
          <Group title={t("heading::Following")} footer={t("Followed clubs appear first on Scores and get goal alerts while Pitch is open.")}>
            {s.teams.map((tm) => (
              <PrefRow key={tm.id} icon={<Crest src={tm.logo} size={22} alt="" />} tint="#fff" label={<Link to={`/team/${tm.league}/${tm.id}`}>{tm.name}</Link>}>
                <button type="button" className="text-btn danger" onClick={() => toggleFollow(tm)}>
                  {t("Remove")}
                </button>
              </PrefRow>
            ))}
            <PrefRow icon={<IconStar />} tint="#ffcc00" label={s.teams.length ? t("Add clubs") : t("Choose your clubs")} onClick={() => setSheet("clubs")} />
          </Group>

          <Group title={t("Competitions")}>
            <div className="league-toggle-grid">
              {LEAGUES.map((l) => {
                const on = s.leagues.includes(l.slug);
                return (
                  <button type="button" key={l.slug} className={`chip${on ? " active" : ""}`} aria-pressed={on} onClick={() => toggleLeagueFollow(l.slug)}>
                    <span className="chip-logo">
                      <img src={leagueLogo(l.slug, false, 64)} alt="" loading="lazy" />
                    </span>
                    {t(l.short)}
                  </button>
                );
              })}
            </div>
          </Group>

          <InstallCard />

          <Group title={t("Data")}>
            <PrefRow
              icon={<IconGlobe />}
              tint="#0a84ff"
              label={t("Show welcome tour again")}
              onClick={() => {
                set({ onboarded: false });
                window.scrollTo({ top: 0 });
              }}
            />
            <PrefRow
              icon={<IconTrash />}
              tint="#ff3b30"
              label={t("Reset all settings")}
              onClick={() => {
                if (!window.confirm(t("Reset all settings and followed clubs on this device?"))) return;
                try {
                  localStorage.removeItem("pitch.settings");
                  localStorage.removeItem("pitch.theme");
                  localStorage.removeItem("pitch.filter");
                  localStorage.removeItem("pitch.league");
                } catch {
                  /* ignore */
                }
                location.reload();
              }}
            />
          </Group>

          <Group title={t("About")}>
            <PrefRow icon={<IconInfo />} tint="#8e8e93" label="Pitch" detail={t("Scores, events and stats from ESPN. Photos from TheSportsDB and Wikimedia Commons. Pitch xG is our own model based on shot location.")} />
          </Group>
        </div>
      </div>

      {sheet === "country" && (
        <Sheet label={t("Country")} onClose={() => setSheet(null)}>
          <div className="sheet-pad">
            <h2 className="sheet-title">{t("Your country")}</h2>
            <CountryList
              value={s.country}
              autoFocus
              onPick={(country) => {
                set({ country });
                setSheet(null);
              }}
            />
          </div>
        </Sheet>
      )}
      {sheet === "language" && (
        <Sheet label={t("Language")} onClose={() => setSheet(null)}>
          <div className="sheet-pad">
            <h2 className="sheet-title">{t("Language")}</h2>
            <LanguageList
              value={s.lang}
              onPick={(l) => {
                setSheet(null);
                void changeLanguage(l);
              }}
            />
          </div>
        </Sheet>
      )}
      {sheet === "clubs" && (
        <Sheet label={t("Choose your clubs")} onClose={() => setSheet(null)}>
          <div className="sheet-pad">
            <h2 className="sheet-title">{t("Choose your clubs")}</h2>
            <ClubPicker selected={s.teams} onToggle={(tm) => toggleFollow(tm)} />
            <button type="button" className="btn wide" onClick={() => setSheet(null)}>
              {t("Done")}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
