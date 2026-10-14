import { mkdir, writeFile } from "node:fs/promises";
const leagues = ["en.1", "es.1", "de.1", "it.1", "fr.1"];
const seasons = ["2026-27", "2025-26", "2024-25"];
await mkdir("public/data", { recursive: true });
const reports = [];
await Promise.all(
  leagues.flatMap((league) =>
    seasons.map(async (season) => {
      const url = `https://raw.githubusercontent.com/openfootball/football.json/master/${season}/${league}.json`;
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!Array.isArray(data.matches) || !data.matches.length)
          throw new Error("No matches");
        const saved = {
          ...data,
          provenance: {
            source: "OpenFootball",
            url,
            retrievedAt: new Date().toISOString(),
            license: "Public domain",
          },
        };
        await writeFile(
          `public/data/${season}-${league}.json`,
          JSON.stringify(saved),
        );
        reports.push({ league, season, matches: data.matches.length });
      } catch (e) {
        console.error(`${league} ${season}: ${e.message}`);
        process.exitCode = 1;
      }
    }),
  ),
);
console.log(reports);
