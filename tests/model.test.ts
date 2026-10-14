import { normalizeOpen } from "../shared/normalize";
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { deriveStandings, type LeagueId } from "../shared/model";
import { handleApi } from "../server/handler";
import { cached } from "../server/cache";
import { FootballData } from "../server/providers";
afterEach(() => vi.unstubAllGlobals());
describe("actual OpenFootball snapshots", () => {
  for (const file of readdirSync("public/data"))
    it(`normalizes ${file} without inventing records`, () => {
      const raw = JSON.parse(readFileSync(`public/data/${file}`, "utf8"));
      const league = file.slice(8, -5) as LeagueId;
      const season = file.slice(0, 7);
      const data = normalizeOpen(raw, league, season);
      expect(data.matches).toHaveLength(raw.matches.length);
      expect(new Set(data.matches.map((m) => m.id)).size).toBe(
        data.matches.length,
      );
      const finished = data.matches.filter((m) => m.status === "finished");
      expect(data.standings.reduce((s, r) => s + r.played, 0)).toBe(
        finished.length * 2,
      );
      expect(data.standings.reduce((s, r) => s + r.gf, 0)).toBe(
        data.standings.reduce((s, r) => s + r.ga, 0),
      );
      expect(data.meta.mode).toBe("community");
      expect(data.matches.every((m) => m.kickoff === null)).toBe(true);
      expect(data.meta.officialStandings).toBe(false);
    });
  it("preserves published Arsenal–Coventry opening result", () => {
    const raw = JSON.parse(
      readFileSync("public/data/2026-27-en.1.json", "utf8"),
    );
    const d = normalizeOpen(raw, "en.1", "2026-27");
    const m = d.matches.find(
      (m) => m.date === "2026-08-21" && m.home.name === "Arsenal FC",
    );
    expect(m?.score).toEqual([3, 0]);
    expect(m?.half).toEqual([2, 0]);
  });
  it("keeps missing past scores unconfirmed", () => {
    const d = normalizeOpen(
      {
        name: "test",
        matches: [{ date: "2020-01-01", team1: "A", team2: "B" }],
      },
      "en.1",
      "2024-25",
    );
    expect(d.matches[0].status).toBe("unconfirmed");
    expect(d.matches[0].score).toBeNull();
    expect(deriveStandings(d.matches)[0].played).toBe(0);
  });
  it("rejects malformed and negative scores", () => {
    expect(() =>
      normalizeOpen(
        {
          name: "invalid",
          matches: [
            { date: "2020-01-01", team1: "A", team2: "B", score: [-1, 2] },
          ],
        },
        "en.1",
        "2024-25",
      ),
    ).toThrow();
  });
});
describe("API boundary", () => {
  it("validates paths, methods and provider parameters", async () => {
    for (const [path, status, method] of [
      ["/api/data?league=../../secret", 400, "GET"],
      ["/api/data?season=2099-00", 400, "GET"],
      ["/api/unknown", 404, "GET"],
      ["/api/data", 405, "POST"],
      ["/api/players?q=a", 400, "GET"],
      ["/api/players?q=%3Cscript%3E", 400, "GET"],
    ] as const) {
      const r = await handleApi(
        new Request("https://test.local" + path, { method }),
      );
      expect(r.status).toBe(status);
      expect(r.headers.get("Cache-Control")).toBe("no-store");
    }
  });
  it("reports missing credentials truthfully", async () => {
    const r = await handleApi(new Request("https://test.local/api/status"));
    expect((await r.json()).footballData).toBe("Not configured");
  });
  it("deduplicates simultaneous upstream work", async () => {
    let calls = 0;
    const run = async () => {
      calls++;
      return { ok: true };
    };
    const [a, b] = await Promise.all([
      cached("dedup-test", 10, run),
      cached("dedup-test", 10, run),
    ]);
    expect(calls).toBe(1);
    expect(a).toEqual(b);
  });
  it("does not leak provider credentials or raw errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("SECRET_SAMPLE")),
    );
    const r = await handleApi(
      new Request("https://test.local/api/data?league=fr.1&season=2024-25"),
    );
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("SECRET_SAMPLE");
  });
  it("normalizes optional delayed feed contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.includes("redis.test")) {
          const command = JSON.parse(init.body as string);
          return Response.json({ result: command[0] === "GET" ? null : 1 });
        }
        return Response.json({
          matches: [
            {
              id: 1,
              utcDate: "2026-08-21T19:00:00Z",
              status: "FINISHED",
              homeTeam: { name: "Arsenal FC" },
              awayTeam: { name: "Coventry City FC" },
              score: {
                fullTime: { home: 3, away: 0 },
                halfTime: { home: 2, away: 0 },
              },
              matchday: 1,
            },
          ],
        });
      }),
    );
    const d = await new FootballData({
      FOOTBALL_DATA_TOKEN: "test-key",
      UPSTASH_REDIS_REST_URL: "https://redis.test",
      UPSTASH_REDIS_REST_TOKEN: "test",
    }).load("en.1", "2026-27");
    expect(d.meta.mode).toBe("delayed");
    expect(d.matches[0].kickoff).toBe("2026-08-21T19:00:00Z");
    expect(d.matches[0].score).toEqual([3, 0]);
  });
});
describe("verified TheSportsDB v1 contract", () => {
  it("handles the singular player response property", async () => {
    const raw = JSON.parse(
      readFileSync("tests/fixtures/player-lookup.json", "utf8"),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(raw)));
    const r = await handleApi(
      new Request("https://test.local/api/players?q=Lionel%20Messi"),
    );
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.players[0].name).toBe("Lionel Messi");
    expect(d.players[0].team).toBe("Inter Miami");
    expect(d.players[0].id).toBe("34146370");
  });
});
