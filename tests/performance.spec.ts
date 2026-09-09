import { test, expect } from "@playwright/test";
import { cpus, freemem, totalmem, platform, release, arch, loadavg } from "node:os";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { maximumFixture, openPackage, preparedFixture } from "./packageHarness";

test("record reproducible typical and maximum local render/focus/selection distributions", async ({ page, browser }) => {
  test.setTimeout(120000);
  const scenarios = [];
  for (const [name, data] of [["typical-prepared", preparedFixture()], ["maximum-prepared", maximumFixture()]] as const) {
    await openPackage(page, { data, width: 1366, height: 768 });
    const measurements = await page.evaluate(dataView => {
      const count = 30, warmups = 5;
      const root = document.querySelector<HTMLElement>(".process-lens")!;
      function measure(action: (index: number) => void): number[] {
        const times: number[] = [];
        for (let index = -warmups; index < count; index++) {
          const start = performance.now();
          action(index);
          void root.offsetHeight;
          const elapsed = performance.now() - start;
          if (index >= 0) times.push(elapsed);
        }
        return times;
      }
      const alternates = ["First ", "Second "].map(prefix => ({
        ...dataView,
        table: { ...dataView.table!, rows: dataView.table!.rows!.map(row => row.map((value, index) => index < 2 ? prefix + value : value)) }
      }));
      const coldRender = measure(index => window.visual.update({
        viewport: { width: 1366, height: 768 }, type: 2, dataViews: [alternates[Math.abs(index) % 2]!]
      }));
      window.visual.update({ viewport: { width: 1366, height: 768 }, type: 2, dataViews: [dataView] });
      const render = measure(() => window.visual.update({ viewport: { width: 1366, height: 768 }, type: 2, dataViews: [dataView] }));
      const activity = root.querySelector<SVGElement>(".activity")!.dataset.activity!;
      const focus = measure(() => {
        const node = [...root.querySelectorAll<SVGElement>(".activity")].find(node => node.dataset.activity === activity)!;
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      root.querySelector(".activity.focused")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const keys = (dataView.table?.identity ?? []).map((_id, index) => `row-${index}`);
      const selection = measure(index => window.harness.nativeSelect(index % 2 === 0 ? keys : []));
      return { render, coldRender, focus, selection, rows: dataView.table?.rows?.length, identities: keys.length };
    }, data);
    function summary(values: number[]) {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        samples: values.length, p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1],
        p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], maxMs: sorted.at(-1), minMs: sorted[0],
        rawMs: values
      };
    }
    expect(measurements.render).toHaveLength(30);
    expect([...measurements.render, ...measurements.focus, ...measurements.selection].every(value => Number.isFinite(value) && value < 10000)).toBe(true);
    scenarios.push({
      name, rows: measurements.rows, identities: measurements.identities,
      render: summary(measurements.render), coldRender: summary(measurements.coldRender), focus: summary(measurements.focus), selection: summary(measurements.selection)
    });
    const profiler = await page.context().newCDPSession(page);
    await profiler.send("Profiler.enable");
    await profiler.send("Profiler.start");
    await page.evaluate(dataView => {
      const root = document.querySelector<HTMLElement>(".process-lens")!;
      for (let index = 0; index < 10; index++) {
        window.visual.update({ viewport: { width: 1366, height: 768 }, type: 2, dataViews: [dataView] });
        root.querySelector(".activity")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        window.harness.nativeSelect(index % 2 ? [] : (dataView.table?.identity ?? []).map((_id, row) => `row-${row}`));
        void root.offsetHeight;
      }
    }, data);
    const { profile } = await profiler.send("Profiler.stop");
    await profiler.detach();
    mkdirSync(join("dist", "quality-evidence"), { recursive: true });
    writeFileSync(join("dist", "quality-evidence", `cpu-${name}.cpuprofile`), JSON.stringify(profile));
  }
  const artifact = readdirSync("dist").find(file => file.endsWith(".pbiviz"))!;
  const output = {
    measuredAt: new Date().toISOString(), browser: await browser.version(),
    channel: process.env.PROCESS_LENS_BROWSER_CHANNEL ?? "playwright-chromium",
    packageSha256: createHash("sha256").update(readFileSync(join("dist", artifact))).digest("hex"),
    machine: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem(), freeMemoryBytesAtEnd: freemem(), loadAverage: loadavg() },
    methodology: "Five warm-ups then 30 observations per workload/operation; 1366x768, single local browser worker. Nearest-rank p50/p95. render is a same-topology cached update; coldRender alternates renamed activity IDs to force complete layout reconstruction. Both include forced layout. focus alternates local node focus; selection alternates none/all identity host callbacks plus DOM highlight in the full graph. No native Power BI query/IPC/compositor paint latency.",
    caveats: "Shared, potentially contended workstation with other work running; not an isolated lab or an SLA. Windows load averages are not a reliable load signal. Timing is browser-harness evidence only. Maximum graph has 2000 rows,80 activities,300 distinct source-target edges,including loops; frequency duplicates retain 2000 identities.",
    cpuProfiles: "Separate Chromium DevTools Protocol CPU profiles capture ten render/focus/selection cycles per workload after the timing observations. Profiling is not enabled during percentile measurements. Open cpu-*.cpuprofile in Chromium DevTools; not a native Power BI profile.",
    scenarios
  };
  mkdirSync(join("dist", "quality-evidence"), { recursive: true });
  writeFileSync(join("dist", "quality-evidence", "performance.json"), JSON.stringify(output, null, 2) + "\n");
  console.log(JSON.stringify(scenarios.map(item => ({ name: item.name, render: item.render.p95Ms, focus: item.focus.p95Ms, selection: item.selection.p95Ms }))));
});
