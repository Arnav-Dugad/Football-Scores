/* Accent-insensitive fuzzy matching for global search. */

const SPECIAL: Record<string, string> = { ø: "o", æ: "ae", œ: "oe", ß: "ss", ł: "l", đ: "d", ð: "d", ı: "i", þ: "th", ħ: "h" };

/** Lower-case, strip diacritics and punctuation, collapse spaces. */
export function fold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[øæœßłđðıþħ]/g, (c) => SPECIAL[c] ?? c)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function initials(words: string[]): string {
  return words.map((w) => w[0] ?? "").join("");
}

/** Levenshtein distance capped at 2 (enough for one-typo tolerance). */
function within1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else if (a[i + 1] === b[j] && a[i] === b[j + 1]) {
      // transposition
      i += 2;
      j += 2;
    } else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function subsequenceSpan(q: string, key: string): number {
  let k = 0;
  let start = -1;
  for (let i = 0; i < key.length && k < q.length; i++) {
    if (key[i] === q[k]) {
      if (start < 0) start = i;
      k++;
      if (k === q.length) return i - start + 1;
    }
  }
  return -1;
}

export interface Prepared {
  key: string;
  words: string[];
  acronym: string;
}

export function prepare(s: string): Prepared {
  const key = fold(s);
  const words = key.split(" ").filter(Boolean);
  return { key, words, acronym: initials(words) };
}

/**
 * Score a folded query against prepared keys (higher is better, 0 = no match).
 * Exact > prefix > word prefix > all tokens > acronym > substring > typo > subsequence.
 */
export function score(q: string, tokens: string[], keys: Prepared[]): number {
  let best = 0;
  for (const p of keys) {
    const k = p.key;
    if (!k) continue;
    let s = 0;
    if (k === q) s = 1000;
    else if (k.startsWith(q)) s = 900 - Math.min(80, k.length - q.length);
    else if (p.words.some((w) => w.startsWith(q))) s = 760 - Math.min(60, k.length - q.length) / 2;
    else if (tokens.length > 1 && tokens.every((tk) => p.words.some((w) => w.startsWith(tk)))) s = 720;
    else if (q.length >= 2 && !q.includes(" ") && p.acronym.startsWith(q) && p.words.length > 1) s = 640;
    else {
      const at = k.indexOf(q);
      if (at >= 0 && q.length >= 2) s = 520 - Math.min(100, at * 4);
      else if (q.length >= 5 && p.words.some((w) => within1(q, w) || (w.length > q.length && within1(q, w.slice(0, q.length))))) s = 360;
      else if (q.length >= 3) {
        const span = subsequenceSpan(q, k);
        if (span > 0 && span <= q.length * 2.6) s = 200 + Math.round((q.length / span) * 100);
      }
    }
    if (s > best) best = s;
  }
  return best;
}
