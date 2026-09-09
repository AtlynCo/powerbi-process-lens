import type powerbi from "powerbi-visuals-api";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { readDataView } from "./dataView";
import { addIssue, LIMITS } from "./model";
import { translator } from "./i18n";
import { DEFAULTS, formattingModel, readSettings, type Settings } from "./settings";
import { ProcessView } from "./view";
import "../style/visual.less";

type Host = powerbi.extensibility.visual.IVisualHost;
type SelectionId = powerbi.visuals.ISelectionId;
type Update = powerbi.extensibility.visual.VisualUpdateOptions;

function isSelectionId(id: powerbi.extensibility.ISelectionId): id is SelectionId {
  return "getKey" in id && typeof id.getKey === "function" &&
    "equals" in id && typeof id.equals === "function" &&
    "includes" in id && typeof id.includes === "function" &&
    "getSelector" in id && typeof id.getSelector === "function" &&
    "getSelectorsByColumn" in id && typeof id.getSelectorsByColumn === "function" &&
    "hasIdentity" in id && typeof id.hasIdentity === "function";
}

export class Visual implements powerbi.extensibility.visual.IVisual {
  private host: Host;
  private selection: powerbi.extensibility.ISelectionManager;
  private view: ProcessView;
  private settings: Settings = DEFAULTS;
  private ids = new Map<number, SelectionId>();
  private table?: powerbi.DataViewTable;
  private model?: ReturnType<typeof readDataView>;
  private alive = true;
  private revision = 0;
  private actionRevision = 0;

  constructor(options?: powerbi.extensibility.visual.VisualConstructorOptions) {
    if (!options) throw new Error("Process Lens requires host constructor options.");
    this.host = options.host;
    this.selection = this.host.createSelectionManager();
    const t = translator(this.host.locale || "en-US");
    const root = document.createElement("div");
    options.element.append(root);
    this.view = new ProcessView(root, t, this.host.locale || "en-US", {
      select: (rows, multi) => {
        if (!this.canSelect(rows)) { this.view.showError(t(this.host.hostCapabilities.allowInteractions === false ? "interactionsDisabled" : "selectUnavailable")); return; }
        this.interact(() => this.selection.select(this.rowIds(rows), multi));
      },
      canSelect: rows => this.canSelect(rows),
      selectionHint: () => t(this.host.hostCapabilities.allowInteractions === false ? "interactionsDisabled" : "selectUnavailable"),
      clear: () => this.interact(() => this.selection.clear()),
      menu: (rows, point) => {
        const ids = this.rowIds(rows);
        // Host accepts one menu identity, never substitute the first identity of a group.
        this.interact(() => this.selection.showContextMenu(
          ids.length === 1 && this.canSelect(rows) ? ids[0]! : {},
          { x: point[0] ?? 0, y: point[1] ?? 0 }
        ));
      },
      tooltip: (rows, dataItems, coordinates) => {
        if (this.host.tooltipService.enabled()) this.host.tooltipService.show({
          coordinates, dataItems, identities: this.rowIds(rows), isTouchEvent: false
        });
      },
      hideTooltip: () => this.host.tooltipService.hide({ immediately: true, isTouchEvent: false }),
      format: (value, role) => this.format(value, role),
      extraTooltips: rows => this.extraTooltips(rows)
    });
    this.selection.registerOnSelectCallback(() => { if (this.alive) this.syncSelection(); });
  }

  public update(options: Update): void {
    this.host.eventService.renderingStarted(options);
    try {
      if (!this.alive) throw new Error("Visual was destroyed.");
      const data = options.dataViews?.[0];
      // Resize/style-only updates may omit dataViews; data updates without rows reset state.
      if (data || (options.type & 2) !== 0 || !this.model) {
        this.revision++;
        this.settings = readSettings(data?.metadata.objects);
        this.model = readDataView(data, this.settings);
        this.ids.clear();
        const input = data?.table;
        this.table = input ? {
          columns: input.columns,
          rows: input.rows?.slice(0, LIMITS.rows),
          identity: input.identity?.slice(0, LIMITS.rows),
          identityFields: input.identityFields
        } : undefined;
        if (options.operationKind === 1 || options.operationKind === 2) {
          addIssue(this.model.issues, "segment");
          this.model.partial = true;
        }
        const accepted = new Set(this.model.edges.flatMap(edge => edge.rows));
        let missing = 0;
        for (const index of accepted) {
          if (!this.table?.identity?.[index]) { missing++; continue; }
          const identity = this.host.createSelectionIdBuilder().withTable(this.table, index).createSelectionId();
          if (identity.hasIdentity()) this.ids.set(index, identity);
          else missing++;
        }
        if (missing) addIssue(this.model.issues, "identity", missing);
      }
      const palette = this.host.colorPalette;
      if (this.model) this.view.render(this.model, this.settings, {
        highContrast: palette.isHighContrast,
        foreground: palette.isHighContrast ? palette.foreground.value : "#142F39",
        background: palette.isHighContrast ? palette.background.value : "#FFFFFF",
        accent: palette.isHighContrast ? palette.foreground.value : "#225A89"
      });
      this.syncSelection();
      this.host.eventService.renderingFinished(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown rendering error.";
      this.view.renderFailure(message);
      this.host.eventService.renderingFailed(options, message);
    }
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return formattingModel(this.settings, translator(this.host.locale || "en-US"));
  }

  private format(value: powerbi.PrimitiveValue, role: string): string {
    const column = this.table?.columns.find(column => column.roles?.[role]);
    return valueFormatter.format(value, column?.format, false, this.host.locale || "en-US");
  }

  private extraTooltips(rows: number[]): powerbi.extensibility.VisualTooltipDataItem[] {
    if (!this.table) return [];
    const table = this.table;
    const t = translator(this.host.locale || "en-US");
    return table.columns.flatMap((column, index) => {
      if (!column.roles?.tooltip) return [];
      const values = new Set<string>();
      for (const row of rows) {
        const value = table.rows?.[row]?.[index];
        values.add(valueFormatter.format(value, column.format, false, this.host.locale || "en-US").slice(0, 300));
        if (values.size > 4) break;
      }
      return [{ displayName: column.displayName.slice(0, 120), value: values.size > 4 ? t("mixed") : [...values].join("; ") }];
    }).slice(0, 6);
  }

  private rowIds(rows: number[]): SelectionId[] {
    const distinct = new Map<string, SelectionId>();
    for (const row of rows) {
      const id = this.ids.get(row);
      if (id) distinct.set(id.getKey(), id);
    }
    return [...distinct.values()];
  }
  private canSelect(rows: number[]): boolean {
    return this.host.hostCapabilities.allowInteractions !== false && rows.length > 0 && rows.every(index => this.ids.has(index));
  }
  private syncSelection(): void {
    const selected = this.selection.getSelectionIds().filter(isSelectionId);
    const rows = new Set<number>();
    for (const [index, id] of this.ids) {
      if (selected.some(selection => selection.equals(id) || selection.includes(id))) rows.add(index);
    }
    this.view.updateSelection(rows);
  }
  private interact<T>(action: () => powerbi.IPromise<T>): void {
    if (this.host.hostCapabilities.allowInteractions === false) {
      this.view.showError(translator(this.host.locale || "en-US")("interactionsDisabled"));
      return;
    }
    const revision = this.revision;
    const actionRevision = ++this.actionRevision;
    const current = () => this.alive && revision === this.revision && actionRevision === this.actionRevision;
    new Promise<T>((resolve, reject) => {
      action().then(value => { resolve(value); }, reason => { reject(reason); });
    }).then(() => {
      if (current()) { this.view.showError(""); this.syncSelection(); }
    }, error => {
      if (current()) this.view.showError(`${translator(this.host.locale || "en-US")("actionError")}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  public destroy(): void {
    this.alive = false;
    this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
    this.view.destroy();
    this.ids.clear();
    this.table = undefined;
    this.model = undefined;
  }
}
