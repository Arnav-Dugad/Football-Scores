import { localeTag } from "./settings";

/** ISO 3166-1 alpha-2 codes (sovereign states + common territories). */
export const COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AR AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CW CY CZ " +
  "DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FO FR GA GB GD GE GH GI GL GM GN GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT " +
  "JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ " +
  "NA NC NE NG NI NL NO NP NR NZ OM PA PE PF PG PH PK PL PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ " +
  "TC TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WS XK YE ZA ZM ZW"
).split(" ");

let names: Intl.DisplayNames | null = null;
let namesLocale = "";

export function countryName(code: string): string {
  const loc = localeTag();
  if (!names || namesLocale !== loc) {
    try {
      names = new Intl.DisplayNames([loc, "en"], { type: "region" });
      namesLocale = loc;
    } catch {
      names = null;
    }
  }
  try {
    return names?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Flag image (flagcdn.com, PNG). `w` is the CSS width; a 2× source is used for sharpness. */
export function flagUrl(code: string, w: 20 | 40 | 80 = 40): string {
  return `https://flagcdn.com/w${w * 2 > 160 ? 160 : w * 2}/${code.toLowerCase()}.png`;
}

export function sortedCountries(): { code: string; name: string }[] {
  const loc = localeTag();
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name, loc));
}

/** Best guess from the browser locale, e.g. en-GB → GB. */
export function guessCountry(): string | null {
  for (const l of navigator.languages ?? [navigator.language]) {
    const m = /-([A-Z]{2})$/i.exec(l);
    if (m && COUNTRY_CODES.includes(m[1].toUpperCase())) return m[1].toUpperCase();
  }
  return null;
}
