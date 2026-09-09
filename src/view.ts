import type powerbi from "powerbi-visuals-api";
import { activityRows, graphView, type Edge, type FocusMode, type GraphView, type ProcessModel } from "./model";
import { layoutGraph } from "./layout";
import { isRtl, type Translate } from "./i18n";
import type { Settings } from "./settings";
import { THIRD_PARTY_NOTICES } from "./notices";

type Tooltip = powerbi.extensibility.VisualTooltipDataItem;
export interface Actions {
  select(rows: number[], multi: boolean): void;
  canSelect(rows: number[]): boolean;
  selectionHint(): string;
  clear(): void;
  menu(rows: number[], point: number[]): void;
  tooltip(rows: number[], items: Tooltip[], point: number[]): void;
  hideTooltip(): void;
  format(value: powerbi.PrimitiveValue, role: string): string;
  extraTooltips(rows: number[]): Tooltip[];
}
export interface Theme { foreground: string; background: string; accent: string; highContrast: boolean }
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

export class ProcessView {
  private model?: ProcessModel;
  private settings?: Settings;
  private theme?: Theme;
  private variant: string | null = null;
  private focus: string | null = null;
  private mode: FocusMode = "all";
  private query = "";
  private overlay = "frequency";
  private zoom = 1;
  private visible?: GraphView;
  private content = element("div");
  private message = element("p");
  private selections = new Set<number>();
  private openDetails = new Set<string>();

  constructor(private root: HTMLElement, private t: Translate, private locale: string, private actions: Actions) {
    root.className = "process-lens";
    root.dir = isRtl(locale) ? "rtl" : "ltr";
    root.setAttribute("aria-label", t("title"));
  }

  render(model: ProcessModel, settings: Settings, theme: Theme): void {
    this.model = model;
    this.settings = settings;
    this.theme = theme;
    if (this.variant !== null && !model.variants.includes(this.variant)) this.variant = null;
    if (this.focus !== null && !model.nodes.includes(this.focus)) this.focus = null;
    if (!model.hasDuration) this.overlay = "frequency";
    const active = document.activeElement;
    const focusKey = active instanceof HTMLElement && this.root.contains(active) ? active.dataset.focus : undefined;
    const selectionStart = active instanceof HTMLInputElement ? active.selectionStart : null;
    const selectionEnd = active instanceof HTMLInputElement ? active.selectionEnd : null;
    const rootScroll = { top: this.root.scrollTop, left: this.root.scrollLeft };
    const scrollPositions = [...this.root.querySelectorAll<HTMLElement>("[data-scroll]")].map(node => ({
      key: node.dataset.scroll, top: node.scrollTop, left: node.scrollLeft
    }));
    this.openDetails = new Set([...this.root.querySelectorAll<HTMLDetailsElement>("details[data-detail][open]")].map(node => node.dataset.detail ?? ""));
    this.actions.hideTooltip();
    this.root.replaceChildren();
    this.root.classList.toggle("high-contrast", theme.highContrast);
    this.root.style.setProperty("--fg", theme.foreground);
    this.root.style.setProperty("--bg", theme.background);
    this.root.style.setProperty("--accent", theme.accent);
    this.root.style.setProperty("--edge", theme.highContrast ? theme.foreground : settings.edgeColor);
    this.root.style.setProperty("--node", theme.highContrast ? theme.foreground : settings.nodeColor);
    const heading = element("header");
    heading.append(element("h2", this.t("title")), element("span", this.t("subtitle")));
    this.root.append(heading);
    this.controls(model);
    const summary = element("p", `${this.t("received")}: ${model.receivedRows} | ${this.t("accepted")}: ${model.acceptedRows} | ${this.t("activities")}: ${model.nodes.length}`, "summary");
    this.root.append(summary, element("p", model.partial ? this.t("partial") : this.t("complete"), model.partial ? "completeness partial" : "completeness"));
    const metric = model.hasDuration
      ? `${this.t("duration")}: ${model.metric.statistic || this.t("unspecified")} / ${model.metric.unit || this.t("unspecified")}. ${this.t("provenance")}: ${model.metric.provenance || this.t("unspecified")}`
      : `${this.t("duration")}: ${this.t("unbound")}`;
    this.root.append(element("p", metric, "provenance"));
    this.message = element("p", "", "interaction-error");
    this.message.setAttribute("role", "alert");
    this.root.append(this.message);
    this.content = element("div");
    this.root.append(this.content);
    this.renderContent();
    this.root.append(element("p", this.t("local"), "note"), element("p", this.t("limitations"), "note"));
    const legal = element("details", undefined, "legal");
    legal.dataset.detail = "legal";
    legal.open = this.openDetails.has("legal");
    const legalSummary = element("summary", this.t("notices"));
    legalSummary.dataset.focus = "legal";
    const legalText = element("pre", THIRD_PARTY_NOTICES);
    legalText.tabIndex = 0;
    legalText.setAttribute("aria-label", this.t("notices"));
    legalText.dataset.focus = "legal-text";
    legal.append(legalSummary, legalText);
    this.root.append(legal);
    for (const position of scrollPositions) {
      const node = [...this.root.querySelectorAll<HTMLElement>("[data-scroll]")].find(node => node.dataset.scroll === position.key);
      node?.scrollTo({ top: position.top, left: position.left });
    }
    this.root.scrollTo(rootScroll);
    if (focusKey) {
      const replacement = [...this.root.querySelectorAll<HTMLElement>("[data-focus]")].find(node => node.dataset.focus === focusKey);
      (replacement ?? this.root.querySelector<HTMLElement>('[data-focus="activity"]'))?.focus({ preventScroll: true });
      if (replacement instanceof HTMLInputElement && replacement.type === "search" && selectionStart !== null) {
        replacement.setSelectionRange(selectionStart, selectionEnd);
      }
    }
  }

  private button(text: string, key: string, action: (event: MouseEvent) => void): HTMLButtonElement {
    const button = element("button", text);
    button.type = "button";
    button.dataset.focus = key;
    button.addEventListener("click", action);
    return button;
  }

  private dropdown(label: string, key: string, values: [string, string][], value: string, change: (value: string) => void): HTMLLabelElement {
    const wrapper = element("label", label);
    const select = element("select");
    select.dataset.focus = key;
    for (const [id, text] of values) {
      const option = element("option", text);
      option.value = id;
      select.append(option);
    }
    select.value = value;
    select.addEventListener("change", () => change(select.value));
    wrapper.append(select);
    return wrapper;
  }

  private controls(model: ProcessModel): void {
    const controls = element("div", undefined, "controls");
    const searchLabel = element("label", this.t("search"));
    const search = element("input");
    search.type = "search";
    search.maxLength = 120;
    search.value = this.query;
    search.dataset.focus = "search";
    search.addEventListener("input", () => { this.query = search.value; this.emphasizeSearch(); });
    searchLabel.append(search);
    controls.append(searchLabel, this.dropdown(this.t("activity"), "activity",
      [["", this.t("allActivities")], ...model.nodes.map((id, index): [string, string] => [String(index), id])],
      this.focus === null ? "" : String(model.nodes.indexOf(this.focus)),
      value => { this.focus = value === "" ? null : model.nodes[Number(value)] ?? null; this.refresh(); }));
    controls.append(this.dropdown(this.t("traversal"), "traversal",
      (["all", "neighbors", "upstream", "downstream"] as const).map(mode => [mode, this.t(mode)]),
      this.mode, value => { if (value === "all" || value === "neighbors" || value === "upstream" || value === "downstream") this.mode = value; this.refresh(); }));
    if (model.hasVariant) {
      controls.append(this.dropdown(this.t("variant"), "variant",
        [["", this.t("allVariants")], ...model.variants.map((id, index): [string, string] => [String(index), id || this.t("blank")])],
        this.variant === null ? "" : String(model.variants.indexOf(this.variant)),
        value => { this.variant = value === "" ? null : model.variants[Number(value)] ?? null; this.refresh(); }));
      const variantRows = model.edges.filter(edge => this.variant === null || edge.variant === this.variant).flatMap(edge => edge.rows);
      const selectVariant = this.button(this.t("selectVariant"), "selectVariant", event => this.actions.select(variantRows, event.ctrlKey || event.metaKey));
      selectVariant.disabled = this.variant === null || !this.actions.canSelect(variantRows);
      controls.append(selectVariant);
    }
    controls.append(this.dropdown(this.t("overlay"), "overlay",
      model.hasDuration ? [["frequency", this.t("frequency")], ["duration", this.t("duration")]] : [["frequency", this.t("frequency")]],
      this.overlay, value => { this.overlay = value; this.refresh(); }));
    controls.append(this.button(this.t("clear"), "clear", () => this.actions.clear()));
    controls.append(this.button(this.t("reset"), "reset", () => {
      this.variant = null; this.focus = null; this.mode = "all"; this.query = ""; this.zoom = 1;
      this.refresh();
    }));
    this.root.append(controls);
  }

  private refresh(): void {
    if (this.model && this.settings && this.theme) this.render(this.model, this.settings, this.theme);
  }

  private renderContent(): void {
    const model = this.model;
    if (!model) return;
    this.visible = graphView(model, this.variant, this.focus, this.mode);
    const issues = [...model.issues, ...this.visible.issues];
    this.content.replaceChildren();
    if (model.hasVariant && this.variant === null) this.content.append(element("p", this.t("aggregate"), "note"));
    if (issues.length) {
      const diagnostics = element("details", undefined, "diagnostics");
      diagnostics.open = true;
      diagnostics.append(element("summary", `${this.t("diagnostics")} (${issues.length})`));
      const list = element("ul");
      for (const issue of issues) {
        const item = element("li", `${this.t(issue.code)} [${issue.count}]`);
        item.dataset.issue = issue.code;
        list.append(item);
      }
      diagnostics.append(list);
      this.content.append(diagnostics);
    }
    this.content.append(element("p", `${this.t("shown")}: ${this.visible.edges.length}. ${this.t("noCases")}.`, "summary"));
    if (!this.visible.edges.length) {
      this.content.append(element("p", this.t("empty"), "empty"));
      return;
    }
    const body = element("div", undefined, "lens-body");
    body.append(this.drawGraph(model, this.visible), this.drawDetails(this.visible));
    this.content.append(body);
    this.updateSelection(this.selections);
    this.emphasizeSearch();
  }

  private edgeLabel(edge: Edge): string {
    const value = this.overlay === "duration" ? edge.duration : edge.frequency;
    const formatted = value === null ? this.t("unavailable") : this.actions.format(value, this.overlay);
    return this.overlay === "duration" && value !== null ? `${formatted} ${this.model?.metric.unit ?? ""}` : formatted;
  }

  private edgeTooltip(edge: Edge): Tooltip[] {
    const model = this.model;
    const duration = edge.duration === null
      ? this.t(edge.durationReason ?? (model?.hasDuration ? "unavailable" : "unbound"))
      : `${this.actions.format(edge.duration, "duration")} ${model?.metric.unit ?? ""} (${model?.metric.statistic ?? ""})`;
    return [
      { displayName: this.t("source"), value: edge.source },
      { displayName: this.t("target"), value: edge.target },
      { displayName: this.t("frequency"), value: edge.frequency === null ? this.t("overflow") : this.actions.format(edge.frequency, "frequency") },
      { displayName: this.t("duration"), value: duration },
      { displayName: this.t("rows"), value: String(edge.rows.length) },
      ...this.actions.extraTooltips(edge.rows)
    ];
  }

  private bindRepresentation(node: HTMLElement | SVGElement, rows: number[], tooltip: Tooltip[]): void {
    node.dataset.rows = JSON.stringify(rows);
    node.addEventListener("click", event => {
      if (event instanceof MouseEvent) this.actions.select(rows, event.ctrlKey || event.metaKey);
    });
    node.addEventListener("contextmenu", event => {
      event.preventDefault();
      if (event instanceof MouseEvent) this.actions.menu(rows, this.coordinates(event.clientX, event.clientY));
    });
    node.addEventListener("keydown", event => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        const bounds = node.getBoundingClientRect();
        this.actions.menu(rows, this.coordinates(bounds.left, bounds.bottom));
      }
    });
    node.addEventListener("pointerenter", event => {
      if (event instanceof MouseEvent) this.actions.tooltip(rows, tooltip, this.coordinates(event.clientX, event.clientY));
    });
    node.addEventListener("pointerleave", () => this.actions.hideTooltip());
    node.addEventListener("focus", () => {
      const bounds = node.getBoundingClientRect();
      this.actions.tooltip(rows, tooltip, this.coordinates(bounds.left, bounds.bottom));
    });
    node.addEventListener("blur", () => this.actions.hideTooltip());
    if (node instanceof HTMLButtonElement) {
      node.disabled = !this.actions.canSelect(rows);
      if (node.disabled) node.title = this.actions.selectionHint();
    }
  }

  private coordinates(x: number, y: number): number[] {
    const bounds = this.root.getBoundingClientRect();
    return [x - bounds.left, y - bounds.top];
  }

  private drawGraph(model: ProcessModel, visible: GraphView): HTMLElement {
    const section = element("section", undefined, "graph-section");
    section.setAttribute("aria-label", this.t("graph"));
    section.append(element("h3", this.t("graph")));
    const zoomLabel = element("label", this.t("zoom"));
    const zoom = element("input");
    zoom.type = "range"; zoom.min = "0.5"; zoom.max = "12"; zoom.step = "0.1"; zoom.value = String(this.zoom);
    zoom.dataset.focus = "zoom";
    zoomLabel.append(zoom);
    section.append(zoomLabel);
    const scroll = element("div", undefined, "graph-scroll");
    scroll.tabIndex = 0;
    scroll.dataset.scroll = "graph";
    scroll.dataset.focus = "graph-scroll";
    scroll.setAttribute("aria-label", this.t("graph"));
    const layout = layoutGraph(model.nodes, visible.edges);
    const image = svg("svg", { viewBox: `0 0 ${layout.width} ${layout.height}`, "aria-hidden": "true", class: "process-graph" });
    image.classList.toggle("small-graph", model.nodes.length <= 15);
    const overviewSize = Math.min(380, Math.max(120, this.root.clientWidth - 28));
    const resize = () => {
      image.style.width = `${overviewSize * this.zoom}px`;
      image.style.height = `${overviewSize * this.zoom}px`;
    };
    resize();
    zoom.addEventListener("input", () => { this.zoom = Number(zoom.value); resize(); });
    const available = visible.edges.map(edge => this.overlay === "duration" ? edge.duration : edge.frequency).filter(value => value !== null);
    const maximum = Math.max(0, ...available);
    const scaleMaximum = Math.max(1, maximum);
    // Arrow polygons are per edge: no global SVG IDs to collide across visual instances.
    for (const edge of visible.edges) {
      const position = layout.edges.find(value => value.key === edge.key);
      if (!position) continue;
      const group = svg("g", { class: "edge", "data-key": edge.key });
      const metric = this.overlay === "duration" ? edge.duration : edge.frequency;
      const path = svg("path", { d: position.path, class: "edge-line", "stroke-width": 1.5 + 7 * (metric ?? 0) / scaleMaximum });
      if (metric === null || metric === 0) path.setAttribute("stroke-dasharray", "5 4");
      const hit = svg("path", { d: position.path, class: "edge-hit", "stroke-width": 16 });
      group.append(path, hit);
      if (this.settings?.showLabels) {
        group.append(svg("text", { x: position.label.x, y: position.label.y, class: "edge-label", "text-anchor": "middle" }, this.edgeLabel(edge)));
      }
      this.bindRepresentation(group, edge.rows, this.edgeTooltip(edge));
      image.append(group);
    }
    const nodeSet = new Set(visible.nodes);
    for (const node of layout.nodes.filter(node => nodeSet.has(node.id))) {
      const group = svg("g", { class: "activity", transform: `translate(${node.x} ${node.y})` });
      group.dataset.activity = node.id;
      group.classList.toggle("focused", node.id === this.focus);
      group.append(svg("circle", { r: 25 }), svg("text", { y: 4, "text-anchor": "middle", class: "node-number" }, String(model.nodes.indexOf(node.id) + 1)));
      group.append(svg("text", { y: 43, "text-anchor": "middle", class: "node-label" }, node.id.length > 20 ? `${node.id.slice(0, 18)}...` : node.id));
      const rows = activityRows(visible.edges, node.id);
      this.bindRepresentation(group, rows, [{ displayName: this.t("activity"), value: node.id }, { displayName: this.t("incident"), value: String(rows.length) }]);
      image.append(group);
    }
    scroll.append(image);
    section.append(scroll, element("p", `${this.t("legend")} ${this.t("overlay")}: ${this.t(this.overlay === "duration" ? "duration" : "frequency")}; max ${available.length ? this.actions.format(maximum, this.overlay) : this.t("unavailable")}${this.overlay === "duration" ? ` ${model.metric.unit}` : ""}.`, "legend"));
    // SVG path length is computed once, synchronously, before renderingFinished.
    this.content.append(section);
    for (const path of image.querySelectorAll<SVGPathElement>(".edge-line")) {
      const length = path.getTotalLength();
      const end = path.getPointAtLength(length);
      const prior = path.getPointAtLength(Math.max(0, length - 8));
      const angle = Math.atan2(end.y - prior.y, end.x - prior.x) * 180 / Math.PI;
      path.parentElement?.append(svg("path", {
        d: "M 0 0 L -11 -5 L -11 5 Z", class: "edge-arrow",
        transform: `translate(${end.x} ${end.y}) rotate(${angle})`
      }));
    }
    return section;
  }

  private drawDetails(visible: GraphView): HTMLElement {
    const section = element("section", undefined, "data-section");
    section.setAttribute("aria-label", this.t("details"));
    section.append(element("h3", this.t("details")), element("p", this.t("aggregateMenu"), "note"));
    const activities = element("details");
    activities.dataset.detail = "activities";
    activities.open = this.openDetails.has("activities");
    const activitySummary = element("summary", `${this.t("activities")} (${visible.nodes.length})`);
    activitySummary.dataset.focus = "activities-summary";
    activities.append(activitySummary);
    const list = element("ul", undefined, "activities-list");
    list.dataset.scroll = "activities";
    for (const activity of visible.nodes) {
      const item = element("li");
      item.dataset.activity = activity;
      item.append(element("strong", activity));
      item.append(this.button(this.t("focus"), `focus:${activity}`, () => {
        this.focus = activity; this.mode = "neighbors"; this.refresh();
        this.root.querySelector<HTMLSelectElement>('[data-focus="activity"]')?.focus();
      }));
      const button = this.button(this.t("select"), `node:${activity}`, () => { /* Selection is bound with native tooltip/context handling. */ });
      const rows = activityRows(visible.edges, activity);
      this.bindRepresentation(button, rows, [{ displayName: this.t("activity"), value: activity }, { displayName: this.t("incident"), value: String(rows.length) }]);
      item.append(button);
      list.append(item);
    }
    activities.append(list);
    section.append(activities);
    const scroll = element("div", undefined, "table-scroll");
    scroll.tabIndex = 0;
    scroll.dataset.scroll = "table";
    scroll.dataset.focus = "table-scroll";
    scroll.setAttribute("aria-label", this.t("transitions"));
    const table = element("table");
    const caption = element("caption", this.t("transitions"));
    const head = element("thead");
    const heading = element("tr");
    for (const label of ["source", "target", "frequency", "duration", "rows"] as const) {
      const cell = element("th", this.t(label));
      cell.scope = "col";
      heading.append(cell);
    }
    head.append(heading);
    const body = element("tbody");
    for (const edge of visible.edges) {
      const row = element("tr");
      row.dataset.edge = edge.key;
      row.append(element("td", edge.source), element("td", edge.target),
        element("td", edge.frequency === null ? this.t("overflow") : this.actions.format(edge.frequency, "frequency")),
        element("td", edge.duration === null
          ? this.t(edge.durationReason ?? (this.model?.hasDuration ? "unavailable" : "unbound"))
          : `${this.actions.format(edge.duration, "duration")} ${this.model?.metric.unit ?? ""} (${this.model?.metric.statistic ?? ""})`));
      const actions = element("td");
      const select = this.button(`${this.t("select")} (${edge.rows.length})`, `edge:${edge.key}`, () => {});
      this.bindRepresentation(select, edge.rows, this.edgeTooltip(edge));
      actions.append(select);
      const detail = element("details");
      detail.dataset.detail = edge.key;
      detail.open = this.openDetails.has(edge.key);
      const summary = element("summary", this.t("rows"));
      summary.dataset.focus = `rows:${edge.key}`;
      detail.append(summary);
      const populateRows = () => {
        if (!detail.open || detail.childElementCount > 1) return;
        const rows = element("ul");
        for (const index of edge.rows) {
          const item = element("li");
          const label = `${this.t("row")} ${index + 1}`;
          const button = this.button(label, `row:${index}`, () => {});
          this.bindRepresentation(button, [index], this.actions.extraTooltips([index]));
          item.append(button);
          item.append(this.button(this.t("menu"), `menu:${index}`, event => {
            const bounds = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : this.root.getBoundingClientRect();
            this.actions.menu([index], this.coordinates(bounds.left, bounds.bottom));
          }));
          for (const tooltip of this.actions.extraTooltips([index])) item.append(element("span", ` ${tooltip.displayName}: ${tooltip.value}`));
          rows.append(item);
        }
        detail.append(rows);
        this.updateSelection(this.selections);
      };
      detail.addEventListener("toggle", populateRows);
      populateRows();
      actions.append(detail);
      row.append(actions);
      body.append(row);
    }
    table.append(caption, head, body);
    scroll.append(table);
    section.append(scroll);
    return section;
  }

  private emphasizeSearch(): void {
    const search = this.query.toLocaleLowerCase(this.locale);
    for (const node of this.root.querySelectorAll<HTMLElement | SVGElement>("[data-activity]")) {
      const matches = !search || (node.dataset.activity ?? "").toLocaleLowerCase(this.locale).includes(search);
      node.classList.toggle("search-muted", !matches);
      if (node instanceof HTMLLIElement) node.hidden = !matches;
    }
  }

  updateSelection(rows: Set<number>): void {
    this.selections = rows;
    for (const node of this.root.querySelectorAll<HTMLElement | SVGElement>("[data-rows]")) {
      const indices: number[] = JSON.parse(node.dataset.rows ?? "[]");
      const selected = indices.some(index => rows.has(index));
      node.classList.toggle("selected", selected);
      node.classList.toggle("muted", rows.size > 0 && !selected);
      if (node instanceof HTMLButtonElement) node.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  }
  showError(message: string): void { this.message.textContent = message; }
  renderFailure(message: string): void {
    this.actions.hideTooltip();
    this.root.replaceChildren(element("p", `${this.t("error")}: ${message}`, "fatal"));
    this.root.firstElementChild?.setAttribute("role", "alert");
  }
  destroy(): void { this.root.replaceChildren(); this.model = undefined; }
}
