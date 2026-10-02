import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { controlsPanel, diagnosticPanel, maximumFixture, openPackage, preparedFixture, tablePanel } from "./packageHarness";
import { fixture, installHost } from "./host";
import { DEFAULT_NAVIGATION } from "../src/navigation";

const directory = join("dist", "quality-evidence");
test.beforeAll(() => { mkdirSync(directory, { recursive: true }); });
const dimensions = [[80, 80], [258, 198], [398, 298], [1280, 620], [1366, 768]] as const;
for (const [width, height] of dimensions) {
  for (const scene of ["sparse", "cyclic", "dense"] as const) {
    test(`${scene} actual package geometry at ${width}x${height}`, async ({ page }) => {
      const errors: string[] = [], requests: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => requests.push(request.url()));
      const data = scene === "sparse" ? fixture([["Open", "Closed", 0, 0, "V", "r", "Synthetic"]]) : scene === "cyclic" ? preparedFixture() : maximumFixture();
      await openPackage(page, { width, height, data });
      const geometry = await page.locator(".process-lens").evaluate(root => ({
        width: root.clientWidth, scrollWidth: root.scrollWidth, height: root.clientHeight,
        nodes: root.querySelectorAll(".activity").length, edges: root.querySelectorAll(".edge-line").length,
        invalidPaths: [...root.querySelectorAll(".edge-line")].some(path => /NaN|Infinity/.test(path.getAttribute("d") ?? ""))
      }));
      expect(geometry.width).toBe(width);
      expect(geometry.height).toBe(height);
      expect(geometry.scrollWidth).toBeLessThanOrEqual(width + 1);
      expect(geometry.nodes).toBeLessThanOrEqual(80);
      expect(geometry.edges).toBeLessThanOrEqual(300);
      expect(geometry.invalidPaths).toBe(false);
      expect(await page.evaluate(() => window.harness.lifecycle)).toEqual(["started", "finished"]);
      if (width === 80) {
        await expect(page.locator(".process-lens")).toHaveClass(/micro/);
        await expect(page.getByRole("button", { name: "Enlarge tile for the process map." })).toBeVisible();
      }
      else {
        const graph = await page.locator(".graph-scroll").boundingBox();
        expect(graph?.width).toBeLessThanOrEqual(width);
        expect(graph?.height).toBeGreaterThanOrEqual(72);
        expect((graph?.y ?? Infinity)).toBeLessThan(height - 24);
        if (scene !== "dense") {
          const completeNodes = await page.locator(".activity rect").evaluateAll((nodes, viewport) => nodes.filter(node => {
            const box = node.getBoundingClientRect();
            return box.left >= 0 && box.top >= 0 && box.right <= viewport.width && box.bottom <= viewport.height;
          }).length, { width, height });
          expect(completeNodes).toBeGreaterThan(0);
        }
      }
      await page.locator(".process-lens").screenshot({ path: join(directory, `${scene}-${width}x${height}.png`) });
      expect(errors).toEqual([]);
      expect(requests).toEqual([]);
    });
  }
}

test("geometric routes retain direction and never pass through an unrelated activity box", async ({ page }) => {
  await openPackage(page, { data: maximumFixture(), width: 1366, height: 768 });
  const violations = await page.locator(".process-graph").evaluate(root => {
    const nodes = [...root.querySelectorAll<SVGGElement>(".activity")].map(group => {
      const matrix = group.transform.baseVal.consolidate()!.matrix;
      return { id: group.dataset.activity, x: matrix.e, y: matrix.f };
    });
    const problems: string[] = [];
    for (const group of root.querySelectorAll<SVGGElement>(".edge")) {
      const [source, target] = JSON.parse(group.dataset.key ?? "[]");
      const path = group.querySelector<SVGPathElement>(".edge-line")!;
      const length = path.getTotalLength(), end = path.getPointAtLength(length);
      const beforeEnd = path.getPointAtLength(Math.max(0, length - 0.5));
      const arrow = group.querySelector<SVGPathElement>(".edge-arrow")!.transform.baseVal.consolidate()!.matrix;
      const tangent = { x: end.x - beforeEnd.x, y: end.y - beforeEnd.y };
      if (Math.hypot(arrow.e - end.x, arrow.f - end.y) > 0.1 || arrow.a * tangent.x + arrow.b * tangent.y <= 0) {
        problems.push(`misdirected arrow: ${source}->${target}`);
      }
      const targetNode = nodes.find(node => node.id === target)!;
      if (Math.hypot(end.x - targetNode.x, end.y - targetNode.y) > 100) problems.push(`wrong target: ${source}->${target}`);
      for (let index = 0; index <= 120; index++) {
        const point = path.getPointAtLength(length * index / 120);
        if (nodes.some(node => node.id !== source && node.id !== target && Math.abs(point.x - node.x) < 75 && Math.abs(point.y - node.y) < 21)) {
          problems.push(`intervening activity: ${source}->${target}`); break;
        }
      }
    }
    return problems;
  });
  expect(violations).toEqual([]);
});

test("graph node focus is local; full identities belong to explicit report selection", async ({ page }) => {
  await openPackage(page, { data: preparedFixture() });
  const before = await page.locator('.activity[data-activity="Triage"]').getAttribute("transform");
  await page.locator('.activity[data-activity="Triage"] rect').click();
  expect(await page.evaluate(() => window.harness.selections)).toEqual([]);
  await expect(page.locator(".local-context")).toContainText("Triage");
  expect(await page.locator('.activity[data-activity="Triage"]').getAttribute("transform")).toBe(before);
  await tablePanel(page);
  await page.locator(".activities-list").locator("..").locator(":scope > summary").click();
  await page.locator('.activities-list [data-activity="Triage"] button').last().click();
  const selected = await page.evaluate(() => window.harness.selections.at(-1));
  const rows = preparedFixture().table!.rows!;
  expect(selected?.length).toBe(rows.filter(row => row[0] === "Triage" || row[1] === "Triage").length);
});

test("tiny tile offers keyboard-accessible host focus mode rather than an unreadable map", async ({ page }) => {
  await openPackage(page, { data: preparedFixture(), width: 80, height: 80 });
  await page.getByRole("button", { name: "Enlarge tile for the process map." }).focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.harness.focusRequests)).toEqual([true]);
  expect(await page.evaluate(() => window.harness.selections)).toEqual([]);
});

test("certification-sized 20000-row input is visibly bounded rather than reported complete", async ({ page }) => {
  const data = maximumFixture();
  const row = data.table!.rows![0]!;
  while (data.table!.rows!.length < 20000) data.table!.rows!.push([...row]);
  await openPackage(page, { data });
  await expect(page.locator(".completeness")).toContainText("INCOMPLETE");
  await expect(page.locator(".summary").first()).toContainText("2000/20000");
  await diagnosticPanel(page);
  await expect(page.locator('[data-issue="rowLimit"]')).toBeVisible();
  expect(await page.evaluate(() => window.harness.lifecycle)).toEqual(["started", "finished"]);
});

test("largest finite supplied duration never overflows SVG width arithmetic", async ({ page }) => {
  const data = fixture([["Start", "End", 9007199254740991, Number.MAX_VALUE, "V", "large", "Synthetic"]]);
  data.metadata.objects!.navigation = { state: JSON.stringify({ ...DEFAULT_NAVIGATION, overlay: "duration" }) };
  await openPackage(page, { data });
  expect(await page.locator(".edge-line").getAttribute("stroke-width")).toBe("8.5");
  expect(await page.evaluate(() => window.harness.lifecycle)).toEqual(["started", "finished"]);
});

test("first-column reciprocal metrics retain leading digits inside the SVG", async ({ page }) => {
  await openPackage(page, { data: fixture([
    ["A", "B", 1000000, 1, "V", "ab", "Synthetic"],
    ["B", "A", 1000000, 2, "V", "ba", "Synthetic"]
  ]) });
  const labels = await page.locator(".edge-label").evaluateAll(nodes => nodes.map(node => {
    const text = node as SVGTextElement, box = text.getBBox();
    return { value: text.textContent?.replace(/\D/g, ""), left: box.x, right: box.x + box.width, limit: text.ownerSVGElement!.viewBox.baseVal.width };
  }));
  expect(labels).toHaveLength(2);
  for (const label of labels) {
    expect(label.value).toBe("1000000");
    expect(label.left).toBeGreaterThanOrEqual(0);
    expect(label.right).toBeLessThanOrEqual(label.limit);
  }
});

test("bookmark-style metadata round-trip restores local view without host selections", async ({ page }) => {
  const data = preparedFixture();
  await openPackage(page, { data });
  await controlsPanel(page);
  await page.locator('[data-focus="variant"]').selectOption({ label: "V02" });
  await page.locator('[data-focus="overlay"]').selectOption("duration");
  const persisted = await page.evaluate(() => window.harness.persisted.at(-1));
  const token = persisted?.merge?.[0]?.properties.state;
  if (typeof token !== "string") throw new Error("Navigation was not persisted as a string.");
  const saved = structuredClone(data);
  saved.metadata.objects = { ...saved.metadata.objects, navigation: { state: token } };
  await page.evaluate(dataView => {
    window.visual.update({ viewport: { width: 1280, height: 620 }, type: 2, dataViews: [dataView] });
  }, data);
  await page.evaluate(dataView => window.visual.update({ viewport: { width: 1280, height: 620 }, type: 2, dataViews: [dataView] }), saved);
  await expect(page.locator(".local-context")).toContainText("V02");
  await expect(page.locator('[data-focus="overlay"]')).toHaveValue("duration");
  expect(await page.evaluate(() => window.harness.selections)).toEqual([]);
  await page.evaluate(dataView => window.visual.update({ viewport: { width: 1280, height: 620 }, type: 2, dataViews: [dataView] }), data);
  await expect(page.locator(".local-context")).toHaveCount(0);
  saved.metadata.objects!.navigation = { state: "{malformed" };
  await page.evaluate(dataView => window.visual.update({ viewport: { width: 1280, height: 620 }, type: 2, dataViews: [dataView] }), saved);
  await diagnosticPanel(page);
  await expect(page.locator('[data-issue="navigationInvalid"]')).toBeVisible();
});

for (const variant of ["V02", "V03"] as const) {
  test(`${variant} duration overlay survives initial unbound and subsequent role-less updates`, async ({ page }) => {
    const rows = preparedFixture().table!.rows!.filter(row => row[4] === variant);
    const data = fixture(rows);
    const navigation = JSON.stringify({ ...DEFAULT_NAVIGATION, overlay: "duration" });
    data.metadata.objects = { ...data.metadata.objects, navigation: { state: navigation } };
    const unbound = structuredClone(data);
    unbound.metadata.columns = [];
    unbound.table = undefined;
    await openPackage(page, { data: unbound });
    await expect(page.locator(".first-run")).toBeVisible();

    const update = async (input: typeof data) => page.evaluate(dataView => {
      window.visual.update({ viewport: { width: 1280, height: 620 }, type: 2, dataViews: [dataView] });
    }, input);
    const maximum = variant === "V02" ? "3.50" : "2.25";
    const sampleLabel = variant === "V02" ? "1.75 hours" : "0.25 hours";
    await update(data);
    await expect(page.locator(".summary").first()).toContainText(`${rows.length}/${rows.length}`);
    await expect(page.locator(".legend")).toContainText(`Prepared duration; max ${maximum} hours (mean)`);
    await expect(page.locator(".edge-label").filter({ hasText: sampleLabel })).toHaveCount(1);
    await controlsPanel(page);
    await expect(page.locator('[data-focus="overlay"]')).toHaveValue("duration");

    const withoutDuration = structuredClone(data);
    withoutDuration.metadata.columns = withoutDuration.metadata.columns.filter(column => !column.roles?.duration);
    withoutDuration.table!.columns = withoutDuration.table!.columns.filter(column => !column.roles?.duration);
    withoutDuration.table!.rows = withoutDuration.table!.rows!.map(row => row.filter((_value, index) => index !== 3));
    await update(withoutDuration);
    await expect(page.locator(".legend")).toContainText("Transition frequency; max 2.");
    await expect(page.locator('[data-focus="overlay"]')).toHaveValue("frequency");

    await update(data);
    await expect(page.locator(".legend")).toContainText(`Prepared duration; max ${maximum} hours (mean)`);
    await expect(page.locator(".edge-label").filter({ hasText: sampleLabel })).toHaveCount(1);
    await expect(page.locator('[data-focus="overlay"]')).toHaveValue("duration");
    expect(await page.evaluate(() => window.harness.persisted)).toEqual([]);
  });
}

test("packaged harness V02 keeps reciprocal selections, tooltips and context menus directional", async ({ page }) => {
  await openPackage(page, { data: preparedFixture() });
  await controlsPanel(page);
  await page.locator('[data-focus="variant"]').selectOption({ label: "V02" });
  await page.locator('[data-focus="overlay"]').selectOption("duration");

  const forward = page.locator('.edge[data-key=\'["Triage","Waiting",""]\']');
  const reverse = page.locator('.edge[data-key=\'["Waiting","Triage",""]\']');
  await expect(forward.locator(".edge-label")).toHaveText("1.75 hours");
  await expect(reverse.locator(".edge-label")).toHaveText("2.50 hours");
  expect(await page.evaluate(() => window.harness.selections)).toEqual([]);

  await forward.locator(".edge-hit").hover();
  expect(await page.evaluate(() => window.harness.tooltips.at(-1))).toEqual(expect.objectContaining({
    dataItems: expect.arrayContaining([
      { displayName: "Source", value: "Triage" },
      { displayName: "Target", value: "Waiting" },
      { displayName: "Prepared duration", value: "1.75 hours (mean)" }
    ])
  }));
  await forward.locator(".edge-hit").click();
  await expect.poll(() => page.evaluate(() => window.harness.selections.at(-1))).toEqual(["row-6"]);
  await expect(forward).toHaveClass(/selected/);
  await expect(reverse).not.toHaveClass(/selected/);

  await reverse.locator(".edge-hit").click({ button: "right" });
  await expect.poll(() => page.evaluate(() => window.harness.menus.length)).toBe(1);
  expect(await page.evaluate(() => window.harness.menus.at(-1)?.key)).toBe("row-7");

  await tablePanel(page);
  const reverseRow = page.locator('tr[data-edge=\'["Waiting","Triage",""]\']');
  await expect(reverseRow).toContainText("2.50 hours (mean)");
  const reverseSelect = reverseRow.getByRole("button", { name: /Select represented rows/ });
  await reverseSelect.focus();
  expect(await page.evaluate(() => window.harness.tooltips.at(-1))).toEqual(expect.objectContaining({
    dataItems: expect.arrayContaining([
      { displayName: "Source", value: "Waiting" },
      { displayName: "Target", value: "Triage" },
      { displayName: "Prepared duration", value: "2.50 hours (mean)" }
    ])
  }));
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.harness.selections.at(-1))).toEqual(["row-7"]);
  await expect(reverse).toHaveClass(/selected/);
  await expect(forward).not.toHaveClass(/selected/);
  await page.keyboard.press("Shift+F10");
  await expect.poll(() => page.evaluate(() => window.harness.menus.length)).toBe(2);
  expect(await page.evaluate(() => window.harness.menus.at(-1)?.key)).toBe("row-7");
});

test("packaged harness V03 preserves the 0.25-hour Triage self-loop and its host actions", async ({ page }) => {
  await openPackage(page, { data: preparedFixture() });
  await controlsPanel(page);
  await page.locator('[data-focus="variant"]').selectOption({ label: "V03" });
  await page.locator('[data-focus="overlay"]').selectOption("duration");

  const loop = page.locator('.edge[data-key=\'["Triage","Triage",""]\']');
  await expect(loop.locator(".edge-label")).toHaveText("0.25 hours");
  const hit = loop.locator(".edge-hit");
  const curvePoint = await hit.evaluate(node => {
    const path = node as SVGPathElement;
    const matrix = path.getScreenCTM()!;
    const probes = Array.from({ length: 19 }, (_, index) => {
      const point = path.getPointAtLength(path.getTotalLength() * (index + 1) / 20).matrixTransform(matrix);
      return { x: point.x, y: point.y, target: document.elementFromPoint(point.x, point.y) };
    });
    const reachable = probes.find(probe => probe.target === path);
    if (!reachable) throw new Error(`Self-loop has no pointer-accessible stroke: ${JSON.stringify(probes.map(({ target, ...point }) => ({
      ...point, hit: target?.tagName, className: target?.getAttribute("class")
    })))}`);
    return { x: reachable.x, y: reachable.y };
  });
  await page.mouse.move(curvePoint.x, curvePoint.y);
  expect(await page.evaluate(() => window.harness.tooltips.at(-1))).toEqual(expect.objectContaining({
    dataItems: expect.arrayContaining([
      { displayName: "Source", value: "Triage" },
      { displayName: "Target", value: "Triage" },
      { displayName: "Prepared duration", value: "0.25 hours (mean)" }
    ])
  }));
  await page.mouse.click(curvePoint.x, curvePoint.y, { button: "right" });
  await expect.poll(() => page.evaluate(() => window.harness.menus.length)).toBe(1);
  expect(await page.evaluate(() => window.harness.menus.at(-1)?.key)).toBe("row-11");

  await tablePanel(page);
  const loopRow = page.locator('tr[data-edge=\'["Triage","Triage",""]\']');
  await expect(loopRow).toContainText("0.25 hours (mean)");
  await loopRow.getByRole("button", { name: /Select represented rows/ }).focus();
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => window.harness.selections.at(-1))).toEqual(["row-11"]);
  await expect(loop).toHaveClass(/selected/);
  await page.keyboard.press("Shift+F10");
  await expect.poll(() => page.evaluate(() => window.harness.menus.length)).toBe(2);
  expect(await page.evaluate(() => window.harness.menus.at(-1)?.key)).toBe("row-11");
});

test("persisted formatting, row reorder, context errors, tooltip errors and disposal are explicit", async ({ page }) => {
  const data = fixture();
  await openPackage(page, { data });
  await page.evaluate(() => window.harness.nativeSelect(["row-0"]));
  const reordered = structuredClone(data);
  reordered.table!.rows!.reverse(); reordered.table!.identity!.reverse();
  reordered.metadata.objects = { ...reordered.metadata.objects, appearance: { edgeColor: { solid: { color: "#B03060" } }, showLabels: false } };
  await page.evaluate(dataView => window.visual.update({ viewport: { width: 1280, height: 620 }, type: 2, dataViews: [dataView] }), reordered);
  await expect(page.locator('.edge[data-key=\'["Received","Triage",""]\']')).toHaveClass(/selected/);
  await expect(page.locator(".edge-label")).toHaveCount(0);
  await tablePanel(page);
  await page.evaluate(() => { window.harness.rejectContext = true; window.harness.rejectTooltip = true; });
  await page.locator("tbody button").first().focus();
  await expect(page.getByRole("alert")).toContainText("tooltip refusal");
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("alert")).toContainText("context refusal");
  const lifecycle = await page.evaluate(() => {
    window.visual.destroy(); window.visual.destroy();
    const count = window.harness.lifecycle.length;
    window.visual.update({ viewport: { width: 1280, height: 620 }, type: 2, dataViews: [] });
    window.harness.nativeSelect(["row-1"]);
    return { count, after: window.harness.lifecycle.length };
  });
  expect(lifecycle.after).toBe(lifecycle.count);
  await expect(page.locator(".process-lens")).toBeEmpty();
});

test("instances isolate direction, colors, identities and local navigation", async ({ page }) => {
  await openPackage(page, { data: preparedFixture(), width: 640, height: 400 });
  await page.evaluate(installHost, { locale: "ar-SA", highContrast: true });
  await page.evaluate(data => {
    const container = document.createElement("div");
    document.body.append(container);
    const plugin = Object.values(window.powerbi.visuals.plugins)[0]!;
    const second = plugin.create({ element: container, host: window.host });
    second.update({ viewport: { width: 640, height: 400 }, type: 2, dataViews: [data] });
    window.instances.push({ visual: second, host: window.host, state: window.harness });
    window.instances[0]!.state.nativeSelect(["row-0"]);
  }, preparedFixture());
  await expect(page.locator(".process-lens").first()).toHaveAttribute("dir", "ltr");
  await expect(page.locator(".process-lens").last()).toHaveAttribute("dir", "rtl");
  expect(await page.locator(".process-lens").first().locator(".edge.selected").count()).toBeGreaterThan(0);
  await expect(page.locator(".process-lens").last().locator(".edge.selected")).toHaveCount(0);
  await page.evaluate(() => window.instances[0]!.visual.destroy());
  expect(await page.locator(".process-lens").last().locator(".edge").count()).toBeGreaterThan(0);
});

test("touch, keyboard, long RTL labels and high contrast keep usable controls", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, reducedMotion: "reduce", viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const label = "\u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629 - " + "Long supplied activity name ".repeat(3);
  await openPackage(page, { data: fixture([[label, "Closed", 1, 2, "v", "r", "Synthetic"]]), locale: "ar-SA", highContrast: true, width: 1366, height: 768 });
  await tablePanel(page);
  await page.locator("tbody button").first().tap();
  await expect.poll(() => page.evaluate(() => window.harness.selections.length)).toBe(1);
  expect(JSON.stringify(await page.evaluate(() => window.harness.tooltips))).toContain('"isTouchEvent":true');
  expect(await page.locator(".process-lens").evaluate(root => getComputedStyle(root).backgroundColor)).toBe("rgb(0, 0, 0)");
  await expect(page.locator("tbody tr").first()).toContainText(label);
  await page.locator(".process-lens").screenshot({ path: join(directory, "touch-hc-rtl-long-labels.png") });
  await context.close();
});

test("first-run, empty, invalid and partial states never imply complete mining", async ({ page }) => {
  await openPackage(page, { data: { metadata: { columns: [] } }, width: 398, height: 298 });
  await expect(page.locator(".first-run")).toContainText("Bind text");
  await page.locator(".process-lens").screenshot({ path: join(directory, "first-run-398x298.png") });
  const partial = fixture([["A", "B", -1, 0, "v", "r0", "Invalid"], ["A", "A", 0, 0, "v", "r1", "Missing duration"]]);
  // SDK PrimitiveValue omits the nulls that a real host can send for blank measures.
  for (const row of partial.table!.rows!) Reflect.set(row, 3, null);
  partial.metadata.segment = {};
  await page.evaluate(data => window.visual.update({ viewport: { width: 398, height: 298 }, type: 2, operationKind: 2, dataViews: [data] }), partial);
  await expect(page.locator(".completeness")).toContainText("INCOMPLETE");
  await diagnosticPanel(page);
  for (const code of ["hostPartial", "segment", "invalidFrequency", "invalidDuration"]) await expect(page.locator(`[data-issue="${code}"]`)).toHaveCount(1);
  await page.locator(".process-lens").screenshot({ path: join(directory, "partial-error-398x298.png") });
  await page.evaluate(() => window.visual.update({ viewport: { width: NaN, height: 298 }, type: 4, dataViews: [] }));
  await expect(page.getByRole("alert")).toContainText("Invalid host viewport");
});

test("capture final package listing views without claiming a native host", async ({ page }) => {
  const marketplace = join(directory, "marketplace");
  mkdirSync(marketplace, { recursive: true });
  const data = preparedFixture();
  await openPackage(page, { data, width: 1366, height: 768 });
  await page.locator(".process-lens").screenshot({ path: join(marketplace, "01-prepared-frequency-1366x768.png") });
  const duration = structuredClone(data);
  const navigation = { ...DEFAULT_NAVIGATION, variant: "V02", overlay: "duration" };
  duration.metadata.objects = { ...duration.metadata.objects, navigation: { state: JSON.stringify(navigation) } };
  await page.evaluate(dataView => window.visual.update({ viewport: { width: 1366, height: 768 }, type: 2, dataViews: [dataView] }), duration);
  await expect(page.locator(".local-context")).toContainText("V02");
  await page.locator(".process-lens").screenshot({ path: join(marketplace, "02-supplied-duration-1366x768.png") });
  data.metadata.objects!.navigation = { state: JSON.stringify({ ...DEFAULT_NAVIGATION, panel: "table" }) };
  await page.evaluate(dataView => window.visual.update({ viewport: { width: 1366, height: 768 }, type: 2, dataViews: [dataView] }), data);
  await page.locator(".process-lens").screenshot({ path: join(marketplace, "03-grain-and-diagnostics-1366x768.png") });
});
