import type {
  DashboardSettings,
  GridBreakpoint,
  GridBreakpointLayouts,
  GridWidgetLayout,
  ThemeMode,
  WidgetId,
  WidgetLayout,
  ModeConfiguration,
  DashboardMode
} from "./types";

const STORAGE_KEY = "plz-grid-dashboard:v3";
const LEGACY_STORAGE_KEY = "plz-grid-dashboard:v2";
const WIDGET_PANEL_STATE_KEY = "plz-grid-dashboard:widget-panel:v1";
const HELP_SEEN_KEY = "plz-grid-dashboard:help-seen:v1";
const ROOF_RAIN_SETTINGS_KEY = "plz-grid-dashboard:roof-rain:v1";

// Standard Mode: Weather, place, and environment data
export const DEFAULT_STANDARD_CONFIG: ModeConfiguration = {
  widgets: [
    { id: "weather", enabled: true, size: "mini" },
    { id: "forecast", enabled: true, size: "wide" },
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
    { id: "humidity", enabled: false, size: "compact" },
    { id: "pressure", enabled: true, size: "compact" }
  ],
  customHeight: {},
  gridLayout: {}
};

// Hunting Mode: focused weather and nature signals
export const DEFAULT_HUNTING_CONFIG: ModeConfiguration = {
  widgets: [
    { id: "weather", enabled: true, size: "mini" },
    { id: "forecast", enabled: true, size: "wide" },
    { id: "place", enabled: false, size: "mini" },
    { id: "dwdWeather", enabled: false, size: "mini" },
    { id: "pollen", enabled: true, size: "mini" },
    { id: "dwdPollen", enabled: false, size: "mini" },
    { id: "air", enabled: true, size: "mini" },
    { id: "ubaAir", enabled: false, size: "mini" },
    { id: "warnings", enabled: true, size: "mini" },
    { id: "sun", enabled: true, size: "mini" },
    { id: "moon", enabled: true, size: "mini" },
    { id: "water", enabled: false, size: "mini" },
    { id: "roofRain", enabled: false, size: "compact" },
    { id: "wind", enabled: false, size: "compact" },
    { id: "humidity", enabled: false, size: "compact" },
    { id: "pressure", enabled: true, size: "compact" }
  ],
  customHeight: {},
  gridLayout: {}
};

const DEFAULT_MODE_COLORS = {
  standard: "#2b7058",
  hunting: "#8b4513",
  angler: "#2f89b8",
  custom: "#5f6fca"
};

const DEFAULT_MODES: DashboardMode[] = [
  { id: "standard", name: "Standard", color: DEFAULT_MODE_COLORS.standard, config: DEFAULT_STANDARD_CONFIG },
  { id: "hunting", name: "Jagd", color: DEFAULT_MODE_COLORS.hunting, config: DEFAULT_HUNTING_CONFIG },
  { id: "angler", name: "Angler", color: DEFAULT_MODE_COLORS.angler, config: DEFAULT_STANDARD_CONFIG }
];

const widgetIds = new Set<WidgetId>(
  DEFAULT_STANDARD_CONFIG.widgets.map((widget) => widget.id)
);
const gridBreakpoints: GridBreakpoint[] = ["lg", "md", "sm", "xs", "xxs"];
const themeModes = new Set<ThemeMode>(["system", "standard", "dark"]);
const DEFAULT_THEME: ThemeMode = "system";

export function loadSettings(): DashboardSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return {
        postalCode: "10115",
        theme: DEFAULT_THEME,
        currentModeId: "standard",
        modes: cloneDefaultModes()
      };
    }

    const parsed = JSON.parse(raw) as Partial<DashboardSettings> & Record<string, unknown>;

    // Migration from old format (v1 with widgets[] and huntMode)
    if (Array.isArray((parsed as any).widgets) && !parsed.standardConfig) {
      const oldWidgets = (parsed as any).widgets as WidgetLayout[];
      const standardConfig = {
        widgets: oldWidgets
          .filter((widget) => widgetIds.has(widget.id))
          .map((widget) => ({
            id: widget.id,
            enabled: widget.enabled,
            size: ["mini", "compact", "wide", "tall", "large", "full"].includes(widget.size)
              ? widget.size
              : "compact"
          })),
        customHeight: {},
        gridLayout: {}
      };
      return {
        postalCode: typeof parsed.postalCode === "string" ? parsed.postalCode : "10115",
        theme: themeModes.has(parsed.theme as ThemeMode) ? (parsed.theme as ThemeMode) : DEFAULT_THEME,
        currentModeId: (parsed as any).huntMode ? "hunting" : "standard",
        modes: buildDefaultModes(standardConfig, DEFAULT_HUNTING_CONFIG)
      };
    }

    if (Array.isArray(parsed.modes)) {
      return normalizeSettings(parsed);
    }

    // Migration from v2 fixed standard/hunting format.
    const standardConfig = normalizeConfig(parsed.standardConfig as ModeConfiguration | undefined, DEFAULT_STANDARD_CONFIG);
    const huntingConfig = normalizeHuntingConfig(parsed.huntingConfig as ModeConfiguration | undefined);
    const currentModeId = parsed.currentMode === "hunting" ? "hunting" : "standard";

    return {
      postalCode: typeof parsed.postalCode === "string" ? parsed.postalCode : "10115",
      theme: themeModes.has(parsed.theme as ThemeMode) ? (parsed.theme as ThemeMode) : DEFAULT_THEME,
      currentModeId,
      modes: buildDefaultModes(standardConfig, huntingConfig)
    };
  } catch {
    return {
      postalCode: "10115",
      theme: DEFAULT_THEME,
      currentModeId: "standard",
      modes: cloneDefaultModes()
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
    return !window.localStorage.getItem(STORAGE_KEY) && !window.localStorage.getItem(LEGACY_STORAGE_KEY) && window.localStorage.getItem(HELP_SEEN_KEY) !== "true";
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
  areaInput: string;
  roofPitch: number;
  runoffFactor: number;
  timeframeHours: 24 | 48 | 72;
};

export const DEFAULT_ROOF_RAIN_SETTINGS: RoofRainSettings = {
  areaMode: "roof",
  area: 120,
  areaInput: "120",
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
  if (!config || !Array.isArray(config.widgets)) return cloneConfig(defaults);

  const configuredIds = new Set(config.widgets.map((widget) => widget.id));
  const widgets = [
    ...config.widgets.filter((widget) => widgetIds.has(widget.id)),
    ...defaults.widgets.filter((widget) => !configuredIds.has(widget.id)),
    ...DEFAULT_STANDARD_CONFIG.widgets
      .filter((widget) => !configuredIds.has(widget.id) && !defaults.widgets.some((defaultWidget) => defaultWidget.id === widget.id))
      .map((widget) => ({ ...widget, enabled: false }))
  ].map((widget) => ({
    id: widget.id,
    enabled: typeof widget.enabled === "boolean" ? widget.enabled : false,
    size: ["mini", "compact", "wide", "tall", "large", "full"].includes(widget.size) ? widget.size : "compact"
  }));

  return {
    widgets,
    customHeight: config.customHeight || {},
    gridLayout: normalizeGridLayout(config.gridLayout)
  };
}

export function createEmptyModeConfig(): ModeConfiguration {
  return {
    widgets: DEFAULT_STANDARD_CONFIG.widgets.map((widget) => ({
      ...widget,
      enabled: false
    })),
    customHeight: {},
    gridLayout: {}
  };
}

function buildDefaultModes(standardConfig: ModeConfiguration, huntingConfig: ModeConfiguration): DashboardMode[] {
  const normalizedStandardConfig = normalizeConfig(standardConfig, DEFAULT_STANDARD_CONFIG);
  const normalizedHuntingConfig = normalizeConfig(huntingConfig, DEFAULT_HUNTING_CONFIG);
  return [
    { id: "standard", name: "Standard", color: DEFAULT_MODE_COLORS.standard, config: normalizedStandardConfig },
    { id: "hunting", name: "Jagd", color: DEFAULT_MODE_COLORS.hunting, config: normalizedHuntingConfig },
    { id: "angler", name: "Angler", color: DEFAULT_MODE_COLORS.angler, config: cloneConfig(normalizedStandardConfig) }
  ];
}

function cloneDefaultModes(): DashboardMode[] {
  return DEFAULT_MODES.map((mode) => ({
    ...mode,
    config: cloneConfig(mode.config)
  }));
}

function cloneConfig(config: ModeConfiguration): ModeConfiguration {
  return {
    widgets: config.widgets.map((widget) => ({ ...widget })),
    customHeight: { ...config.customHeight },
    gridLayout: config.gridLayout ? JSON.parse(JSON.stringify(config.gridLayout)) as ModeConfiguration["gridLayout"] : {}
  };
}

function normalizeSettings(settings: Partial<DashboardSettings> & Record<string, unknown>): DashboardSettings {
  const modes = normalizeModes(settings.modes);
  const currentModeId =
    typeof settings.currentModeId === "string" && modes.some((mode) => mode.id === settings.currentModeId)
      ? settings.currentModeId
      : modes[0].id;

  return {
    postalCode: typeof settings.postalCode === "string" ? settings.postalCode : "10115",
    theme: themeModes.has(settings.theme as ThemeMode) ? (settings.theme as ThemeMode) : DEFAULT_THEME,
    currentModeId,
    modes
  };
}

function normalizeModes(value: unknown): DashboardMode[] {
  const rawModes = Array.isArray(value) ? value : [];
  const usedIds = new Set<string>();
  const normalized = rawModes
    .map((mode, index) => normalizeMode(mode, index))
    .filter((mode): mode is DashboardMode => mode !== null)
    .map((mode) => {
      const id = createUniqueModeId(mode.id, usedIds);
      usedIds.add(id);
      return { ...mode, id };
    });

  return normalized.length > 0 ? normalized : cloneDefaultModes();
}

function normalizeMode(value: unknown, index: number): DashboardMode | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<DashboardMode>;
  const id = normalizeModeId(candidate.id, index);
  const fallbackConfig = id === "hunting" ? DEFAULT_HUNTING_CONFIG : DEFAULT_STANDARD_CONFIG;
  return {
    id,
    name: normalizeModeName(candidate.name, id),
    color: normalizeColor(candidate.color, DEFAULT_MODE_COLORS[id as keyof typeof DEFAULT_MODE_COLORS] ?? DEFAULT_MODE_COLORS.custom),
    config: normalizeConfig(candidate.config, fallbackConfig)
  };
}

function normalizeModeId(value: unknown, index: number) {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (normalized) return normalized;
  }
  return `mode-${index + 1}`;
}

function createUniqueModeId(id: string, usedIds: Set<string>) {
  if (!usedIds.has(id)) return id;
  let index = 2;
  let nextId = `${id}-${index}`;
  while (usedIds.has(nextId)) {
    index += 1;
    nextId = `${id}-${index}`;
  }
  return nextId;
}

function normalizeModeName(value: unknown, id: string) {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 32);
  if (id === "standard") return "Standard";
  if (id === "hunting") return "Jagd";
  if (id === "angler") return "Angler";
  return "Neuer Modus";
}

function normalizeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function normalizeHuntingConfig(config: ModeConfiguration | undefined): ModeConfiguration {
  if (!config || !Array.isArray(config.widgets)) return cloneConfig(DEFAULT_HUNTING_CONFIG);

  const widgetIdsInConfig = config.widgets.map((widget) => widget.id);
  const hasOldWindHumidityDefault =
    widgetIdsInConfig.length === 2 &&
    widgetIdsInConfig.includes("wind") &&
    widgetIdsInConfig.includes("humidity");

  if (hasOldWindHumidityDefault) return cloneConfig(DEFAULT_HUNTING_CONFIG);

  return normalizeConfig(config, DEFAULT_HUNTING_CONFIG);
}

function normalizeGridLayout(config: unknown): ModeConfiguration["gridLayout"] {
  if (!config || typeof config !== "object") return {};

  const entries = Object.entries(config);
  const hasBreakpointKeys = entries.some(([key]) => gridBreakpoints.includes(key as GridBreakpoint));

  if (!hasBreakpointKeys) {
    const legacyLayout = normalizeGridBreakpointLayout(config);
    return Object.keys(legacyLayout).length > 0 ? { lg: legacyLayout } : {};
  }

  const layouts: ModeConfiguration["gridLayout"] = {};
  for (const breakpoint of gridBreakpoints) {
    const breakpointLayout = normalizeGridBreakpointLayout((config as Record<string, unknown>)[breakpoint]);
    if (Object.keys(breakpointLayout).length > 0) {
      layouts[breakpoint] = breakpointLayout;
    }
  }
  return layouts;
}

function normalizeGridBreakpointLayout(config: unknown): GridBreakpointLayouts {
  if (!config || typeof config !== "object") return {};

  const layout: GridBreakpointLayouts = {};
  for (const [id, item] of Object.entries(config)) {
    if (!widgetIds.has(id as WidgetId) || !item || typeof item !== "object") continue;
    const candidate = item as Partial<GridWidgetLayout>;
    if (
      !Number.isFinite(candidate.x) ||
      !Number.isFinite(candidate.y) ||
      !Number.isFinite(candidate.w) ||
      !Number.isFinite(candidate.h)
    ) {
      continue;
    }
    layout[id as WidgetId] = {
      x: candidate.x,
      y: candidate.y,
      w: candidate.w,
      h: candidate.h
    } as GridWidgetLayout;
  }
  return layout;
}

function normalizeRoofRainSettings(settings: Partial<RoofRainSettings>): RoofRainSettings {
  const areaMode = settings.areaMode === "ground" || settings.areaMode === "roof" ? settings.areaMode : DEFAULT_ROOF_RAIN_SETTINGS.areaMode;
  const areaInput = typeof settings.areaInput === "string" ? settings.areaInput : String(settings.area ?? DEFAULT_ROOF_RAIN_SETTINGS.area);
  const areaFromInput = areaInput.trim() === "" ? 0 : Number(areaInput);
  const area = clampFinite(Number.isFinite(areaFromInput) ? areaFromInput : settings.area, 0, 2000, DEFAULT_ROOF_RAIN_SETTINGS.area);
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
    areaInput,
    roofPitch,
    runoffFactor,
    timeframeHours
  };
}

function clampFinite(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
