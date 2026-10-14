import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { normalizeOpen } from "../../shared/normalize";
const raw = JSON.parse(readFileSync("public/data/2026-27-en.1.json", "utf8"));
const dataset = normalizeOpen(
  raw,
  "en.1",
  "2026-27",
  raw.provenance.retrievedAt,
);
const first = dataset.matches.find((m) => m.status === "finished")!;
// Browser tests use an actual checked-in source snapshot, never generated football values.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/data?*", (route) =>
    route.fulfill({ json: dataset }),
  );
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        openfootball: "Community results, no live feed",
        footballData: "Not configured",
      },
    }),
  );
});
const routes = [
  "/",
  "/scores",
  "/competition",
  "/standings",
  `/team/${first.home.id}`,
  `/match/${first.id}`,
  "/analytics",
  "/favorites",
  "/player/unknown",
  "/about",
];
for (const width of [320, 375, 390, 430, 768, 1024, 1440])
  test(`all core pages: ${width}px, both themes, no overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const theme of ["dark", "light"]) {
      await page.addInitScript(
        (t) => localStorage.setItem("fs-theme", t),
        theme,
      );
      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator("h1")).toBeVisible();
        await expect(page.locator(".skeleton")).toHaveCount(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${route}, ${width}, ${theme}`,
        ).toBe(true);
      }
    }
    expect(errors).toEqual([]);
  });
test("date navigation, filtering, nested match and H2H", async ({ page }) => {
  await page.goto("/scores");
  await page
    .getByRole("button", { name: "Latest results", exact: true })
    .click();
  await expect(page.locator(".match-card").first()).toBeVisible();
  await page.getByRole("button", { name: "In play", exact: true }).click();
  await expect(
    page.getByText("This source has no live coverage."),
  ).toBeVisible();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.locator(".match-link").first().click();
  await expect(page.locator(".big-score")).toBeVisible();
  await page.getByRole("tab", { name: "Head to head" }).click();
  await expect(page.getByText("Their other meetings")).toBeVisible();
  await page.reload();
  await expect(page.locator(".big-score")).toBeVisible();
});
test("favourites persist and global search navigates", async ({ page }) => {
  await page.goto(`/team/${first.home.id}`);
  await page
    .getByRole("button", { name: `Save ${first.home.name}`, exact: true })
    .click();
  await page.goto("/favorites");
  await expect(page.locator(".club-card h3")).toContainText("Arsenal");
  await page.reload();
  await expect(page.locator(".club-card h3")).toContainText("Arsenal");
  await page.getByRole("button", { name: "Open search" }).click();
  await page.getByRole("textbox", { name: "Global search" }).fill("Arsenal");
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Arsenal", exact: true })
    .click();
  await expect(page.locator("h1")).toContainText("Arsenal");
  await page
    .getByRole("button", { name: `Unsave ${first.home.name}`, exact: true })
    .click();
  await page.goto("/favorites");
  await expect(page.getByText("Make yourself at home")).toBeVisible();
});
test("mobile navigation and search dialog focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Analytics" })
    .click();
  await expect(page.locator("h1")).toHaveText("Analytics studio");
  await page.getByRole("button", { name: "Open search" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Open search" })).toBeFocused();
});
test("comparison, sorting and competition tabs work", async ({ page }) => {
  await page.goto("/analytics");
  await page
    .getByRole("combobox", { name: "Comparison venue" })
    .selectOption("home");
  await expect(page.locator(".compare-row")).toHaveCount(5);
  await page.goto("/standings");
  await page
    .getByRole("combobox", { name: "Sort standings" })
    .selectOption("gf");
  await page.goto("/competition");
  await page.getByRole("tab", { name: "clubs", exact: true }).click();
  await expect(page.locator(".club-card")).toHaveCount(
    dataset.standings.length,
  );
  await page.getByRole("tab", { name: "fixtures", exact: true }).click();
  await expect(page.locator(".match-card").first()).toBeVisible();
});
test("provider outage falls back honestly, then handles total failure", async ({
  page,
}) => {
  await page.unroute("**/api/data?*");
  await page.route("**/api/data?*", (route) =>
    route.fulfill({ status: 503, json: { error: "Provider unavailable" } }),
  );
  await page.goto("/");
  await expect(
    page.getByText("Saved snapshot · provider unavailable"),
  ).toBeVisible();
  await page.route("**/data/*.json", (route) => route.fulfill({ status: 503 }));
  await page.reload();
  await expect(page.getByText("A little pause in play")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
for (const theme of ["dark", "light"])
  test(`accessible major pages: ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("fs-theme", t), theme);
    for (const route of [
      "/",
      "/scores",
      "/standings",
      "/analytics",
      "/competition",
      `/match/${first.id}`,
    ]) {
      await page.goto(route);
      await expect(page.locator(".skeleton")).toHaveCount(0);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        route,
      ).toEqual([]);
    }
  });
test("capture design review screenshots", async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const theme of ["dark", "light"]) {
      await page.addInitScript(
        (t) => localStorage.setItem("fs-theme", t),
        theme,
      );
      for (const route of ["/", "/analytics", "/scores"]) {
        await page.goto(route);
        await expect(page.locator(".skeleton")).toHaveCount(0);
        await page.screenshot({
          path: `artifacts/${route === "/" ? "home" : route.slice(1)}-${width}-${theme}.png`,
          fullPage: true,
        });
      }
    }
  }
});
test("player lookup and profile use verified directory record", async ({
  page,
}) => {
  const raw = JSON.parse(
    readFileSync("tests/fixtures/player-lookup.json", "utf8"),
  ).player[0];
  await page.route("**/api/players?*", (route) =>
    route.fulfill({
      json: {
        players: [
          {
            id: raw.idPlayer,
            name: raw.strPlayer,
            team: raw.strTeam,
            nationality: raw.strNationality,
            position: raw.strPosition,
            born: raw.dateBorn,
            bio: null,
          },
        ],
        source: "TheSportsDB",
        notice: "Directory only",
        fetchedAt: new Date().toISOString(),
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Open search" }).click();
  await page.getByRole("button", { name: "Players", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Global search" })
    .fill("Lionel Messi");
  await page
    .getByRole("dialog")
    .getByRole("link", { name: /Lionel Messi/ })
    .click();
  await expect(page.locator("h1")).toHaveText("Lionel Messi");
  await expect(page.getByText("Statistics availability")).toBeVisible();
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Lionel Messi");
});
test("optional real upstream API verification", async ({ request }) => {
  test.skip(
    !process.env.LIVE_PROVIDER_CHECK,
    "Enable explicitly; makes three real provider requests.",
  );
  for (const path of [
    "/api/data?league=en.1&season=2026-27",
    "/api/data?league=de.1&season=2025-26",
    "/api/players?q=Lionel%20Messi",
  ]) {
    const response = await request.get(path, { timeout: 35000 });
    expect(response.status()).toBe(200);
    const value = await response.json();
    if (path.includes("/data")) {
      expect(value.matches.length).toBeGreaterThan(300);
      expect(value.meta.source).toBe("OpenFootball");
    } else {
      expect(value.players[0].name).toBe("Lionel Messi");
    }
    console.log(
      JSON.stringify({
        path,
        source: value.meta?.source ?? value.source,
        records: value.matches?.length ?? value.players.length,
        latestResult: value.meta?.latestResult,
      }),
    );
  }
});
