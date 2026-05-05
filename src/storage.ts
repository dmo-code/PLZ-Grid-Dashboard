import type { DashboardSettings, ThemeMode, WidgetId, WidgetLayout, ModeConfiguration, ModeType } from "./types";

const STORAGE_KEY = "plz-grid-dashboard:v2";
const WIDGET_PANEL_STATE_KEY = "plz-grid-dashboard:widget-panel:v1";
const HELP_SEEN_KEY = "plz-grid-dashboard:help-seen:v1";
const ROOF_RAIN_SETTINGS_KEY = "plz-grid-dashboard:roof-rain:v1";

// Standard Mode: Weather, place, and environment data
export const DEFAULT_STANDARD_CONFIG: ModeConfiguration = {
  widgets: [
    { id: "weather", enabled: true, size: "mini" },
    { id: "place", enabled: true, size: "mini" },
    { id: "dwdWeather", enabled: true, size: "mini" },
    { id: "pollen", enabled: true, size: "mini" },
    { id: "dwdPollen", enabled: true, size: "mini" },
    { id: "air", enabled: true, size: "mini" },
    { id: "ubaAir", enabled: true, size: "mini" },
    { id: "warnings", enabled: true, size: "mini" },
    { id: "sun", enabled: true, size: "mini" },
    { id: "moon", enabled: true, size: "mini" },
    { id: "water", enabled: true, size: "mini" },
    { id: "roofRain", enabled: true, size: "compact" },
    { id: "wind", enabled: false, size: "compact" },
    { id: "humidity", enabled: false, size: "compact" }
  ],
  customHeight: {}
};

// Hunting Mode: focused weather and nature signals
export const DEFAULT_HUNTING_CONFIG: ModeConfiguration = {
  widgets: [
    { id: "weather", enabled: true, size: "mini" },
    { id: "pollen", enabled: true, size: "mini" },
    { id: "air", enabled: true, size: "mini" },
    { id: "warnings", enabled: true, size: "mini" },
    { id: "sun", enabled: true, size: "mini" },
    { id: "moon", enabled: true, size: "mini" },
    { id: "wind", enabled: false, size: "compact" },
    { id: "humidity", enabled: false, size: "compact" }
  ],
  customHeight: {}
};

const widgetIds = new Set<WidgetId>(
  DEFAULT_STANDARD_CONFIG.widgets.map((widget) => widget.id)
);
const themeModes = new Set<ThemeMode>(["system", "standard", "dark"]);
const DEFAULT_THEME: ThemeMode = "system";

export function loadSettings(): DashboardSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        postalCode: "10115",
        theme: DEFAULT_THEME,
        currentMode: "standard",
        standardConfig: DEFAULT_STANDARD_CONFIG,
        huntingConfig: DEFAULT_HUNTING_CONFIG
      };
    }

    const parsed = JSON.parse(raw) as Partial<DashboardSettings>;

    // Migration from old format (v1 with widgets[] and huntMode)
    if (Array.isArray((parsed as any).widgets) && !parsed.standardConfig) {
      const oldWidgets = (parsed as any).widgets as WidgetLayout[];
      return {
        postalCode: typeof parsed.postalCode === "string" ? parsed.postalCode : "10115",
        theme: themeModes.has(parsed.theme as ThemeMode) ? (parsed.theme as ThemeMode) : DEFAULT_THEME,
        currentMode: (parsed as any).huntMode ? "hunting" : "standard",
        standardConfig: {
          widgets: oldWidgets
            .filter((widget) => widgetIds.has(widget.id))
            .map((widget) => ({
              id: widget.id,
              enabled: widget.enabled,
              size: ["mini", "compact", "wide", "tall", "large", "full"].includes(widget.size)
                ? widget.size
                : "compact"
            })),
          customHeight: {}
        },
        huntingConfig: DEFAULT_HUNTING_CONFIG
      };
    }

    // Load new format (v2)
    const standardConfig = normalizeConfig(parsed.standardConfig, DEFAULT_STANDARD_CONFIG);
    const huntingConfig = normalizeHuntingConfig(parsed.huntingConfig);
    const currentMode = (parsed.currentMode === "hunting" ? "hunting" : "standard") as ModeType;

    return {
      postalCode: typeof parsed.postalCode === "string" ? parsed.postalCode : "10115",
      theme: themeModes.has(parsed.theme as ThemeMode) ? (parsed.theme as ThemeMode) : DEFAULT_THEME,
      currentMode,
      standardConfig,
      huntingConfig
    };
  } catch {
    return {
      postalCode: "10115",
      theme: DEFAULT_THEME,
      currentMode: "standard",
      standardConfig: DEFAULT_STANDARD_CONFIG,
      huntingConfig: DEFAULT_HUNTING_CONFIG
    };
  }
}

export function saveSettings(settings: DashboardSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function loadWidgetPanelState(categoryIds: string[]) {
  const defaults = Object.fromEntries(categoryIds.map((categoryId) => [categoryId, false]));

  try {
    const raw = window.localStorage.getItem(WIDGET_PANEL_STATE_KEY);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      categoryIds.map((categoryId) => [categoryId, typeof parsed[categoryId] === "boolean" ? parsed[categoryId] : false])
    );
  } catch {
    return defaults;
  }
}

export function saveWidgetPanelState(collapsedCategories: Record<string, boolean>) {
  window.localStorage.setItem(WIDGET_PANEL_STATE_KEY, JSON.stringify(collapsedCategories));
}

export function shouldOpenHelpOnStart() {
  try {
    return !window.localStorage.getItem(STORAGE_KEY) && window.localStorage.getItem(HELP_SEEN_KEY) !== "true";
  } catch {
    return true;
  }
}

export function markHelpSeen() {
  try {
    window.localStorage.setItem(HELP_SEEN_KEY, "true");
  } catch {
    // Ignore blocked storage; the help can still be closed for the current session.
  }
}

export type RoofRainSettings = {
  areaMode: "ground" | "roof";
  area: number;
  roofPitch: number;
  runoffFactor: number;
  timeframeHours: 24 | 48 | 72;
};

export const DEFAULT_ROOF_RAIN_SETTINGS: RoofRainSettings = {
  areaMode: "roof",
  area: 120,
  roofPitch: 35,
  runoffFactor: 0.9,
  timeframeHours: 24
};

export function loadRoofRainSettings(): RoofRainSettings {
  try {
    const raw = window.localStorage.getItem(ROOF_RAIN_SETTINGS_KEY);
    if (!raw) return DEFAULT_ROOF_RAIN_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<RoofRainSettings>;
    return normalizeRoofRainSettings(parsed);
  } catch {
    return DEFAULT_ROOF_RAIN_SETTINGS;
  }
}

export function saveRoofRainSettings(settings: RoofRainSettings) {
  window.localStorage.setItem(ROOF_RAIN_SETTINGS_KEY, JSON.stringify(normalizeRoofRainSettings(settings)));
}

function normalizeConfig(config: ModeConfiguration | undefined, defaults: ModeConfiguration): ModeConfiguration {
  if (!config || !Array.isArray(config.widgets)) return defaults;

  const configuredIds = new Set(config.widgets.map((widget) => widget.id));
  const widgets = [
    ...config.widgets.filter((widget) => widgetIds.has(widget.id)),
    ...defaults.widgets.filter((widget) => !configuredIds.has(widget.id))
  ].map((widget) => ({
    id: widget.id,
    enabled: widget.enabled,
    size: ["mini", "compact", "wide", "tall", "large", "full"].includes(widget.size) ? widget.size : "compact"
  }));

  return {
    widgets,
    customHeight: config.customHeight || {}
  };
}

function normalizeHuntingConfig(config: ModeConfiguration | undefined): ModeConfiguration {
  if (!config || !Array.isArray(config.widgets)) return DEFAULT_HUNTING_CONFIG;

  const widgetIdsInConfig = config.widgets.map((widget) => widget.id);
  const hasOldWindHumidityDefault =
    widgetIdsInConfig.length === 2 &&
    widgetIdsInConfig.includes("wind") &&
    widgetIdsInConfig.includes("humidity");

  if (hasOldWindHumidityDefault) return DEFAULT_HUNTING_CONFIG;

  const configuredById = new Map(config.widgets.map((widget) => [widget.id, widget]));
  const widgets = DEFAULT_HUNTING_CONFIG.widgets.map((defaultWidget) => {
    const configuredWidget = configuredById.get(defaultWidget.id);
    return {
      id: defaultWidget.id,
      enabled: configuredWidget?.enabled ?? defaultWidget.enabled,
      size:
        configuredWidget && ["mini", "compact", "wide", "tall", "large", "full"].includes(configuredWidget.size)
          ? configuredWidget.size
          : defaultWidget.size
    };
  });

  return {
    widgets,
    customHeight: config.customHeight || {}
  };
}

function normalizeRoofRainSettings(settings: Partial<RoofRainSettings>): RoofRainSettings {
  const areaMode = settings.areaMode === "ground" || settings.areaMode === "roof" ? settings.areaMode : DEFAULT_ROOF_RAIN_SETTINGS.areaMode;
  const area = clampFinite(settings.area, 1, 2000, DEFAULT_ROOF_RAIN_SETTINGS.area);
  const roofPitch = clampFinite(settings.roofPitch, 0, 75, DEFAULT_ROOF_RAIN_SETTINGS.roofPitch);
  const runoffFactor = [0.9, 0.95, 1].includes(settings.runoffFactor ?? 0)
    ? (settings.runoffFactor as number)
    : DEFAULT_ROOF_RAIN_SETTINGS.runoffFactor;
  const timeframeHours = [24, 48, 72].includes(settings.timeframeHours ?? 0)
    ? (settings.timeframeHours as 24 | 48 | 72)
    : DEFAULT_ROOF_RAIN_SETTINGS.timeframeHours;

  return {
    areaMode,
    area,
    roofPitch,
    runoffFactor,
    timeframeHours
  };
}

function clampFinite(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
