import type powerbi from "powerbi-visuals-api";
import type { MetricSpec } from "./model";
import type { Translate } from "./i18n";

export interface Settings {
  edgeColor: string;
  nodeColor: string;
  showLabels: boolean;
  metric: MetricSpec;
}
export const DEFAULTS: Settings = {
  edgeColor: "#337680", nodeColor: "#183E4B", showLabels: true,
  metric: { statistic: "", unit: "", provenance: "" }
};
function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 300).trim() : "";
}
function color(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && "solid" in value) {
    const solid = value.solid;
    if (solid && typeof solid === "object" && "color" in solid &&
      typeof solid.color === "string" && /^#[a-f\d]{6}$/i.test(solid.color)) return solid.color;
  }
  return fallback;
}
export function readSettings(objects?: powerbi.DataViewObjects): Settings {
  const appearance = objects?.appearance;
  const metrics = objects?.metrics;
  return {
    edgeColor: color(appearance?.edgeColor, DEFAULTS.edgeColor),
    nodeColor: color(appearance?.nodeColor, DEFAULTS.nodeColor),
    showLabels: typeof appearance?.showLabels === "boolean" ? appearance.showLabels : DEFAULTS.showLabels,
    metric: { statistic: text(metrics?.statistic), unit: text(metrics?.unit), provenance: text(metrics?.provenance) }
  };
}
export function formattingModel(settings: Settings, t: Translate): powerbi.visuals.FormattingModel {
  const descriptor = (objectName: string, propertyName: string) => ({ objectName, propertyName });
  const appearance: powerbi.visuals.FormattingSlice[] = [
    ...(["edgeColor", "nodeColor"] as const).map(property => ({
      uid: property, displayName: t(property),
      control: { type: "ColorPicker" as const, properties: { descriptor: descriptor("appearance", property), value: { value: settings[property] } } }
    })),
    {
      uid: "showLabels", displayName: t("showLabels"),
      control: { type: "ToggleSwitch", properties: { descriptor: descriptor("appearance", "showLabels"), value: settings.showLabels } }
    }
  ];
  const metrics: powerbi.visuals.FormattingSlice[] = (["statistic", "unit", "provenance"] as const).map(property => ({
    uid: property, displayName: t(property),
    control: { type: "TextInput", properties: { descriptor: descriptor("metrics", property), value: settings.metric[property], placeholder: t(property) } }
  }));
  return { cards: [
    {
      uid: "appearance", displayName: t("formatGraph"),
      groups: [{ uid: "appearanceGroup", displayName: t("formatGraph"), slices: appearance }],
      revertToDefaultDescriptors: ["edgeColor", "nodeColor", "showLabels"].map(property => descriptor("appearance", property))
    },
    {
      uid: "metrics", displayName: t("metricCard"),
      groups: [{ uid: "metricsGroup", displayName: t("metricCard"), slices: metrics }],
      revertToDefaultDescriptors: ["statistic", "unit", "provenance"].map(property => descriptor("metrics", property))
    }
  ] };
}
