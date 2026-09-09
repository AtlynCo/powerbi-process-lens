import type powerbi from "powerbi-visuals-api";

interface TestIdentity {
  getKey(): string;
  equals(other: TestIdentity): boolean;
  includes(other: TestIdentity): boolean;
  getSelector(): object;
  getSelectorsByColumn(): object;
  hasIdentity(): boolean;
}
interface TestHost {
  locale: string;
  hostCapabilities: { allowInteractions: boolean };
  colorPalette: {
    isHighContrast: boolean;
    foreground: { value: string };
    background: { value: string };
  };
  eventService: {
    renderingStarted(): void;
    renderingFinished(): void;
    renderingFailed(options: unknown, reason: string): void;
  };
  createSelectionIdBuilder(): {
    withTable(table: powerbi.DataViewTable, row: number): { createSelectionId(): TestIdentity };
  };
  createSelectionManager(): {
    select(ids: TestIdentity[], multi: boolean): Promise<TestIdentity[]>;
    clear(): Promise<void>;
    showContextMenu(id: TestIdentity | object, point: unknown): Promise<void>;
    getSelectionIds(): TestIdentity[];
    registerOnSelectCallback(callback: () => void): void;
  };
  tooltipService: {
    enabled(): boolean;
    show(options: unknown): void;
    hide(): void;
  };
}
interface HarnessVisual {
  update(options: powerbi.extensibility.visual.VisualUpdateOptions): void;
  getFormattingModel(): powerbi.visuals.FormattingModel;
  destroy(): void;
}
interface HarnessState {
  selections: string[][];
  menus: { key: string | null; point: unknown }[];
  tooltips: unknown[];
  tooltipHides: number;
  lifecycle: string[];
  rejectSelection: boolean;
  nativeSelect(keys: string[]): void;
}
declare global {
  interface Window {
    powerbi: { visuals: { plugins: Record<string, { create(options: { element: HTMLElement; host: TestHost }): HarnessVisual }> } };
    host: TestHost;
    harness: HarnessState;
    visual: HarnessVisual;
  }
}

/** Runs inside Chromium, exposing only the host surfaces used by the real packaged visual. */
export function installHost(options: { locale: string; highContrast: boolean }): void {
  let selected: TestIdentity[] = [];
  let callback = () => {};
  function identity(key: string): TestIdentity {
    return {
      getKey: () => key,
      equals: other => other.getKey() === key,
      includes: other => other.getKey() === key,
      getSelector: () => ({ key }),
      getSelectorsByColumn: () => ({ key }),
      hasIdentity: () => true
    };
  }
  window.harness = {
    selections: [], menus: [], tooltips: [], tooltipHides: 0, lifecycle: [], rejectSelection: false,
    nativeSelect(keys) { selected = keys.map(identity); callback(); }
  };
  window.host = {
    locale: options.locale,
    hostCapabilities: { allowInteractions: true },
    colorPalette: {
      isHighContrast: options.highContrast,
      foreground: { value: "#FFFF00" },
      background: { value: "#000000" }
    },
    eventService: {
      renderingStarted() { window.harness.lifecycle.push("started"); },
      renderingFinished() { window.harness.lifecycle.push("finished"); },
      renderingFailed(_options, reason) { window.harness.lifecycle.push(`failed:${reason}`); }
    },
    createSelectionIdBuilder() {
      return {
        withTable(table, row) {
          const raw = table.identity?.[row];
          const key = raw && "key" in raw && typeof raw.key === "string" ? raw.key : `row-${row}`;
          return { createSelectionId: () => identity(key) };
        }
      };
    },
    createSelectionManager() {
      return {
        async select(ids, multi) {
          if (window.harness.rejectSelection) throw new Error("Synthetic host selection refusal");
          const before = new Map((multi ? selected : []).map(id => [id.getKey(), id]));
          for (const id of ids) {
            if (multi && before.has(id.getKey())) before.delete(id.getKey());
            else before.set(id.getKey(), id);
          }
          selected = [...before.values()];
          window.harness.selections.push(ids.map(id => id.getKey()));
          callback();
          return selected;
        },
        async clear() { selected = []; callback(); },
        async showContextMenu(id, point) {
          window.harness.menus.push({ key: "getKey" in id && typeof id.getKey === "function" ? id.getKey() : null, point });
        },
        getSelectionIds() { return selected; },
        registerOnSelectCallback(value) { callback = value; }
      };
    },
    tooltipService: {
      enabled: () => true,
      show(value) { window.harness.tooltips.push(value); },
      hide() { window.harness.tooltipHides++; }
    }
  };
}

export function fixture(rows?: powerbi.DataViewTableRow[]): powerbi.DataView {
  const columns: powerbi.DataViewMetadataColumn[] = [
    { displayName: "Source", roles: { source: true }, queryName: "Transitions.Source", type: { text: true } },
    { displayName: "Target", roles: { target: true }, queryName: "Transitions.Target", type: { text: true } },
    { displayName: "Frequency", roles: { frequency: true }, format: "#,0", isMeasure: true },
    { displayName: "Duration", roles: { duration: true }, format: "0.00", isMeasure: true },
    { displayName: "Variant", roles: { variant: true }, queryName: "Transitions.Variant", type: { text: true } },
    { displayName: "PreparedRowID", roles: { rowKey: true }, queryName: "Transitions.RowID" },
    { displayName: "Team", roles: { tooltip: true }, type: { text: true } }
  ];
  const data: powerbi.DataViewTableRow[] = rows ?? [
    ["Received", "Triage", 30, 0.5, "standard", "r0", "Support"],
    ["Triage", "Investigate", 25, 2, "standard", "r1", "Support"],
    ["Investigate", "Investigate", 5, 1.25, "standard", "r2", "Engineering"],
    ["Investigate", "Waiting", 10, 12, "follow-up", "r3", "Engineering"],
    ["Waiting", "Investigate", 10, 4, "follow-up", "r4", "Support"],
    ["Investigate", "Resolved", 20, 6, "standard", "r5", "Support"],
    ["Investigate", "Resolved", 8, 8, "follow-up", "r6", "Engineering"],
    ["Resolved", "Closed", 28, 2, "standard", "r7", "Support"]
  ];
  return {
    metadata: { columns, objects: { metrics: { statistic: "mean", unit: "hours", provenance: "Synthetic adjacent-event interval" } } },
    table: { columns, rows: data, identity: data.map((_row, index) => ({ key: `row-${index}` })) }
  };
}
