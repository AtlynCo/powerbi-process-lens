import { expect, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import type powerbi from "powerbi-visuals-api";
import { fixture, installHost } from "./host";

let bundle: Promise<{ js: string; css: string }> | undefined;
export function loadPackage(): Promise<{ js: string; css: string }> {
  bundle ??= (async () => {
    const packages = readdirSync("dist").filter(file => file.endsWith(".pbiviz"));
    if (packages.length !== 1) throw new Error("Expected one actual release package in dist.");
    const zip = await JSZip.loadAsync(readFileSync(join("dist", packages[0]!)), { checkCRC32: true });
    const name = Object.keys(zip.files).find(file => file.endsWith(".pbiviz.json"));
    if (!name) throw new Error("Missing packaged resource.");
    return JSON.parse(await zip.file(name)!.async("string")).content;
  })();
  return bundle;
}
export async function openPackage(page: Page, options: {
  data?: powerbi.DataView; locale?: string; highContrast?: boolean; width?: number; height?: number;
} = {}): Promise<void> {
  const width = options.width ?? 1280, height = options.height ?? 620;
  await page.route("**/*", route => route.abort());
  await page.setContent('<div id="visual"></div>');
  await page.evaluate(() => {
    Object.defineProperty(window, "powerbi", { value: { visuals: { plugins: {} } }, writable: true, configurable: true });
    window.instances = [];
    document.body.style.margin = "0";
  });
  await page.evaluate(installHost, { locale: options.locale ?? "en-US", highContrast: options.highContrast ?? false });
  const content = await loadPackage();
  await page.addStyleTag({ content: content.css });
  await page.addScriptTag({ content: content.js });
  await page.evaluate(({ data, width, height }) => {
    const plugin = Object.values(window.powerbi.visuals.plugins)[0];
    const element = document.getElementById("visual");
    if (!plugin || !element) throw new Error("Package registration missing.");
    window.visual = plugin.create({ element, host: window.host });
    window.instances.push({ visual: window.visual, host: window.host, state: window.harness });
    window.visual.update({ viewport: { width, height }, type: 2, dataViews: [data] });
  }, { data: options.data ?? fixture(), width, height });
  await expect(page.locator(".fatal")).toHaveCount(0);
}
export async function tablePanel(page: Page): Promise<void> {
  const button = page.locator('[data-focus="panel:table"]');
  if (await button.getAttribute("aria-pressed") !== "true") await button.click();
}
export async function controlsPanel(page: Page): Promise<void> {
  const panel = page.locator(".controls-panel");
  if (await panel.getAttribute("open") === null) await panel.locator(":scope > summary").click();
}
export async function diagnosticPanel(page: Page): Promise<void> {
  const panel = page.locator(".diagnostics");
  if (await panel.count() && await panel.getAttribute("open") === null) await panel.locator(":scope > summary").click();
}

export function preparedFixture(): powerbi.DataView {
  const lines = readFileSync("samples/prepared-transitions.csv", "utf8").trim().split(/\r?\n/).slice(1);
  const rows: powerbi.DataViewTableRow[] = lines.map(line => {
    // This oracle deliberately reads only the unquoted six-key prefix of our fixture,
    // independent of the production event preprocessor.
    const fields = line.split(",").slice(0, 6);
    if (fields.length !== 6 || fields.some(field => field.includes('"'))) throw new Error("Unexpected synthetic fixture prefix.");
    return [fields[0]!, fields[1]!, Number(fields[2]), Number(fields[3]), fields[4]!, fields[5]!, "Synthetic support tickets"];
  });
  return fixture(rows);
}

export function maximumFixture(): powerbi.DataView {
  return fixture(Array.from({ length: 2000 }, (_, index) => {
    const edge = index % 300, source = edge % 80, target = (source + Math.floor(edge / 80)) % 80;
    return [`Activity ${String(source).padStart(2, "0")}`, `Activity ${String(target).padStart(2, "0")}`, index % 7, edge + 0.25, "prepared", `key-${index}`, "Synthetic maximum"];
  }));
}
