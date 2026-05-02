import type { DashboardSettings, WidgetId, WidgetLayout } from "./types";

const STORAGE_KEY = "plz-grid-dashboard:v1";

export const DEFAULT_WIDGETS: WidgetLayout[] = [
  { id: "place", enabled: true, size: "wide" },
  { id: "weather", enabled: true, size: "wide" },
  { id: "dwdWeather", enabled: true, size: "mini" },
  { id: "pollen", enabled: true, size: "mini" },
  { id: "dwdPollen", enabled: true, size: "wide" },
  { id: "air", enabled: true, size: "mini" },
  { id: "ubaAir", enabled: true, size: "wide" },
  { id: "warnings", enabled: true, size: "full" },
  { id: "sun", enabled: true, size: "mini" },
  { id: "moon", enabled: true, size: "mini" },
  { id: "water", enabled: true, size: "mini" },
  { id: "strom", enabled: true, size: "mini" },
  { id: "insights", enabled: true, size: "full" }
];

const widgetIds = new Set<WidgetId>(DEFAULT_WIDGETS.map((widget) => widget.id));

export function loadSettings(): DashboardSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { postalCode: "10115", widgets: DEFAULT_WIDGETS };
    }

    const parsed = JSON.parse(raw) as Partial<DashboardSettings>;
    const savedWidgets = Array.isArray(parsed.widgets) ? parsed.widgets : [];
    const merged = [
      ...savedWidgets.filter((widget): widget is WidgetLayout => {
        return Boolean(widget && widgetIds.has(widget.id) && typeof widget.enabled === "boolean");
      }),
      ...DEFAULT_WIDGETS.filter((widget) => !savedWidgets.some((saved) => saved?.id === widget.id))
    ];

    return {
      postalCode: typeof parsed.postalCode === "string" ? parsed.postalCode : "10115",
      widgets: merged.map((widget) => ({
        id: widget.id,
        enabled: widget.enabled,
        size: ["mini", "compact", "wide", "tall", "large", "full"].includes(widget.size) ? widget.size : "compact",
        customHeight: typeof widget.customHeight === "number" ? widget.customHeight : undefined
      }))
    };
  } catch {
    return { postalCode: "10115", widgets: DEFAULT_WIDGETS };
  }
}

export function saveSettings(settings: DashboardSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
