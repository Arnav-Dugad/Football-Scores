/* Famous derbies (ESPN team ids, verified against each league's team list). */

export interface Derby {
  league: string;
  a: string;
  b: string;
  name: string;
}

export const DERBIES: Derby[] = [
  { league: "eng.1", a: "359", b: "367", name: "North London derby" },
  { league: "eng.1", a: "360", b: "382", name: "Manchester derby" },
  { league: "eng.1", a: "364", b: "368", name: "Merseyside derby" },
  { league: "eng.1", a: "360", b: "364", name: "North West derby" },
  { league: "esp.1", a: "83", b: "86", name: "El Clásico" },
  { league: "esp.1", a: "86", b: "1068", name: "Madrid derby" },
  { league: "esp.1", a: "243", b: "244", name: "Seville derby" },
  { league: "ita.1", a: "103", b: "110", name: "Derby della Madonnina" },
  { league: "ita.1", a: "110", b: "111", name: "Derby d’Italia" },
  { league: "ita.1", a: "104", b: "112", name: "Derby della Capitale" },
  { league: "ger.1", a: "124", b: "132", name: "Der Klassiker" },
  { league: "ger.1", a: "124", b: "133", name: "Revierderby" },
  { league: "fra.1", a: "160", b: "176", name: "Le Classique" },
  { league: "fra.1", a: "167", b: "176", name: "Olympico" },
  { league: "ned.1", a: "139", b: "142", name: "De Klassieker" },
  { league: "ned.1", a: "139", b: "148", name: "De Topper" },
  { league: "por.1", a: "1929", b: "2250", name: "Lisbon derby" },
  { league: "por.1", a: "437", b: "1929", name: "O Clássico" },
  { league: "usa.1", a: "187", b: "18966", name: "El Tráfico" },
  { league: "mex.1", a: "220", b: "232", name: "Clásico Regio" },
  { league: "ksa.1", a: "817", b: "929", name: "Riyadh derby" },
];

export function derbyFor(a: string, b: string): Derby | null {
  return DERBIES.find((d) => (d.a === a && d.b === b) || (d.a === b && d.b === a)) ?? null;
}

export function derbiesOf(team: string): Derby[] {
  return DERBIES.filter((d) => d.a === team || d.b === team);
}

export const rivalryHref = (league: string, a: string, b: string) => `/rivalry/${league}/${a}/${b}`;
