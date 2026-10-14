/** ESPN occasionally double-encodes UTF-8 ("AraÃºjo"). Repair when detectable. */
export function fixText(s: string | undefined | null): string {
  if (!s) return "";
  if (!/[ÃÂÅÄ][\u0080-ÿ]/.test(s)) return s;
  try {
    const bytes = Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 0xff));
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return s;
  }
}

/** Accent-insensitive, punctuation-free key for fuzzy name matching. */
export function nameKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
