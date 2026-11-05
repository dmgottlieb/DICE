/** End-to-end tests: the built app in a real browser, checked against the
 * solver run directly in Node (which is itself tested against GAMS). */
import { expect, test, type Page } from "@playwright/test";
import { DEFAULT, withParams } from "../src/lib/dice/params";
import { solveBaseline, solveOptimal } from "../src/lib/dice/solve";
import { baselineParams } from "../src/lib/ui/controls";
import { summarize } from "../src/lib/ui/summary";

const dollars = (v: number) => "$" + v.toFixed(1);

async function waitSolved(page: Page) {
  await expect(page.getByTestId("status")).toHaveText(/Solved in \d+ ms/, { timeout: 20_000 });
}

/** Set a range input and fire its input event. */
async function setSlider(page: Page, id: string, value: number) {
  await page.locator("#ctl-" + id).fill(String(value));
}

test("default run shows the GAMS results", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await waitSolved(page);
  const opt = summarize(solveOptimal(DEFAULT));
  const base = summarize(solveBaseline(DEFAULT));
  await expect(page.getByTestId("tile-scc")).toHaveText(dollars(opt.scc2015));
  await expect(page.getByTestId("tile-scc")).toHaveText("$17.7"); // GAMS: 17.73
  await expect(page.getByTestId("tile-peak-opt")).toHaveText(opt.peakTemp.toFixed(2) + " °C");
  await expect(page.getByTestId("tile-peak-base")).toHaveText(base.peakTemp.toFixed(2) + " °C");
  await expect(page.locator(".legend li")).toHaveText(["Optimal policy", "No new policy (baseline)"]);
  await expect(page.locator("path.line")).toHaveCount(12); // 6 charts x 2 series
  expect(errors).toEqual([]);
});

test("moving a slider re-solves, updates the URL, and reset restores defaults", async ({ page }) => {
  await page.goto("/");
  await waitSolved(page);
  await setSlider(page, "t2xco2", 4.5);
  await expect(page.getByTestId("value-t2xco2")).toHaveText("4.5");
  const expected = summarize(solveOptimal(withParams({ t2xco2: 4.5 })));
  await expect(page.getByTestId("tile-scc")).toHaveText(dollars(expected.scc2015));
  await expect(page.getByTestId("tile-peak-opt")).toHaveText(expected.peakTemp.toFixed(2) + " °C");
  expect(new URL(page.url()).searchParams.get("t2xco2")).toBe("4.5");
  // The DICE-default optimum appears as a reference series once something changed.
  await expect(page.locator(".legend li")).toHaveCount(3);
  await page.getByRole("button", { name: /Reset Climate sensitivity/ }).click();
  await expect(page.getByTestId("tile-scc")).toHaveText("$17.7");
  expect(new URL(page.url()).search).toBe("");
});

test("rapid slider movement ends on the result for the final position", async ({ page }) => {
  await page.goto("/");
  await waitSolved(page);
  for (const v of [3, 3.4, 3.8, 4.2, 2.1, 5.3, 1.8, 3.6]) await setSlider(page, "t2xco2", v);
  const expected = summarize(solveOptimal(withParams({ t2xco2: 3.6 })));
  await expect(page.getByTestId("tile-scc")).toHaveText(dollars(expected.scc2015));
  await waitSolved(page);
  await expect(page.getByTestId("tile-scc")).toHaveText(dollars(expected.scc2015));
});

test("settings load from the URL", async ({ page }) => {
  await page.goto("/?prstp=0.001&elasmu=1.01");
  await waitSolved(page);
  await expect(page.getByTestId("value-prstp")).toHaveText("0.1%");
  await expect(page.getByTestId("value-elasmu")).toHaveText("1.01");
  const stern = summarize(solveOptimal(withParams({ prstp: 0.001, elasmu: 1.01 })));
  await expect(page.getByTestId("tile-scc")).toHaveText(dollars(stern.scc2015));
});

test("damage control maps onto the damage coefficient", async ({ page }) => {
  await page.goto("/");
  await waitSolved(page);
  await setSlider(page, "damage3", 4.806);
  const p = withParams({ a2: 2 * DEFAULT.a2 });
  await expect(page.getByTestId("tile-scc")).toHaveText(dollars(summarize(solveOptimal(p)).scc2015));
});

test("temperature cap: binding, and infeasible", async ({ page }) => {
  await page.goto("/");
  await waitSolved(page);
  await page.getByTestId("cap-toggle").check();
  await expect(page.getByTestId("value-cap")).toHaveText("2.00 °C");
  await expect(page.getByTestId("tile-peak-opt")).toHaveText("2.00 °C");
  // The baseline ignores the cap.
  const base = summarize(solveBaseline(baselineParams(withParams({ tatm_up: 2 }))));
  await expect(page.getByTestId("tile-peak-base")).toHaveText(base.peakTemp.toFixed(2) + " °C");
  await page.locator("#ctl-cap").fill("1.2");
  await expect(page.getByTestId("cap-warning")).toBeVisible();
  await page.getByTestId("cap-toggle").uncheck();
  await expect(page.getByTestId("cap-warning")).toHaveCount(0);
  await expect(page.getByTestId("tile-scc")).toHaveText("$17.7");
});

test("extreme damages: the baseline breaks down, the optimum is still shown", async ({ page }) => {
  await page.goto("/?a2=0.05&a3=4");
  await waitSolved(page);
  await expect(page.getByTestId("baseline-warning")).toBeVisible();
  await expect(page.getByTestId("tile-peak-base")).toHaveText("–");
  await expect(page.locator(".legend li.missing")).toHaveText(/no solution/);
});

test("data table and horizon", async ({ page }) => {
  await page.goto("/");
  await waitSolved(page);
  await page.getByTestId("table-toggle").click();
  const rows = page.locator("table tbody tr");
  await expect(rows).toHaveCount(39); // 2010..2200 in 5-year steps
  await expect(rows.first()).toContainText("2010");
  await expect(rows.first().locator("td").first()).toHaveText("0.80");
  await page.getByTestId("horizon").selectOption("2100");
  await expect(rows).toHaveCount(19);
  await page.getByTestId("table-variable").selectOption("SCC");
  const opt = solveOptimal(DEFAULT);
  await expect(rows.nth(1).locator("td").first()).toHaveText(dollars(opt.scc[1]));
});

test("chart hover and keyboard show a tooltip for every series", async ({ page }) => {
  await page.goto("/");
  await waitSolved(page);
  const chart = page.locator("svg[role=img]").first();
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const tip = page.locator(".tooltip");
  await expect(tip).toHaveCount(1);
  await expect(tip.locator(".trow")).toHaveCount(2);
  await page.mouse.move(0, 0);
  await expect(tip).toHaveCount(0);
  await chart.focus();
  await page.keyboard.press("ArrowRight");
  await expect(tip.locator(".year")).toHaveText("2010");
  await page.keyboard.press("ArrowRight");
  await expect(tip.locator(".year")).toHaveText("2015");
  await expect(tip.locator(".trow").first()).toContainText(solveOptimal(DEFAULT).path.TATM[1].toFixed(2));
});

test("CSV download", async ({ page }) => {
  await page.goto("/");
  await waitSolved(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
  const text = await (await import("node:fs/promises")).readFile((await download.path())!, "utf8");
  const lines = text.trim().split("\n");
  expect(lines[0]).toMatch(/^series,year,TATM/);
  expect(lines.length).toBe(1 + 2 * 60);
});

test("mobile: no horizontal scrolling, results before settings", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  await page.goto("/");
  await waitSolved(page);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw).toBeLessThanOrEqual(375);
  const tiles = await page.getByTestId("tile-scc").boundingBox();
  const aside = await page.locator("aside").boundingBox();
  expect(tiles!.y).toBeLessThan(aside!.y);
});

test("theme toggle switches to dark", async ({ page }) => {
  await page.goto("/");
  await waitSolved(page);
  await page.getByRole("button", { name: "Color theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(13, 13, 13)");
});
