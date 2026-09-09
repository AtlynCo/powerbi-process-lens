import type powerbi from "powerbi-visuals-api";
import { activityRows, graphView, type Edge, type FocusMode, type GraphView, type ProcessModel } from "./model";
import { layoutGraph, NODE_SIZE, type EdgePosition, type Layout } from "./layout";
import { isRtl, type Translate } from "./i18n";
import type { Settings } from "./settings";
import { THIRD_PARTY_NOTICES } from "./notices";
import { MAX_ZOOM, type Navigation } from "./navigation";

type Tooltip = powerbi.extensibility.VisualTooltipDataItem;
export interface Actions {
  select(rows: number[], multi: boolean): void;
  canSelect(rows: number[]): boolean;
  selectionHint(): string;
  clear(): void;
  menu(rows: number[], point: number[]): void;
  tooltip(rows: number[], items: Tooltip[], point: number[], touch?: boolean): void;
  hideTooltip(): void;
  format(value: powerbi.PrimitiveValue, role: string): string;
  extraTooltips(rows: number[]): Tooltip[];
  persist(navigation: Navigation): void;
  expand(): void;
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
  private panel: "graph" | "table" = "graph";
  private visible?: GraphView;
  private content = element("div");
  private message = element("p");
  private selections = new Set<number>();
  private openDetails = new Set<string>();
  private rowMappings = new WeakMap<HTMLElement | SVGElement, number[]>();
  private viewport = { width: 1280, height: 620 };
  private interactionError = "";
  private layoutSignature = "";
  private cachedLayout?: Layout;
  private cachedRoutes = new Map<string, EdgePosition>();

  constructor(private root: HTMLElement, private t: Translate, private locale: string, private actions: Actions) {
    root.className = "process-lens";
    root.dir = isRtl(locale) ? "rtl" : "ltr";
    root.setAttribute("aria-label", t("title"));
    root.textContent = t("awaiting");
    root.addEventListener("contextmenu", event => {
      if (!event.defaultPrevented) { event.preventDefault(); this.actions.menu([], this.coordinates(event.clientX, event.clientY)); }
    });
  }

  setViewport(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error("Invalid host viewport dimensions.");
    this.viewport = { width: Math.max(0, width), height: Math.max(0, height) };
    this.root.style.width = `${this.viewport.width}px`;
    this.root.style.height = `${this.viewport.height}px`;
    this.root.classList.toggle("compact", width < 600 || height < 450);
    this.root.classList.toggle("micro", width < 180 || height < 140);
  }
  restoreNavigation(state: Navigation): void {
    this.query = state.query; this.focus = state.focus; this.variant = state.variant;
    this.mode = state.mode; this.overlay = state.overlay; this.zoom = state.zoom; this.panel = state.panel;
  }
  private persist(): void {
    this.actions.persist({ query: this.query, focus: this.focus, variant: this.variant, mode: this.mode, overlay: this.overlay === "duration" ? "duration" : "frequency", zoom: this.zoom, panel: this.panel });
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
    heading.append(element("h2", this.t("shortTitle")), element("span", this.t("subtitle")));
    this.root.append(heading);
    if (this.viewport.width < 180 || this.viewport.height < 140) {
      this.root.append(element("p", `${model.nodes.length} ${this.t("activities")}`, "summary"),
        element("p", model.partial ? this.t("incomplete") : this.t("microReceived"), model.partial ? "completeness partial" : "completeness"));
      const expand = this.button(this.t("expand"), "expand", () => this.actions.expand());
      expand.setAttribute("aria-label", this.t("enlarge"));
      this.message = element("p", this.interactionError, "interaction-error");
      this.message.setAttribute("role", "alert");
      this.root.append(expand, this.message);
      return;
    }
    const compact = this.viewport.width < 600 || this.viewport.height < 450;
    const summary = element("p", `${this.t("accepted")}: ${model.acceptedRows}/${model.receivedRows} | ${this.t("activities")}: ${model.nodes.length}`, "summary");
    const completeness = element("p", model.partial ? this.t("partialShort") : this.t(compact ? "microReceived" : "complete"), model.partial ? "completeness partial" : "completeness");
    completeness.title = model.partial ? this.t("partial") : this.t("complete");
    this.root.append(summary, completeness);
    if (this.variant !== null || this.focus !== null) {
      this.root.append(element("p", [
        this.variant !== null ? `${this.t("variant")}: ${this.variant || this.t("blank")}` : "",
        this.focus !== null ? `${this.t("activity")}: ${this.focus} / ${this.t(this.mode)}` : ""
      ].filter(Boolean).join(" | "), "local-context"));
    }
    if (model.edges.length) this.controls(model);
    const metric = model.hasDuration
      ? `${this.t("duration")}: ${model.metric.statistic || this.t("unspecified")} / ${model.metric.unit || this.t("unspecified")}. ${this.t("provenance")}: ${model.metric.provenance || this.t("unspecified")}`
      : `${this.t("duration")}: ${this.t("unbound")}`;
    this.root.append(element("p", compact && model.hasDuration ? `${this.t("duration")}: ${model.metric.statistic || this.t("unspecified")} / ${model.metric.unit || this.t("unspecified")}` : metric, "provenance"));
    this.message = element("p", this.interactionError, "interaction-error");
    this.message.setAttribute("role", "alert");
    this.root.append(this.message);
    this.content = element("div");
    this.root.append(this.content);
    this.renderContent();
    const interpretation = element("details", undefined, "interpretation");
    interpretation.dataset.detail = "interpretation";
    interpretation.open = this.openDetails.has("interpretation");
    const explanation = element("summary", this.t("inspect"));
    explanation.dataset.focus = "interpretation";
    interpretation.append(explanation, element("p", metric), element("p", this.t("local"), "note"), element("p", this.t("limitations"), "note"), element("p", this.t("touchMenu"), "note"));
    this.root.append(interpretation);
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
      (replacement ?? this.root.querySelector<HTMLElement>('[data-focus="explore"], .empty, .first-run'))?.focus({ preventScroll: true });
      if (replacement instanceof HTMLInputElement && replacement.type === "search" && selectionStart !== null) {
        replacement.setSelectionRange(selectionStart, selectionEnd);
      }
    }
  }

  private button(text: string, key: string, action?: (event: MouseEvent) => void): HTMLButtonElement {
    const button = element("button", text);
    button.type = "button";
    button.dataset.focus = key;
    if (action) button.addEventListener("click", action);
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
    select.addEventListener("change", () => { change(select.value); this.persist(); });
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
    search.addEventListener("change", () => this.persist());
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
        [["", this.t("allVariants")], ...model.variants.map((id, index): [string, string] => [String(index), id === this.t("blank") ? `"${id}"` : id || this.t("blank")])],
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
      this.refresh(); this.persist();
    }));
    const disclosure = element("details", undefined, "controls-panel");
    disclosure.dataset.detail = "controls";
    disclosure.open = this.openDetails.has("controls");
    const summary = element("summary", this.t("explore"));
    summary.dataset.focus = "explore";
    disclosure.append(summary, controls);
    this.root.append(disclosure);
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
    if (model.hasVariant && this.variant === null) this.content.append(element("p", this.t("aggregate"), "aggregate-note"));
    if (issues.length) {
      const diagnostics = element("details", undefined, "diagnostics");
      diagnostics.dataset.detail = "diagnostics";
      diagnostics.open = this.openDetails.has("diagnostics");
      const summary = element("summary", `${this.t("diagnostics")} (${issues.length})`);
      summary.dataset.focus = "diagnostics";
      diagnostics.append(summary);
      const list = element("ul");
      for (const issue of issues) {
        const item = element("li", `${this.t(issue.code)} [${issue.count}]`);
        item.dataset.issue = issue.code;
        list.append(item);
      }
      diagnostics.append(list);
      this.content.append(diagnostics);
    }
    const available = this.visible.edges.filter(edge => edge.duration !== null).length;
    this.content.append(element("p", `${this.t("shown")}: ${this.visible.edges.length}${model.hasDuration ? ` | ${this.t("durationAvailable")}: ${available}/${this.visible.edges.length}` : ""}.`, "view-summary"));
    if (!this.visible.edges.length) {
      const guide = element("p", model.issues.some(issue => issue.code === "binding") ? this.t("firstRun") : model.receivedRows === 0 ? this.t("noRows") : this.t("empty"), model.issues.some(issue => issue.code === "binding") ? "first-run" : "empty");
      guide.tabIndex = -1;
      this.content.append(guide);
      return;
    }
    const tabs = element("div", undefined, "panel-tabs");
    for (const panel of ["graph", "table"] as const) {
      const button = this.button(this.t(panel === "graph" ? "graphPanel" : "tablePanel"), `panel:${panel}`, () => {
        this.panel = panel; this.refresh(); this.persist();
      });
      button.setAttribute("aria-pressed", String(this.panel === panel));
      tabs.append(button);
    }
    this.content.append(tabs, element("p", this.t("enlarge"), "micro-guidance"));
    const body = element("div", undefined, "lens-body");
    const graph = this.drawGraph(model, this.visible), details = this.drawDetails(this.visible);
    graph.hidden = this.panel !== "graph"; details.hidden = this.panel !== "table";
    body.append(graph, details);
    this.content.append(body);
    this.updateSelection(this.selections);
    this.emphasizeSearch();
  }

  private edgeLabel(edge: Edge): string {
    const value = this.overlay === "duration" ? edge.duration : edge.frequency;
    const formatted = value === null ? this.t("shortUnavailable") : this.actions.format(value, this.overlay);
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

  private bindRepresentation(node: HTMLElement | SVGElement, rows: number[], tooltip: Tooltip[], select = true): void {
    node.dataset.rows = JSON.stringify(rows);
    this.rowMappings.set(node, rows);
    if (select) node.addEventListener("click", event => {
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
      if (event instanceof PointerEvent && event.pointerType !== "touch") this.actions.tooltip(rows, tooltip, this.coordinates(event.clientX, event.clientY));
    });
    node.addEventListener("pointerdown", event => {
      if (event instanceof PointerEvent && event.pointerType === "touch") this.actions.tooltip(rows, tooltip, this.coordinates(event.clientX, event.clientY), true);
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
    return [Math.max(0, Math.min(bounds.width, x - bounds.left)), Math.max(0, Math.min(bounds.height, y - bounds.top))];
  }

  private drawGraph(model: ProcessModel, visible: GraphView): HTMLElement {
    const section = element("section", undefined, "graph-section");
    section.setAttribute("aria-label", this.t("graph"));
    section.append(element("h3", this.t("graph")));
    if (model.nodes.length > 20 || visible.edges.length > 60) section.append(element("p", this.t(this.viewport.width < 600 ? "denseShort" : "dense"), "dense-note"));
    const zoomLabel = element("label", this.t("zoom"));
    const zoom = element("input");
    zoom.type = "range"; zoom.min = "0.5"; zoom.max = String(MAX_ZOOM); zoom.step = "0.1"; zoom.value = String(this.zoom);
    zoom.dataset.focus = "zoom";
    zoomLabel.append(zoom);
    if (this.viewport.width < 600 || this.viewport.height < 450) this.root.querySelector(".controls")?.append(zoomLabel);
    else section.append(zoomLabel);
    const scroll = element("div", undefined, "graph-scroll");
    scroll.tabIndex = 0;
    scroll.dataset.scroll = "graph";
    scroll.dataset.focus = "graph-scroll";
    scroll.setAttribute("aria-label", this.t("graph"));
    const signature = JSON.stringify([model.nodes, model.edges.map(edge => [edge.source, edge.target])]);
    if (signature !== this.layoutSignature || !this.cachedLayout) {
      this.cachedLayout = layoutGraph(model.nodes, graphView(model, null, null, "all").edges, model.edges);
      this.cachedRoutes = new Map(this.cachedLayout.edges.map(edge => [edge.key, edge]));
      this.layoutSignature = signature;
    }
    const layout = this.cachedLayout;
    const image = svg("svg", { viewBox: `0 0 ${layout.width} ${layout.height}`, "aria-hidden": "true", class: "process-graph" });
    scroll.append(image);
    section.append(scroll);
    this.content.append(section);
    const availableHeight = Math.max(72, Math.min(520, this.viewport.height - (scroll.getBoundingClientRect().top - this.root.getBoundingClientRect().top) - 36));
    scroll.style.height = `${availableHeight}px`;
    const fit = Math.max(model.nodes.length <= 15 ? 0.65 : 0.05, Math.min(1.25, Math.max(32, scroll.clientWidth - 16) / layout.width, Math.max(32, availableHeight - 16) / layout.height));
    scroll.style.height = `${Math.min(availableHeight, Math.max(72, layout.height * fit + 16))}px`;
    const resize = () => {
      image.style.width = `${layout.width * fit * this.zoom}px`;
      image.style.height = `${layout.height * fit * this.zoom}px`;
    };
    resize();
    zoom.addEventListener("input", () => { this.zoom = Number(zoom.value); resize(); });
    zoom.addEventListener("change", () => this.persist());
    const available = visible.edges.map(edge => this.overlay === "duration" ? edge.duration : edge.frequency).filter(value => value !== null);
    const maximum = Math.max(0, ...available);
    const scaleMaximum = Math.max(1, maximum);
    // Arrow polygons are per edge: no global SVG IDs to collide across visual instances.
    for (const edge of visible.edges) {
      const position = this.cachedRoutes.get(edge.key);
      if (!position) continue;
      const group = svg("g", { class: "edge", "data-key": edge.key });
      const metric = this.overlay === "duration" ? edge.duration : edge.frequency;
      const path = svg("path", { d: position.path, class: "edge-line", "stroke-width": 1.5 + 7 * ((metric ?? 0) / scaleMaximum) });
      if (metric === null || metric === 0) path.setAttribute("stroke-dasharray", "5 4");
      const hit = svg("path", { d: position.path, class: "edge-hit", "stroke-width": 16 });
      group.append(path, hit, svg("path", {
        d: "M 0 0 L -11 -5 L -11 5 Z", class: "edge-arrow",
        transform: `translate(${position.arrow.x} ${position.arrow.y}) rotate(${position.arrow.angle})`
      }));
      if (this.settings?.showLabels && visible.edges.length <= 60) {
        const letters = Array.from(this.edgeLabel(edge));
        const label = letters.length > 22 ? letters.slice(0, 19).join("") + "..." : letters.join("");
        group.append(svg("text", { x: position.label.x, y: position.label.y, class: "edge-label", "text-anchor": "middle" }, label));
      }
      this.bindRepresentation(group, edge.rows, this.edgeTooltip(edge));
      image.append(group);
    }
    const labelLengths = [...image.querySelectorAll<SVGTextElement>(".edge-label")].map(label => ({ label, width: label.getComputedTextLength() }));
    for (const { label, width } of labelLengths) if (width > 220) {
      label.setAttribute("textLength", "220");
      label.setAttribute("lengthAdjust", "spacingAndGlyphs");
    }
    const nodeSet = new Set(visible.nodes);
    for (const node of layout.nodes.filter(node => nodeSet.has(node.id))) {
      const group = svg("g", { class: "activity", transform: `translate(${node.x} ${node.y})` });
      group.dataset.activity = node.id;
      group.classList.toggle("focused", node.id === this.focus);
      group.append(svg("rect", { x: -NODE_SIZE.width / 2, y: -NODE_SIZE.height / 2, width: NODE_SIZE.width, height: NODE_SIZE.height, rx: 8 }));
      const letters = Array.from(node.id);
      const label = svg("text", { "text-anchor": "middle", class: "node-label" });
      if (letters.length <= 17) label.append(svg("tspan", { x: 0, y: 5 }, node.id));
      else {
        label.append(svg("tspan", { x: 0, y: -3 }, letters.slice(0, 17).join("")));
        label.append(svg("tspan", { x: 0, y: 13 }, letters.slice(17, 31).join("") + (letters.length > 31 ? "..." : "")));
      }
      group.append(label);
      const rows = activityRows(visible.edges, node.id);
      group.addEventListener("click", () => {
        this.focus = this.focus === node.id ? null : node.id; this.mode = this.focus ? "neighbors" : "all";
        this.refresh(); this.persist();
      });
      this.bindRepresentation(group, rows, [{ displayName: this.t("activity"), value: node.id }, { displayName: this.t("incident"), value: String(rows.length) }], false);
      image.append(group);
    }
    section.append(element("p", `${this.t(this.overlay === "duration" ? "duration" : "frequency")}; max ${available.length ? this.actions.format(maximum, this.overlay) : this.t("unavailable")}${this.overlay === "duration" ? ` ${model.metric.unit} (${model.metric.statistic})` : ""}. ${this.t("legend")}`, "legend"));
    if (this.overlay === "duration" && available.length) {
      const ranked = visible.edges.filter(edge => edge.duration === maximum);
      section.append(element("p", `${this.t("ranked")}: ${ranked.slice(0, 3).map(edge => `${edge.source} -> ${edge.target}`).join("; ")}${ranked.length > 3 ? ` (+${ranked.length - 3})` : ""}. ${this.t("rankedNote")}`, "ranked-note"));
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
        this.focus = activity; this.mode = "neighbors"; this.refresh(); this.persist();
        this.root.querySelector<HTMLSelectElement>('[data-focus="activity"]')?.focus();
      }));
      const button = this.button(this.t("select"), `node:${activity}`);
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
      const select = this.button(`${this.t("select")} (${edge.rows.length})`, `edge:${edge.key}`);
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
          const button = this.button(label, `row:${index}`);
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
      const indices = this.rowMappings.get(node) ?? [];
      const selected = indices.some(index => rows.has(index));
      node.classList.toggle("selected", selected);
      node.classList.toggle("muted", rows.size > 0 && !selected);
      if (node instanceof HTMLButtonElement) node.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  }
  showError(message: string): void { this.interactionError = message; this.message.textContent = message; }
  renderFailure(message: string): void {
    this.actions.hideTooltip();
    this.root.replaceChildren(element("p", `${this.t("error")}: ${message}`, "fatal"));
    this.root.firstElementChild?.setAttribute("role", "alert");
  }
  destroy(): void { this.root.replaceChildren(); this.model = undefined; this.cachedLayout = undefined; this.cachedRoutes.clear(); }
}
