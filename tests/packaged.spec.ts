import { test, expect, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { installHost, fixture } from "./host";
import type powerbi from "powerbi-visuals-api";

let javascript: string;
let css: string;
test.beforeAll(async () => {
  const packageName = readdirSync("dist").find(name => name.endsWith(".pbiviz"));
  if (!packageName) throw new Error("Run npm run package before browser tests.");
  const zip = await JSZip.loadAsync(readFileSync(join("dist", packageName)));
  const resource = Object.keys(zip.files).find(name => name.startsWith("resources/") && name.endsWith(".pbiviz.json"));
  if (!resource) throw new Error("No packaged visual resource.");
  const file = zip.file(resource);
  if (!file) throw new Error("Resource entry missing.");
  const payload = JSON.parse(await file.async("string"));
  javascript = payload.content.js;
  css = payload.content.css;
});

async function boot(page: Page, options = { locale: "en-US", highContrast: false }, data = fixture()): Promise<void> {
  await page.route("**/*", route => route.abort());
  await page.setContent('<div id="visual" style="width:1200px;height:950px"></div>');
  await page.evaluate(() => { Object.defineProperty(window, "powerbi", { value: { visuals: { plugins: {} } }, writable: true, configurable: true }); });
  await page.evaluate(installHost, options);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(dataView => {
    const plugin = Object.values(window.powerbi.visuals.plugins)[0];
    const element = document.getElementById("visual");
    if (!plugin || !element) throw new Error("Packaged plugin registration absent.");
    window.visual = plugin.create({ element, host: window.host });
    window.visual.update({ viewport: { width: 1200, height: 950 }, type: 2, dataViews: [dataView] });
  }, data);
  await expect(page.locator(".fatal")).toHaveCount(0);
}
async function update(page: Page, data: powerbi.DataView, operationKind = 0): Promise<void> {
  await page.evaluate(({ data, operationKind }) => {
    window.visual.update({ viewport: { width: 1200, height: 950 }, type: 2, dataViews: [data], operationKind });
  }, { data, operationKind });
}

test("packaged graph retains cycles, correct arrows and bounded real geometry without network", async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", request => requests.push(request.url()));
  page.on("pageerror", error => errors.push(error.message));
  await boot(page);
  await expect(page.locator(".edge-line")).toHaveCount(7);
  await expect(page.locator(".edge-arrow")).toHaveCount(7);
  await expect(page.locator(".activity")).toHaveCount(6);
  await expect(page.locator('[data-issue="variantDuration"]')).toBeVisible();
  const geometry = await page.locator(".process-graph").evaluate(svg => {
    const box = svg.getBoundingClientRect();
    return [...svg.querySelectorAll<SVGPathElement>(".edge-line")].map(path => {
      const length = path.getTotalLength();
      const endpoint = path.getPointAtLength(length);
      const bounds = path.getBBox();
      return { length, endpoint: [endpoint.x, endpoint.y], bounds: [bounds.x, bounds.y, bounds.width, bounds.height], width: box.width };
    });
  });
  for (const edge of geometry) {
    expect(edge.length).toBeGreaterThan(30);
    expect(edge.endpoint.every(Number.isFinite)).toBe(true);
    expect(edge.bounds[0]).toBeGreaterThanOrEqual(0);
    expect(edge.bounds[1]).toBeGreaterThanOrEqual(0);
  }
  expect(await page.evaluate(() => window.harness.lifecycle)).toEqual(["started", "finished"]);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/process-lens-packaged.png", fullPage: true });
});

test("all represented identities selected; host callbacks and hover never move the layout", async ({ page }) => {
  await boot(page);
  const before = await page.locator(".edge-line").evaluateAll(nodes => nodes.map(node => node.getAttribute("d")));
  const select = page.locator('tr[data-edge=\'["Investigate","Resolved",""]\'] button').first();
  await select.click();
  await expect.poll(() => page.evaluate(() => window.harness.selections.at(-1))).toEqual(["row-5", "row-6"]);
  await expect(select).toHaveAttribute("aria-pressed", "true");
  await select.hover();
  const tooltip = await page.evaluate(() => window.harness.tooltips.at(-1));
  expect(JSON.stringify(tooltip)).toContain("Engineering");
  expect(JSON.stringify(tooltip)).toContain("statistics are not combined");
  await page.evaluate(() => window.harness.nativeSelect(["row-2"]));
  expect(await page.locator(".edge-line").evaluateAll(nodes => nodes.map(node => node.getAttribute("d")))).toEqual(before);
  await page.locator(".data-section > details > summary").click();
  const activity = page.locator('.activities-list li[data-activity="Investigate"] button').last();
  await activity.click();
  await expect.poll(() => page.evaluate(() => window.harness.selections.at(-1))).toEqual(["row-1", "row-2", "row-3", "row-4", "row-5", "row-6"]);
});

test("keyboard selections, per-row and grouped native menus, focus and clear work", async ({ page }) => {
  await boot(page);
  const select = page.locator('tr[data-edge=\'["Investigate","Resolved",""]\'] button').first();
  await select.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.harness.selections.at(-1))).toEqual(["row-5", "row-6"]);
  await page.keyboard.press("Shift+F10");
  await expect.poll(() => page.evaluate(() => window.harness.menus.at(-1)?.key)).toBeNull();
  const detail = select.locator("..").locator("details");
  await detail.locator("summary").click();
  await detail.getByRole("button", { name: "Context menu" }).first().click();
  await expect.poll(() => page.evaluate(() => window.harness.menus.at(-1)?.key)).toBe("row-5");
  await page.getByRole("button", { name: "Clear report selection" }).click();
  await expect(select).toHaveAttribute("aria-pressed", "false");
});

test("variant and local focus filter correctly without implicit host selection", async ({ page }) => {
  await boot(page);
  const before = await page.locator('.activity[data-activity="Investigate"]').getAttribute("transform");
  await page.locator('[data-focus="variant"]').selectOption({ label: "follow-up" });
  await expect(page.locator(".edge-line")).toHaveCount(3);
  await expect(page.locator('[data-issue="variantDuration"]')).toHaveCount(0);
  expect(await page.locator('.activity[data-activity="Investigate"]').getAttribute("transform")).toBe(before);
  expect(await page.evaluate(() => window.harness.selections)).toEqual([]);
  await page.getByRole("button", { name: "Select variant rows in report" }).click();
  await expect.poll(() => page.evaluate(() => window.harness.selections.at(-1)?.slice().sort())).toEqual(["row-3", "row-4", "row-6"]);
  await page.getByRole("button", { name: "Reset local view" }).click();
  await page.locator('[data-focus="activity"]').selectOption({ label: "Waiting" });
  await page.locator('[data-focus="traversal"]').selectOption("neighbors");
  await expect(page.locator(".edge-line")).toHaveCount(2);
  await page.locator('[data-focus="search"]').fill("wait");
  await expect(page.locator('.activity[data-activity="Investigate"]')).toHaveClass(/search-muted/);
});

test("host replacement/reset, resize-only update, invalid data and missing identities are honest", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.visual.update({ viewport: { width: 300, height: 250 }, type: 4, dataViews: [] }));
  await expect(page.locator(".edge-line")).toHaveCount(7);
  const data = fixture([["A", "B", 3, -1, "v", "0", "Team"], ["A", "C", -2, 5, "v", "1", "Team"]]);
  data.metadata.segment = {};
  if (data.table) data.table.identity = [];
  await update(page, data, 1);
  await expect(page.locator(".edge-line")).toHaveCount(1);
  await expect(page.locator(".completeness")).toContainText("INCOMPLETE");
  for (const code of ["hostPartial", "invalidDuration", "invalidFrequency", "identity", "segment"]) {
    await expect(page.locator(`[data-issue="${code}"]`)).toBeVisible();
  }
  await expect(page.locator("tbody button").first()).toBeDisabled();
  await update(page, fixture([]));
  await expect(page.locator(".edge-line")).toHaveCount(0);
  await expect(page.locator(".empty")).toBeVisible();
});

test("resize preserves expanded keyboard controls and hides stale host tooltips", async ({ page }) => {
  await boot(page);
  await page.locator(".data-section > details > summary").click();
  const activity = page.locator('.activities-list li[data-activity="Investigate"] button').last();
  await activity.focus();
  const hideBefore = await page.evaluate(() => window.harness.tooltipHides);
  await page.evaluate(() => window.visual.update({ viewport: { width: 1000, height: 800 }, type: 4, dataViews: [] }));
  await expect(activity).toBeFocused();
  expect(await page.evaluate(() => window.harness.tooltipHides)).toBeGreaterThan(hideBefore);
  const detail = page.locator('tr[data-edge=\'["Investigate","Resolved",""]\'] details');
  await detail.locator("summary").click();
  const inputRow = detail.getByRole("button", { name: "Input row 6", exact: true });
  await inputRow.focus();
  await page.evaluate(() => window.visual.update({ viewport: { width: 1000, height: 800 }, type: 4, dataViews: [] }));
  await expect(inputRow).toBeFocused();
  await update(page, fixture([]));
  await expect(page.locator('[data-focus="activity"]')).toBeFocused();
});

test("duplicate duration diagnostics preserve frequency and all row identities in the actual payload", async ({ page }) => {
  await boot(page, { locale: "en-US", highContrast: false }, fixture([
    ["A", "B", 4, 3, "v", "0", "First"],
    ["A", "B", 6, 99, "v", "1", "Second"],
    ["B", "B", 0, 0, "v", "2", "Zero"]
  ]));
  await expect(page.locator('[data-issue="duplicateDuration"]')).toBeVisible();
  await expect(page.locator("tbody tr").first()).toContainText("10");
  await page.locator("tbody tr").first().getByRole("button", { name: /Select represented rows/ }).click();
  await expect.poll(() => page.evaluate(() => window.harness.selections.at(-1))).toEqual(["row-0", "row-1"]);
  await page.locator('[data-focus="overlay"]').selectOption("duration");
  await expect(page.locator(".edge-label").first()).toContainText("Unavailable");
  await expect(page.locator(".edge-line").first()).toHaveAttribute("stroke-dasharray", "5 4");
});

test("maximum graph and row budgets remain bounded and render lifecycle completes synchronously", async ({ page }) => {
  const rows: powerbi.DataViewTableRow[] = Array.from({ length: 2050 }, (_, index) => [
    `Activity ${index % 80}`, `Activity ${(index * 7 + 1) % 80}`, 1, 1, `v${Math.floor(index / 80)}`, String(index), "Team"
  ]);
  await boot(page, { locale: "en-US", highContrast: false }, fixture(rows));
  await expect(page.locator(".completeness")).toContainText("INCOMPLETE");
  await expect(page.locator('[data-issue="rowLimit"]')).toBeVisible();
  await expect(page.locator('[data-issue="graphLimit"]')).toBeVisible();
  expect(await page.locator(".activity").count()).toBeLessThanOrEqual(80);
  expect(await page.locator(".edge-line").count()).toBeLessThanOrEqual(300);
  expect(await page.evaluate(() => window.harness.lifecycle)).toEqual(["started", "finished"]);
});

test("high contrast, reduced motion, RTL, localization and tiny tiles remain usable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await boot(page, { locale: "fr-FR", highContrast: true });
  await expect(page.locator(".process-lens")).toHaveClass(/high-contrast/);
  await expect(page.locator(".controls")).toContainText("Frequence");
  expect(await page.locator(".edge-line").first().evaluate(node => getComputedStyle(node).stroke)).toBe("rgb(255, 255, 0)");
  await page.evaluate(() => {
    const node = document.getElementById("visual");
    if (node) { node.style.width = "220px"; node.style.height = "180px"; }
  });
  const sizes = await page.locator(".process-lens").evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth, height: node.clientHeight, scrollHeight: node.scrollHeight }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width + 1);
  expect(sizes.scrollHeight).toBeGreaterThan(sizes.height);
  await page.getByRole("button", { name: "Effacer la selection du rapport" }).focus();
  await expect(page.getByRole("button", { name: "Effacer la selection du rapport" })).toBeFocused();
  await page.evaluate(() => window.visual.destroy());
  await boot(page, { locale: "ar-SA", highContrast: false });
  await expect(page.locator(".process-lens")).toHaveAttribute("dir", "rtl");
});

test("host refusal surfaces errors; unsafe labels remain text; formatting and teardown work", async ({ page }) => {
  await boot(page, { locale: "en-US", highContrast: false }, fixture([["<img src=x onerror=alert(1)>", "B", 10, 2, "v", "r", "<script>bad()</script>"]]));
  await expect(page.locator(".process-lens img, .process-lens script")).toHaveCount(0);
  await page.evaluate(() => { window.harness.rejectSelection = true; });
  await page.locator("tbody button").first().click();
  await expect(page.getByRole("alert")).toContainText("Synthetic host selection refusal");
  expect(await page.evaluate(() => window.visual.getFormattingModel().cards.length)).toBe(2);
  await page.locator(".legal summary").click();
  await expect(page.locator(".legal pre")).toHaveText(readFileSync("THIRD-PARTY-NOTICES.txt", "utf8"));
  await page.evaluate(() => window.visual.destroy());
  await expect(page.locator(".process-lens")).toBeEmpty();
});

test("host-disabled interactions never issue native selections or menus", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.host.hostCapabilities.allowInteractions = false;
    window.visual.update({ viewport: { width: 1200, height: 950 }, type: 4, dataViews: [] });
  });
  await expect(page.locator("tbody button").first()).toBeDisabled();
  await page.getByRole("button", { name: "Clear report selection" }).click();
  await expect(page.getByRole("alert")).toContainText("disabled by the host");
  expect(await page.evaluate(() => window.harness.selections)).toEqual([]);
  expect(await page.evaluate(() => window.harness.menus)).toEqual([]);
});
