import type { FocusMode } from "./model";

export interface Navigation {
  query: string;
  focus: string | null;
  variant: string | null;
  mode: FocusMode;
  overlay: "frequency" | "duration";
  zoom: number;
  panel: "graph" | "table";
}
export const DEFAULT_NAVIGATION: Navigation = { query: "", focus: null, variant: null, mode: "all", overlay: "frequency", zoom: 1, panel: "graph" };
export const MAX_ZOOM = 24;
export function parseNavigation(token: unknown): { value: Navigation; invalid: boolean } {
  if (token === undefined || token === "") return { value: { ...DEFAULT_NAVIGATION }, invalid: false };
  if (typeof token !== "string" || token.length > 1800) return { value: { ...DEFAULT_NAVIGATION }, invalid: true };
  let value: unknown;
  try { value = JSON.parse(token); }
  catch { return { value: { ...DEFAULT_NAVIGATION }, invalid: true }; }
  const id = (input: unknown) => input === null || typeof input === "string" && input.length <= 120;
  if (!value || typeof value !== "object" ||
    !("query" in value) || typeof value.query !== "string" || value.query.length > 120 ||
    !("focus" in value) || !id(value.focus) || !("variant" in value) || !id(value.variant) ||
    !("mode" in value) || !["all", "neighbors", "upstream", "downstream"].includes(String(value.mode)) ||
    !("overlay" in value) || (value.overlay !== "frequency" && value.overlay !== "duration") ||
    !("zoom" in value) || typeof value.zoom !== "number" || !Number.isFinite(value.zoom) || value.zoom < 0.5 || value.zoom > MAX_ZOOM ||
    !("panel" in value) || (value.panel !== "graph" && value.panel !== "table")) {
    return { value: { ...DEFAULT_NAVIGATION }, invalid: true };
  }
  return {
    value: {
      query: value.query, focus: typeof value.focus === "string" ? value.focus : null,
      variant: typeof value.variant === "string" ? value.variant : null,
      mode: value.mode === "neighbors" || value.mode === "upstream" || value.mode === "downstream" ? value.mode : "all",
      overlay: value.overlay, zoom: value.zoom, panel: value.panel
    }, invalid: false
  };
}
