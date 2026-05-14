import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout/legacy";
import { loadDashboardData, loadDashboardDataForCoordinates, loadSolarForecast, searchLocationChoices, type LocationChoice } from "./api";
import {
  createDefaultModes,
  createEmptyModeConfig,
  loadRoofRainSettings,
  loadSolarSettings,
  loadSettings,
  loadWidgetPanelState,
  markHelpSeen,
  saveRoofRainSettings,
  saveSolarSettings,
  saveSettings,
  saveWidgetPanelState,
  shouldOpenHelpOnStart,
  type RoofRainSettings,
  type SolarSettings
} from "./storage";
import type { DashboardData, DashboardMode, DashboardSettings, GridBreakpoint, GridBreakpointLayouts, ModeConfiguration, SolarForecastData, ThemeMode, WidgetId, WidgetLayout, WidgetSize } from "./types";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./styles.css";

type DropPosition = "before" | "after";
type WidgetDensity = "narrow" | "normal" | "wide";
type WidgetHeightDensity = "short" | "normal" | "tall";

type WidgetPresentation = {
  columns: number;
  rows: number;
  density: WidgetDensity;
  heightDensity: WidgetHeightDensity;
};

type GridLayouts = Partial<Record<GridBreakpoint, Layout>>;

const AUTO_REFRESH_MAX_AGE_MS = 15 * 60 * 1000;
const GRID_COLUMNS = 12;
const GRID_ROW_HEIGHT = 20;
const GRID_GAP: [number, number] = [14, 14];
const GRID_ITEM_MIN_HEIGHT = 4;
const GRID_BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const GRID_BREAKPOINT_COLUMNS = { lg: 12, md: 12, sm: 6, xs: 1, xxs: 1 };
const CURRENT_LOCATION_MODE_ID = "current-location";

const ResponsiveGridLayout = WidthProvider(Responsive);

const widgetMeta: Record<WidgetId, { title: string; accent: string }> = {
  place: { title: "PLZ-Kontext", accent: "slate" },
  weather: { title: "Wetter", accent: "sky" },
  forecast: { title: "3-Tage-Vorhersage", accent: "sky" },
  dwdWeather: { title: "DWD Wetter", accent: "blue" },
  pollen: { title: "Pollenflug", accent: "grass" },
  dwdPollen: { title: "DWD Pollen", accent: "leaf" },
  air: { title: "Luftqualität", accent: "mint" },
  ubaAir: { title: "UBA Luftdaten", accent: "teal" },
  warnings: { title: "Warnungen", accent: "amber" },
  sun: { title: "Sonne", accent: "rose" },
  moon: { title: "Mond", accent: "moon" },
  water: { title: "Pegel", accent: "water" },
  roofRain: { title: "Dachregen", accent: "water" },
  solar: { title: "Solar", accent: "energy" },
  wind: { title: "Wind", accent: "sky" },
  humidity: { title: "Luftfeuchte", accent: "water" },
  pressure: { title: "Luftdruck", accent: "violet" }
};

const defaultGridSizeByWidget: Record<WidgetId, { w: number; h: number }> = {
  weather: { w: 6, h: 15 },
  forecast: { w: 8, h: 12 },
  place: { w: 4, h: 9 },
  dwdWeather: { w: 4, h: 11 },
  pollen: { w: 4, h: 12 },
  dwdPollen: { w: 4, h: 17 },
  air: { w: 4, h: 10 },
  ubaAir: { w: 4, h: 11 },
  warnings: { w: 4, h: 6 },
  sun: { w: 4, h: 10 },
  moon: { w: 4, h: 14 },
  water: { w: 5, h: 18 },
  roofRain: { w: 5, h: 15 },
  solar: { w: 6, h: 16 },
  wind: { w: 4, h: 16 },
  humidity: { w: 3, h: 7 },
  pressure: { w: 4, h: 11 }
};

const weatherLabels = new Map<number, string>([
  [0, "Klar"],
  [1, "Überwiegend klar"],
  [2, "Teils bewölkt"],
  [3, "Bewölkt"],
  [45, "Nebel"],
  [48, "Reifnebel"],
  [51, "Leichter Niesel"],
  [53, "Niesel"],
  [55, "Starker Niesel"],
  [61, "Leichter Regen"],
  [63, "Regen"],
  [65, "Starker Regen"],
  [71, "Leichter Schnee"],
  [73, "Schnee"],
  [75, "Starker Schnee"],
  [80, "Regenschauer"],
  [81, "Starke Schauer"],
  [82, "Heftige Schauer"],
  [95, "Gewitter"]
]);

const widgetCategories = [
  { id: "context", title: "Standort & Kontext", ids: ["place"] as WidgetId[] },
  { id: "weather", title: "Wetter", ids: ["weather", "forecast", "dwdWeather", "warnings"] as WidgetId[] },
  { id: "air", title: "Luft & Umwelt", ids: ["pollen", "dwdPollen", "air", "ubaAir", "humidity", "pressure"] as WidgetId[] },
  { id: "sunMoon", title: "Sonne & Mond", ids: ["sun", "moon", "solar"] as WidgetId[] },
  { id: "waterEnergy", title: "Wasser", ids: ["water", "roofRain"] as WidgetId[] }
];

function App() {
  const [settings, setSettings] = useState<DashboardSettings>(() => loadSettings());
  const [postalInput, setPostalInput] = useState(settings.postalCode);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationChoices, setLocationChoices] = useState<LocationChoice[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(() => shouldOpenHelpOnStart());
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [activeGridLayout, setActiveGridLayout] = useState<Layout>([]);
  const [activeGridBreakpoint, setActiveGridBreakpoint] = useState<GridBreakpoint>("lg");
  const refreshRequestId = useRef(0);
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const currentMode = (settings.modes.find((mode) => mode.id === settings.currentModeId) ?? settings.modes[0]) as DashboardMode;
  const currentModeName = currentMode.name.trim() || "Unbenannt";
  const currentConfig = currentMode.config;
  const isCurrentLocationMode = currentMode.id === CURRENT_LOCATION_MODE_ID;

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const switchMode = useCallback((newModeId: string) => {
    setSettings((current) => ({
      ...current,
      currentModeId: current.modes.some((mode) => mode.id === newModeId) ? newModeId : current.currentModeId
    }));
  }, []);

  const updateActiveMode = useCallback((updater: (mode: DashboardMode) => DashboardMode) => {
    setSettings((current) => ({
      ...current,
      modes: current.modes.map((mode) => (mode.id === current.currentModeId ? updater(mode) : mode))
    }));
  }, []);

  const addMode = useCallback(() => {
    setSettings((current) => {
      const id = createModeId(current.modes);
      const mode: DashboardMode = {
        id,
        name: createModeName(current.modes),
        color: "#5f6fca",
        config: createEmptyModeConfig()
      };
      return {
        ...current,
        currentModeId: id,
        modes: [...current.modes, mode]
      };
    });
  }, []);

  const renameMode = useCallback((modeId: string, name: string) => {
    setSettings((current) => ({
      ...current,
      modes: current.modes.map((mode) => (mode.id === modeId ? { ...mode, name: name.slice(0, 32) } : mode))
    }));
  }, []);

  const changeModeColor = useCallback((modeId: string, color: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    setSettings((current) => ({
      ...current,
      modes: current.modes.map((mode) => (mode.id === modeId ? { ...mode, color } : mode))
    }));
  }, []);

  const deleteMode = useCallback((modeId: string) => {
    setSettings((current) => {
      if (current.modes.length <= 1) return current;
      const modes = current.modes.filter((mode) => mode.id !== modeId);
      if (modes.length === current.modes.length) return current;
      return {
        ...current,
        currentModeId: current.currentModeId === modeId ? modes[0].id : current.currentModeId,
        modes
      };
    });
  }, []);

  const restoreDefaultModes = useCallback(() => {
    setSettings((current) => ({
      ...current,
      currentModeId: "standard",
      modes: createDefaultModes()
    }));
  }, []);

  const closeHelp = useCallback(() => {
    markHelpSeen();
    setHelpOpen(false);
  }, []);

  const clearPostalSearch = useCallback(() => {
    setPostalInput("");
    setLocationChoices([]);
  }, []);

  const refresh = useCallback(async (searchTerm: string, selectedPlace?: LocationChoice, options?: { background?: boolean }) => {
    const requestId = refreshRequestId.current + 1;
    refreshRequestId.current = requestId;
    const isLatestRequest = () => refreshRequestId.current === requestId;
    const isBackgroundRefresh = options?.background === true;
    const normalizedSearchTerm = searchTerm.trim();

    if (!normalizedSearchTerm) {
      setError("Bitte gib eine deutsche PLZ oder einen Ort ein.");
      if (!isBackgroundRefresh) setLoading(false);
      return;
    }

    if (!isBackgroundRefresh) {
      setLoading(true);
      setError(null);
    }
    try {
      const isPostalCode = /^\d{5}$/.test(normalizedSearchTerm);
      if (!selectedPlace && !isPostalCode) {
        const choices = await searchLocationChoices(normalizedSearchTerm);
        if (!isLatestRequest()) return;
        if (choices.length > 1) {
          setLocationChoices(choices);
          return;
        }
        if (choices.length === 0) {
          throw new Error("Zu diesem Ort wurde keine PLZ gefunden.");
        }
        selectedPlace = choices[0];
      }

      const dashboardData = await loadDashboardData(selectedPlace?.postalCode ?? normalizedSearchTerm, selectedPlace);
      if (!isLatestRequest()) return;
      setData(dashboardData);
      setPostalInput(dashboardData.location.postalCode);
      setLocationChoices([]);
      setSettings((current) => ({ ...current, postalCode: dashboardData.location.postalCode }));
    } catch (caught) {
      if (!isBackgroundRefresh && isLatestRequest()) {
        setError(formatRefreshError(caught));
      }
    } finally {
      if (!isBackgroundRefresh && isLatestRequest()) setLoading(false);
    }
  }, []);

  const refreshCurrentLocation = useCallback(async (options?: { background?: boolean }) => {
    const requestId = refreshRequestId.current + 1;
    refreshRequestId.current = requestId;
    const isLatestRequest = () => refreshRequestId.current === requestId;
    const isBackgroundRefresh = options?.background === true;

    if (!navigator.geolocation) {
      setError("Dein Browser unterstützt keine Standortfreigabe.");
      return;
    }

    if (!isBackgroundRefresh) {
      setLoading(true);
      setError(null);
    }
    setLocationChoices([]);

    try {
      const position = await getCurrentPosition();
      const dashboardData = await loadDashboardDataForCoordinates(position.coords.latitude, position.coords.longitude);
      if (!isLatestRequest()) return;
      setData(dashboardData);
      const resolvedPostalCode = dashboardData.location.postalCode;
      setPostalInput(/^\d{5}$/.test(resolvedPostalCode) ? resolvedPostalCode : dashboardData.location.place);
    } catch (caught) {
      if (!isBackgroundRefresh && isLatestRequest()) {
        setError(formatRefreshError(caught));
      }
    } finally {
      if (!isBackgroundRefresh && isLatestRequest()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isCurrentLocationMode) {
      void refreshCurrentLocation();
      return;
    }
    void refresh(settings.postalCode);
  }, [isCurrentLocationMode, refresh, refreshCurrentLocation, settings.postalCode]);

  useEffect(() => {
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible") return;
      if (!data) return;
      if (Date.now() - new Date(data.updatedAt).getTime() < AUTO_REFRESH_MAX_AGE_MS) return;
      if (isCurrentLocationMode) {
        void refreshCurrentLocation({ background: true });
      } else {
        void refresh(settings.postalCode, undefined, { background: true });
      }
    };

    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [data, isCurrentLocationMode, refresh, refreshCurrentLocation, settings.postalCode]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updatePreference = () => setSystemPrefersDark(media.matches);
    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    function updateScrollTopVisibility() {
      setShowScrollTop(window.scrollY > 420);
    }

    updateScrollTopVisibility();
    window.addEventListener("scroll", updateScrollTopVisibility, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateScrollTopVisibility);
    };
  }, []);

  const enabledWidgets = useMemo(() => currentConfig.widgets.filter((widget) => widget.enabled), [currentConfig.widgets]);
  const gridLayouts = useMemo(
    () => buildGridLayouts(currentConfig.widgets, currentConfig.gridLayout),
    [currentConfig.gridLayout, currentConfig.widgets]
  );
  const gridLayout = gridLayouts[activeGridBreakpoint] ?? gridLayouts.lg ?? [];
  const presentationLayout = hasLayoutForWidgets(activeGridLayout, enabledWidgets) ? activeGridLayout : gridLayout;
  const weatherTheme = getWeatherTheme(data);
  const activeTheme = settings.theme === "system" ? (systemPrefersDark ? "dark" : "standard") : settings.theme;

  useEffect(() => {
    setActiveGridLayout([]);
  }, [currentMode.id]);

  function updateWidget(id: WidgetId, patch: Partial<WidgetLayout>) {
    updateActiveMode((mode) => {
      const config = mode.config;
      const nextWidgets = config.widgets.map((widget) =>
        widget.id === id ? { ...widget, ...patch } : widget
      );
      return {
        ...mode,
        config: {
          ...config,
          widgets: nextWidgets
        }
      };
    });
  }

  function enableAllWidgets() {
    updateActiveMode((mode) => {
      const config = mode.config;
      return {
        ...mode,
        config: {
          ...config,
          widgets: config.widgets.map((widget) => ({ ...widget, enabled: true }))
        }
      };
    });
  }

  function moveWidgetTo(id: WidgetId, targetId: WidgetId, position: DropPosition) {
    if (id === targetId) return;
    updateActiveMode((mode) => {
      const config = mode.config;
      const widgets = [...config.widgets];
      const fromIndex = widgets.findIndex((widget) => widget.id === id);
      if (fromIndex < 0) return mode;
      const [movedWidget] = widgets.splice(fromIndex, 1);
      const targetIndex = widgets.findIndex((widget) => widget.id === targetId);
      if (targetIndex < 0) return mode;
      widgets.splice(position === "after" ? targetIndex + 1 : targetIndex, 0, movedWidget);
      return {
        ...mode,
        config: {
          ...config,
          widgets
        }
      };
    });
  }

  function saveGridLayouts(layouts: GridLayouts) {
    updateActiveMode((mode) => {
      const config = mode.config;
      const existingGridLayout = config.gridLayout ?? {};
      const nextGridLayout = gridLayoutsToStorage(layouts);
      const layoutChanged = Object.entries(nextGridLayout).some(([breakpoint, breakpointLayout]) => {
        const existingBreakpointLayout = existingGridLayout[breakpoint as GridBreakpoint] ?? {};
        return Object.entries(breakpointLayout).some(([id, item]) => {
          const existing = existingBreakpointLayout[id as WidgetId];
          return !existing || existing.x !== item.x || existing.y !== item.y || existing.w !== item.w || existing.h !== item.h;
        });
      });

      if (!layoutChanged) return mode;

      return {
        ...mode,
        config: {
          ...config,
          gridLayout: {
            ...(config.gridLayout ?? {}),
            ...nextGridLayout
          }
        }
      };
    });
  }

  return (
    <main className={`app-shell ${weatherTheme.className} theme-${activeTheme}`}>
      <div className="weather-backdrop" aria-hidden="true" />
      <div className="shell">
      <header className="topbar">
        <div>
          <h1>Ortblick</h1>
          <p className="weather-mood">
            {weatherTheme.label}
            <button
              type="button"
              className="mode-status-badge"
              style={{ "--mode-color": currentMode.color } as React.CSSProperties}
              onClick={() => setSettingsOpen(true)}
              aria-label={`Widget-Panel öffnen, aktueller Modus: ${currentModeName}`}
            >
              {currentModeName}
            </button>
          </p>
        </div>
        <div className="top-actions">
          <form
            className="search"
            onSubmit={(event) => {
              event.preventDefault();
              void refresh(postalInput.trim());
            }}
          >
            <label htmlFor="postalCode">Postleitzahl oder Ort</label>
            <div className="search-field">
              <input
                id="postalCode"
                inputMode="search"
                value={postalInput}
                onFocus={clearPostalSearch}
                onChange={(event) => {
                  setPostalInput(event.target.value);
                  setLocationChoices([]);
                }}
                placeholder="10115 oder Berlin"
              />
              <button type="submit">Aktualisieren</button>
            </div>
          </form>
          <div className="top-action-buttons">
            <button className="help-toggle" type="button" onClick={() => setHelpOpen(true)}>
              Hilfe
            </button>
            <button className="settings-toggle" type="button" onClick={() => setSettingsOpen(true)}>
              Widgets
            </button>
          </div>
        </div>
      </header>

      <section className="status-strip">
        <div>
          <span>Ort</span>
          <strong>{data ? `${data.location.place}, ${data.location.state}` : "Noch nicht geladen"}</strong>
        </div>
        <div>
          <span>Stand</span>
          <strong>{data ? formatDateTime(data.updatedAt) : "Warte auf Daten"}</strong>
        </div>
        <div>
          <span>Speicherung</span>
          <strong>PLZ, Widgets und Layout lokal</strong>
        </div>
      </section>

      {settingsOpen && (
        <WidgetSettingsPanel
          widgets={currentConfig.widgets}
          modes={settings.modes}
          theme={settings.theme}
          currentModeId={currentMode.id}
          onModeChange={switchMode}
          onModeAdd={addMode}
          onModeRename={renameMode}
          onModeColorChange={changeModeColor}
          onModeDelete={deleteMode}
          onModeDefaultsRestore={restoreDefaultModes}
          onClose={() => setSettingsOpen(false)}
          onMoveTo={moveWidgetTo}
          onUpdate={updateWidget}
          onEnableAll={enableAllWidgets}
          onThemeChange={(theme) => setSettings((current) => ({ ...current, theme }))}
        />
      )}

      {helpOpen && <HelpPanel onClose={closeHelp} onOpenWidgets={() => setSettingsOpen(true)} />}

      {locationChoices.length > 1 && (
        <LocationChoicePanel
          choices={locationChoices}
          searchTerm={postalInput}
          onClose={() => setLocationChoices([])}
          onSelect={(choice) => void refresh(choice.postalCode, choice)}
        />
      )}

      {error && <p className="message notice">{error}</p>}
      {loading && <p className="message">Daten werden geladen...</p>}

      <section className="dashboard-grid" aria-label="Dashboard Widgets">
        {data && (
          <ResponsiveGridLayout
            className="react-grid-dashboard"
            layouts={gridLayouts}
            breakpoints={GRID_BREAKPOINTS}
            cols={GRID_BREAKPOINT_COLUMNS}
            rowHeight={GRID_ROW_HEIGHT}
            margin={GRID_GAP}
            containerPadding={[0, 0]}
            compactType="vertical"
            draggableHandle=".drag-grip"
            isBounded
            isResizable
            resizeHandles={["e", "s", "se"]}
            onBreakpointChange={(breakpoint) => {
              if (isGridBreakpoint(breakpoint)) {
                setActiveGridBreakpoint(breakpoint);
              }
            }}
            onLayoutChange={(layout: Layout, layouts: GridLayouts) => {
              setActiveGridLayout(layout);
              saveGridLayouts(layouts);
            }}
          >
            {enabledWidgets.map((widget) => {
              const layoutItem = presentationLayout.find((item) => item.i === widget.id);
              const defaultSize = getDefaultGridSize(widget);
              const presentation = getWidgetPresentation(layoutItem?.w ?? defaultSize.w, layoutItem?.h ?? defaultSize.h);
              return (
                <div key={widget.id}>
                  <WidgetFrame widget={widget} presentation={presentation}>
                    {renderWidget(widget.id, data, presentation)}
                  </WidgetFrame>
                </div>
              );
            })}
          </ResponsiveGridLayout>
        )}
      </section>

      <footer>
        Daten: OpenPLZ, Zippopotam.us, Open-Meteo, Bright Sky/DWD, DWD Open Data, UBA, PEGELONLINE und lokale SunCalc-Mondberechnung.
      </footer>
      <button
        className={`scroll-top-button ${showScrollTop ? "visible" : ""}`}
        type="button"
        aria-label="Nach oben scrollen"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        ↑
      </button>
      </div>
    </main>
  );
}

function LocationChoicePanel({
  choices,
  searchTerm,
  onClose,
  onSelect
}: {
  choices: LocationChoice[];
  searchTerm: string;
  onClose: () => void;
  onSelect: (choice: LocationChoice) => void;
}) {
  return (
    <div className="location-choice-overlay" role="presentation" onClick={onClose}>
      <aside className="location-choice-drawer" aria-label="PLZ auswählen" onClick={(event) => event.stopPropagation()}>
        <div className="settings-panel-header">
          <div>
            <p className="eyebrow">PLZ auswählen</p>
            <h2>{choices.length} Treffer für {searchTerm}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="PLZ-Auswahl schließen">
            ×
          </button>
        </div>
        <div className="location-choice-list" role="listbox" aria-label="Gefundene Postleitzahlen">
          {choices.map((choice) => {
            const title = `${choice.postalCode} - ${choice.name}`;
            const details = formatLocationChoiceDetails(choice);
            return (
              <button
                key={`${choice.postalCode}-${choice.name}-${choice.district?.name ?? ""}`}
                type="button"
                className="location-choice-item"
                role="option"
                onClick={() => onSelect(choice)}
              >
                <span className="location-choice-copy">
                  <strong>{title}</strong>
                  {details && <small>{details}</small>}
                </span>
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function formatLocationChoiceDetails(choice: LocationChoice) {
  const details = [choice.district?.name, choice.municipality?.name, choice.federalState?.name]
    .filter((detail): detail is string => Boolean(detail))
    .filter((detail, index, allDetails) => {
      const normalizedDetail = normalizeDisplayValue(detail);
      return (
        normalizedDetail !== normalizeDisplayValue(choice.name) &&
        allDetails.findIndex((item) => normalizeDisplayValue(item) === normalizedDetail) === index
      );
    });

  return details.join(" · ");
}

function normalizeDisplayValue(value: string) {
  return value
    .toLowerCase()
    .replace(/,\s*stadt\b/g, "")
    .trim();
}

function HelpPanel({ onClose, onOpenWidgets }: { onClose: () => void; onOpenWidgets: () => void }) {
  return (
    <div className="help-overlay" role="presentation" onClick={onClose}>
      <aside className="help-panel" aria-label="Hilfe zu Ortblick" onClick={(event) => event.stopPropagation()}>
        <div className="settings-panel-header">
          <div>
            <p className="eyebrow">Hilfe</p>
            <h2>Ortblick nutzen</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Hilfe schließen">
            ×
          </button>
        </div>
        <div className="help-content">
          <section>
            <h3>Neu in dieser Version</h3>
            <ul>
              <li>Aktueller Standort ist jetzt ein eigener Modus.</li>
              <li>Beim Wechsel in diesen Modus fragt Ortblick nach deiner Browser-Standortfreigabe und lädt Daten für deine aktuellen Koordinaten.</li>
              <li>Standardmodi lassen sich wiederherstellen.</li>
              <li>Modi lassen sich direkt im Panel umbenennen.</li>
              <li>Das Löschen eines Modus wird vorher bestätigt.</li>
            </ul>
          </section>
          <section>
            <h3>Starten</h3>
            <p>Ortblick funktioniert für Orte und Postleitzahlen in Deutschland. Gib eine deutsche PLZ oder einen Ort ein und aktualisiere die Daten. Bei mehreren PLZ öffnet sich eine Auswahl.</p>
          </section>
          <section>
            <h3>Modus wechseln</h3>
            <p>Das Badge unter dem Titel zeigt den aktuellen Modus. Im Widget-Panel wechselst du per Dropdown zwischen Standard, Jagd, Angler, aktuellem Standort und eigenen Modi.</p>
          </section>
          <section>
            <h3>Aktueller Standort</h3>
            <p>Der Modus Aktueller Standort fragt nach deiner Browser-Standortfreigabe und lädt Wetter, Umwelt- und Kontextdaten für deine aktuellen Koordinaten. Die Standortfreigabe bleibt unter Kontrolle deines Browsers.</p>
          </section>
          <section>
            <h3>Modi bearbeiten</h3>
            <p>Neue Modi starten leer. Mit Farbe, Umbenennen, Löschen und Standardmodi wiederherstellen passt du sie direkt im kompakten Modusbereich an.</p>
          </section>
          <section>
            <h3>Widgets anpassen</h3>
            <p>Jeder Modus hat eigene Widgets und Layouts. Im Widget-Panel schaltest du Widgets ein oder aus, ziehst die Reihenfolge und klappst Rubriken ein. Die Größe änderst du direkt im Dashboard.</p>
          </section>
          <section>
            <h3>Aktualisierung</h3>
            <p>Ortblick lädt beim Öffnen neue Daten und aktualisiert automatisch, wenn du nach längerer Zeit zur App zurückkehrst.</p>
          </section>
        </div>
        <div className="help-actions">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenWidgets();
            }}
          >
            Widgets öffnen
          </button>
          <button type="button" className="secondary-action" onClick={onClose}>
            Verstanden
          </button>
        </div>
      </aside>
    </div>
  );
}

function WidgetSettingsPanel({
  widgets,
  modes,
  theme,
  currentModeId,
  onModeChange,
  onModeAdd,
  onModeRename,
  onModeColorChange,
  onModeDelete,
  onModeDefaultsRestore,
  onClose,
  onMoveTo,
  onUpdate,
  onEnableAll,
  onThemeChange
}: {
  widgets: WidgetLayout[];
  modes: DashboardMode[];
  theme: ThemeMode;
  currentModeId: string;
  onModeChange: (modeId: string) => void;
  onModeAdd: () => void;
  onModeRename: (modeId: string, name: string) => void;
  onModeColorChange: (modeId: string, color: string) => void;
  onModeDelete: (modeId: string) => void;
  onModeDefaultsRestore: () => void;
  onClose: () => void;
  onMoveTo: (id: WidgetId, targetId: WidgetId, position: DropPosition) => void;
  onUpdate: (id: WidgetId, patch: Partial<WidgetLayout>) => void;
  onEnableAll: () => void;
  onThemeChange: (theme: ThemeMode) => void;
}) {
  const [settingsDragState, setSettingsDragState] = useState<{
    id: WidgetId;
    overId?: WidgetId;
    position?: DropPosition;
  } | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>(() =>
    loadWidgetPanelState(widgetCategories.map((category) => category.id))
  );
  const [isRenamingMode, setIsRenamingMode] = useState(false);
  const [modeNameDraft, setModeNameDraft] = useState("");
  const modeNameInputRef = useRef<HTMLInputElement>(null);
  const renameAddedModeRef = useRef(false);
  const activeMode = modes.find((mode) => mode.id === currentModeId);
  const allWidgetsEnabled = widgets.every((widget) => widget.enabled);

  useEffect(() => {
    setModeNameDraft(activeMode?.name ?? "");
    if (renameAddedModeRef.current) {
      setIsRenamingMode(true);
      renameAddedModeRef.current = false;
    } else {
      setIsRenamingMode(false);
    }
  }, [activeMode?.name, currentModeId]);

  useEffect(() => {
    if (!isRenamingMode) return;
    modeNameInputRef.current?.focus();
    modeNameInputRef.current?.select();
  }, [isRenamingMode]);

  const commitModeRename = () => {
    if (!activeMode) return;
    onModeRename(activeMode.id, modeNameDraft.trim());
    setIsRenamingMode(false);
  };

  const cancelModeRename = () => {
    setModeNameDraft(activeMode?.name ?? "");
    setIsRenamingMode(false);
  };

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories((current) => {
      const next = {
        ...current,
        [categoryId]: !current[categoryId]
      };
      saveWidgetPanelState(next);
      return next;
    });
  };

  return (
    <div className="settings-overlay" role="presentation" onClick={onClose}>
      <aside className="settings-panel" aria-label="Widget-Konfiguration" onClick={(event) => event.stopPropagation()}>
        <div className="settings-panel-header">
          <div>
            <p className="eyebrow">Layout</p>
            <h2>Widgets</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Widget-Konfiguration schließen">
            ×
          </button>
        </div>
        <label className="theme-select">
          <span>Theme</span>
          <select value={theme} onChange={(event) => onThemeChange(event.target.value as ThemeMode)}>
            <option value="system">System</option>
            <option value="standard">Standard</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <div className="mode-selector-panel">
          <div className="mode-selector-header">
            <span className="mode-selector-label">Modus</span>
            <div className="mode-header-actions">
              <button
                type="button"
                className="mode-add-btn"
                onClick={() => {
                  renameAddedModeRef.current = true;
                  onModeAdd();
                }}
              >
                Neuer Modus
              </button>
            </div>
          </div>
          <button
            type="button"
            className="mode-restore-btn"
            onClick={() => {
              if (window.confirm("Standard, Jagd, Angler und Aktueller Standort wiederherstellen? Eigene Modi und geänderte Modus-Layouts werden ersetzt.")) {
                onModeDefaultsRestore();
              }
            }}
          >
            Standardmodi wiederherstellen
          </button>
          <div
            className="mode-compact-row"
            style={{ "--mode-color": activeMode?.color ?? "#5f6fca" } as React.CSSProperties}
          >
            <span className="mode-color-dot" aria-hidden="true" />
            <select
              value={currentModeId}
              onChange={(event) => onModeChange(event.target.value)}
              aria-label="Aktiven Modus auswählen"
            >
              {modes.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.name.trim() || "Unbenannt"}
                </option>
              ))}
            </select>
            <label className="mode-color-control" aria-label="Farbe des aktiven Modus ändern">
              <input
                type="color"
                value={activeMode?.color ?? "#5f6fca"}
                onChange={(event) => onModeColorChange(currentModeId, event.target.value)}
              />
            </label>
            <button
              type="button"
              className="mode-icon-btn"
              onClick={() => setIsRenamingMode(true)}
              aria-label="Aktiven Modus umbenennen"
              title="Umbenennen"
            >
              Aa
            </button>
            <button
              type="button"
              className="mode-icon-btn mode-delete-btn"
              onClick={() => {
                if (!activeMode) return;
                const modeName = activeMode.name.trim() || "Unbenannt";
                if (window.confirm(`Modus "${modeName}" wirklich löschen?`)) {
                  onModeDelete(activeMode.id);
                }
              }}
              disabled={modes.length <= 1}
              aria-label="Aktiven Modus löschen"
              title="Löschen"
            >
              ×
            </button>
          </div>
          {isRenamingMode && (
            <form
              className="mode-name-editor"
              onSubmit={(event) => {
                event.preventDefault();
                commitModeRename();
              }}
            >
              <input
                ref={modeNameInputRef}
                value={modeNameDraft}
                maxLength={32}
                onChange={(event) => setModeNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelModeRename();
                  }
                }}
                aria-label="Name des aktiven Modus"
                placeholder="Modusname"
              />
              <button type="submit">Speichern</button>
              <button type="button" className="mode-editor-cancel" onClick={cancelModeRename} aria-label="Umbenennen abbrechen">
                ×
              </button>
            </form>
          )}
        </div>
        <div className="widget-panel-actions">
          <button type="button" onClick={onEnableAll} disabled={allWidgetsEnabled}>
            Alle Widgets aktivieren
          </button>
        </div>
        <section className="config-panel">
          {widgetCategories.map((category) => {
            const categoryWidgets = widgets.filter((widget) => category.ids.includes(widget.id));
            if (categoryWidgets.length === 0) return null;
            return (
              <section key={category.id} className="settings-category">
                <button
                  type="button"
                  className="settings-category-header"
                  onClick={() => toggleCategory(category.id)}
                  aria-expanded={!collapsedCategories[category.id]}
                >
                  <div>
                    <h3>{category.title}</h3>
                    <span>{categoryWidgets.length} Widget{categoryWidgets.length === 1 ? "" : "s"}</span>
                  </div>
                  <span className={`category-toggle-icon ${collapsedCategories[category.id] ? "collapsed" : "expanded"}`} aria-hidden="true">
                    ▼
                  </span>
                </button>
                <div
                  className={`category-config-list ${collapsedCategories[category.id] ? "collapsed" : "expanded"}`}
                >
                  {categoryWidgets.map((widget) => {
                    const dropClass = settingsDragState?.overId === widget.id ? `drop-${settingsDragState.position}` : "";
                    return (
                      <article
                        key={widget.id}
                        className={`config-card ${settingsDragState?.id === widget.id ? "dragging" : ""} ${dropClass}`}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", widget.id);
                          setSettingsDragState({ id: widget.id });
                        }}
                        onDragOver={(event) => {
                          const draggedId = settingsDragState?.id ?? (event.dataTransfer.getData("text/plain") as WidgetId);
                          if (!draggedId || draggedId === widget.id) return;
                          event.preventDefault();
                          const rect = event.currentTarget.getBoundingClientRect();
                          const position = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
                          setSettingsDragState({ id: draggedId, overId: widget.id, position });
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const draggedId = settingsDragState?.id ?? (event.dataTransfer.getData("text/plain") as WidgetId);
                          const position = settingsDragState?.position;
                          if (draggedId && position) onMoveTo(draggedId, widget.id, position);
                          setSettingsDragState(null);
                        }}
                        onDragEnd={() => setSettingsDragState(null)}
                      >
                        <label>
                          <span className="config-drag-handle" aria-hidden="true" />
                          <input
                            type="checkbox"
                            checked={widget.enabled}
                            draggable={false}
                            onChange={(event) => onUpdate(widget.id, { enabled: event.target.checked })}
                          />
                          {widgetMeta[widget.id].title}
                        </label>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </section>
      </aside>
    </div>
  );
}

function WidgetFrame({
  widget,
  presentation,
  children
}: {
  widget: WidgetLayout;
  presentation: WidgetPresentation;
  children: React.ReactNode;
}) {
  return (
    <article
      className={`widget ${widget.size} ${widgetMeta[widget.id].accent} widget-${presentation.density} widget-${presentation.heightDensity}`}
      data-grid-columns={presentation.columns}
      data-grid-rows={presentation.rows}
    >
      <div className="widget-heading">
        <div>
          <span className="drag-grip" aria-hidden="true" />
          <h2>{widgetMeta[widget.id].title}</h2>
        </div>
        <WidgetScale columns={presentation.columns} rows={presentation.rows} />
      </div>
      <div className="widget-body">{children}</div>
    </article>
  );
}

function WidgetScale({ columns, rows }: { columns: number; rows: number }) {
  return (
    <span className="widget-scale" aria-label={`${columns} von 12 Spalten, ${rows} Zeilen`} title={`${columns}/12 Spalten · ${rows} Zeilen`}>
      <span className="widget-scale-label">
        {columns}/12 · {rows}h
      </span>
      <span className="widget-scale-bars" aria-hidden="true">
        {Array.from({ length: GRID_COLUMNS }, (_, index) => (
          <i key={index} className={index < columns ? "active" : ""} />
        ))}
      </span>
    </span>
  );
}

function renderWidget(id: WidgetId, data: DashboardData, presentation: WidgetPresentation) {
  switch (id) {
    case "place":
      return <PlaceWidget data={data} />;
    case "weather":
      return <WeatherWidget data={data} presentation={presentation} />;
    case "forecast":
      return <ForecastWidget data={data} presentation={presentation} />;
    case "dwdWeather":
      return <DwdWeatherWidget data={data} />;
    case "pollen":
      return <PollenWidget data={data} />;
    case "dwdPollen":
      return <DwdPollenWidget data={data} />;
    case "air":
      return <AirWidget data={data} />;
    case "ubaAir":
      return <UbaAirWidget data={data} />;
    case "warnings":
      return <WarningsWidget data={data} />;
    case "sun":
      return <SunWidget data={data} />;
    case "moon":
      return <MoonWidget data={data} />;
    case "water":
      return <WaterWidget data={data} presentation={presentation} />;
    case "roofRain":
      return <RoofRainWidget data={data} presentation={presentation} />;
    case "solar":
      return <SolarWidget data={data} presentation={presentation} />;
    case "wind":
      return <WindWidget data={data} />;
    case "pressure":
      return <PressureWidget data={data} presentation={presentation} />;
    case "humidity": {
      const humidity = data.weather.current.humidity;
      if (humidity === null) return <p className="empty">Keine Daten</p>;
      return (
        <>
          <div style={{ textAlign: "center", fontSize: "3rem" }}>💧</div>
          <div style={{ textAlign: "center", fontSize: "2.2rem", fontWeight: 800, marginTop: "12px" }}>
            {Math.round(humidity)}%
          </div>
          <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.9rem", marginTop: "6px" }}>
            Luftfeuchte
          </div>
        </>
      );
    }
  }
}

function PressureWidget({ data, presentation }: { data: DashboardData; presentation: WidgetPresentation }) {
  const [timeframeHours, setTimeframeHours] = useState<24 | 48 | 72>(24);
  const weather = data.weather;
  const pressure = weather.current.pressureMsl;
  const localPressure = weather.current.surfacePressure;
  if (pressure === null) return <p className="empty">Keine Luftdruckdaten verfügbar.</p>;

  const forecastRange = getUpcomingHourlyRange(weather.current.time, weather.hourly.time, weather.hourly.pressureMsl, timeframeHours);
  const nextPressure = forecastRange.values[1] ?? forecastRange.values[0] ?? null;
  const change3h = getHourlyChange(weather.current.time, weather.hourly.time, weather.hourly.pressureMsl, 3);
  const timeframeMaxPressure = maxValue(forecastRange.values);
  const showDetails = presentation.rows >= 8;
  const showControls = presentation.rows >= 10;
  const showChart = presentation.rows >= 11;

  return (
    <div className={`pressure-widget ${showChart ? "has-chart" : ""}`}>
      <div className="pressure-gauge" aria-hidden="true">
        <span style={{ "--pressure-rotation": `${getPressureGaugeRotation(pressure)}deg` } as React.CSSProperties} />
      </div>
      <div className="hero-metric pressure-hero">
        <strong>{formatNumber(pressure, " hPa")}</strong>
        <span>{pressureLabel(pressure)} · Trend {formatSignedPressure(change3h)}</span>
      </div>
      {showDetails ? (
        <div className="metric-row">
          <Metric label="Lokal" value={formatNumber(localPressure, " hPa")} />
          <Metric label="Nächste Std." value={formatNumber(nextPressure, " hPa")} />
          <Metric label={`Max ${timeframeHours}h`} value={formatNumber(timeframeMaxPressure, " hPa")} />
        </div>
      ) : null}
      {showControls ? (
        <div className="segmented-control pressure-timeframe-control" aria-label="Luftdruck-Zeitraum" onPointerDown={(event) => event.stopPropagation()}>
          {[24, 48, 72].map((hours) => (
            <button
              key={hours}
              type="button"
              className={timeframeHours === hours ? "active" : ""}
              onClick={() => setTimeframeHours(hours as 24 | 48 | 72)}
            >
              {hours}h
            </button>
          ))}
        </div>
      ) : null}
      {showChart ? <PressureTrendChart times={forecastRange.times} values={forecastRange.values} timeframeHours={timeframeHours} /> : null}
    </div>
  );
}

function WindWidget({ data }: { data: DashboardData }) {
  const weather = data.weather;
  const windSpeed = weather.current.windSpeed;
  const windDirection = weather.current.windDirection;
  if (windSpeed === null) return <p className="empty">Keine Winddaten verfügbar.</p>;

  const direction = windDirection !== null ? getWindDirection(windDirection) : null;
  const beaufort = getBeaufort(windSpeed);
  const currentGust = weather.current.windGusts ?? data.brightSky?.windGust ?? null;
  const maxSpeedToday = weather.daily.windSpeedMax[0] ?? maxToday(weather.hourly.time, weather.hourly.windSpeed);
  const maxGustToday = weather.daily.windGustsMax[0] ?? maxToday(weather.hourly.time, weather.hourly.windGusts);
  const dominantDirection = weather.daily.windDirectionDominant[0];
  const trend = getWindTrend(weather.current.time, weather.hourly.time, weather.hourly.windSpeed);
  const nextGust = getNextHourlyValue(weather.current.time, weather.hourly.time, weather.hourly.windGusts);
  const dwdDistance = data.brightSky?.distance;

  return (
    <div className="wind-widget">
      <div className="wind-compass" aria-hidden="true">
        <span style={{ transform: `rotate(${windDirection ?? 0}deg)` }}>↓</span>
      </div>
      <div className="hero-metric wind-hero">
        <strong>{formatNumber(windSpeed, " km/h")}</strong>
        <span>{[direction?.short, beaufort.label, `${beaufort.value} Bft`].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="metric-row">
        <Metric label="Böe jetzt" value={formatNumber(currentGust, " km/h")} />
        <Metric label="Max heute" value={formatNumber(maxSpeedToday, " km/h")} />
        <Metric label="Böe max" value={formatNumber(maxGustToday, " km/h")} />
      </div>
      <div className="detail-list">
        <Metric label="Richtung" value={direction ? `${direction.long} (${Math.round(windDirection ?? 0)}°)` : "n/a"} />
        <Metric
          label="Tagesrichtung"
          value={dominantDirection === null || dominantDirection === undefined ? "n/a" : getWindDirection(dominantDirection).long}
        />
        <Metric label="Trend 3h" value={trend} />
        <Metric label="Nächste Böe" value={formatNumber(nextGust, " km/h")} />
        <Metric
          label="DWD-Station"
          value={dwdDistance === null || dwdDistance === undefined ? "n/a" : `${data.brightSky?.stationName ?? "DWD"} · ${formatDistance(dwdDistance)}`}
        />
      </div>
    </div>
  );
}

function PlaceWidget({ data }: { data: DashboardData }) {
  const place = data.place;
  if (!place) return <p className="empty">OpenPLZ-Daten sind für diese PLZ gerade nicht verfügbar.</p>;
  return (
    <div className="detail-list">
      <Metric label="Ort" value={place.name} />
      <Metric label="Gemeinde" value={place.municipality ?? "n/a"} />
      <Metric label="Kreis" value={place.district ? `${place.districtType ?? "Kreis"} ${place.district}` : "n/a"} />
      <Metric label="Bundesland" value={place.federalState ?? data.location.state} />
    </div>
  );
}

function WeatherWidget({ data, presentation }: { data: DashboardData; presentation: WidgetPresentation }) {
  const current = data.weather.current;
  const nextHourIndexes = getUpcomingHourIndexes(data.weather.hourly.time, 8);
  const dayHours = data.weather.hourly.time.slice(0, 24);
  const showMetrics = presentation.rows >= 6;
  const showHourlyStrip = presentation.density !== "narrow" && presentation.rows >= 11;
  const showChart = presentation.rows >= 12;
  return (
    <>
      <div className="hero-metric">
        <strong>{formatNumber(current.temperature, "°C")}</strong>
        <span>{labelWeather(current.weatherCode)} · gefühlt {formatNumber(current.apparentTemperature, "°C")}</span>
      </div>
      {showMetrics ? (
        <div className="metric-row">
          <Metric label="Feuchte" value={formatNumber(current.humidity, "%")} />
          <Metric label="Wind" value={formatNumber(current.windSpeed, " km/h")} />
          <Metric label="Regen jetzt" value={formatNumber(current.precipitation, " mm")} />
        </div>
      ) : null}
      {showHourlyStrip ? (
        <>
          <div className="hourly-strip-heading">
            <strong>Nächste Stunden</strong>
            <span>Temperatur · Regenchance</span>
          </div>
          <div className="spark-list">
            {nextHourIndexes.map((hourIndex, position) => (
              <div key={data.weather.hourly.time[hourIndex]}>
                <span>{position === 0 ? "Jetzt" : formatHour(data.weather.hourly.time[hourIndex])}</span>
                <strong>{formatNumber(data.weather.hourly.temperature[hourIndex], "°")}</strong>
                <small>Regen {formatNumber(data.weather.hourly.precipitationProbability[hourIndex], "%")}</small>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {showChart ? (
        <WeatherTrendChart
          times={dayHours}
          temperatures={data.weather.hourly.temperature.slice(0, 24)}
          precipitation={data.weather.hourly.precipitationProbability.slice(0, 24)}
        />
      ) : null}
    </>
  );
}

function ForecastWidget({ data, presentation }: { data: DashboardData; presentation: WidgetPresentation }) {
  const days = data.weather.daily.time.slice(0, 3).map((time, index) => ({
    time,
    label: formatForecastDay(time, index),
    weatherCode: data.weather.daily.weatherCode[index] ?? null,
    temperatureMax: data.weather.daily.temperatureMax[index] ?? null,
    temperatureMin: data.weather.daily.temperatureMin[index] ?? null,
    precipitationSum: data.weather.daily.precipitationSum[index] ?? null,
    uvIndexMax: data.weather.daily.uvIndexMax[index] ?? null,
    windSpeedMax: data.weather.daily.windSpeedMax[index] ?? null,
    windGustsMax: data.weather.daily.windGustsMax[index] ?? null
  }));

  if (days.length === 0) return <p className="empty">Keine Vorhersagedaten verfügbar.</p>;

  const showDetails = presentation.rows >= 9;
  const compact = presentation.density === "narrow";

  return (
    <div className={`forecast-widget ${compact ? "forecast-compact" : ""}`}>
      {days.map((day) => (
        <section key={day.time} className="forecast-day">
          <div className="forecast-day-heading">
            <div>
              <span>{day.label}</span>
              <strong>{labelWeather(day.weatherCode)}</strong>
            </div>
            <span className={`forecast-symbol ${getWeatherSymbolClass(day.weatherCode)}`} aria-hidden="true" />
          </div>
          <div className="forecast-temp">
            <strong>{formatNumber(day.temperatureMax, "°")}</strong>
            <span>{formatNumber(day.temperatureMin, "°")} min</span>
          </div>
          <div className="forecast-bars" aria-hidden="true">
            <span style={{ "--forecast-temp": getTemperatureBar(day.temperatureMax) } as React.CSSProperties} />
          </div>
          {showDetails ? (
            <div className="forecast-detail-grid">
              <Metric label="Regen" value={formatNumber(day.precipitationSum, " mm")} />
              <Metric label="UV" value={formatNumber(day.uvIndexMax, "")} />
              {compact ? null : (
                <>
                  <Metric label="Wind" value={formatNumber(day.windSpeedMax, " km/h")} />
                  <Metric label="Böen" value={formatNumber(day.windGustsMax, " km/h")} />
                </>
              )}
            </div>
          ) : (
            <div className="source-line forecast-summary">
              <span>{formatNumber(day.precipitationSum, " mm")} Regen</span>
              <span>{formatNumber(day.windSpeedMax, " km/h")} Wind</span>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function PollenWidget({ data }: { data: DashboardData }) {
  const pollen = [
    ["Erle", maxToday(data.air.hourly.time, data.air.hourly.alder)],
    ["Birke", maxToday(data.air.hourly.time, data.air.hourly.birch)],
    ["Gräser", maxToday(data.air.hourly.time, data.air.hourly.grass)],
    ["Beifuß", maxToday(data.air.hourly.time, data.air.hourly.mugwort)],
    ["Ambrosia", maxToday(data.air.hourly.time, data.air.hourly.ragweed)]
  ] as const;
  return <BarList items={pollen.map(([label, value]) => ({ label, value, detail: pollenLevel(value) }))} max={80} />;
}

function DwdWeatherWidget({ data }: { data: DashboardData }) {
  const dwd = data.brightSky;
  if (!dwd) return <p className="empty">Bright-Sky/DWD-Daten sind für diesen Ort gerade nicht verfügbar.</p>;
  return (
    <>
      <div className="hero-metric">
        <strong>{formatNumber(dwd.temperature, "°C")}</strong>
        <span>
          {translateCondition(dwd.condition)} · {dwd.stationName}
        </span>
      </div>
      <div className="metric-row">
        <Metric label="Böe" value={formatNumber(dwd.windGust, " km/h")} />
        <Metric label="Sonne" value={formatNumber(dwd.sunshine, " min")} />
        <Metric label="Solar" value={formatNumber(dwd.solar === null ? null : dwd.solar * 1000, " W/m²")} />
      </div>
      {dwd.alerts.length > 0 ? (
        <div className="mini-list">
          {dwd.alerts.map((alert) => (
            <p key={alert.id}>{alert.headline}</p>
          ))}
        </div>
      ) : (
        <p className="empty">Keine Bright-Sky-DWD-Warnung am Standort.</p>
      )}
    </>
  );
}

function DwdPollenWidget({ data }: { data: DashboardData }) {
  const pollen = data.dwdPollen;
  if (!pollen) return <p className="empty">DWD-Pollenflug-Gefahrenindex gerade nicht verfügbar.</p>;
  return (
    <>
      <div className="source-line">
        <strong>{pollen.partRegionName || pollen.regionName}</strong>
        <span>{pollen.lastUpdate}</span>
      </div>
      <BarList
        items={pollen.pollen.map((item) => ({
          label: item.name,
          value: pollenIndexValue(item.today),
          detail: pollenHazardLabel(item.today)
        }))}
        max={3}
      />
      <PollenTrendChart pollen={pollen.pollen} />
    </>
  );
}

function AirWidget({ data }: { data: DashboardData }) {
  const air = data.air.current;
  return (
    <>
      <div className="hero-metric">
        <strong>{air.europeanAqi ?? "n/a"}</strong>
        <span>Europäischer AQI · {aqiLabel(air.europeanAqi)}</span>
      </div>
      <div className="metric-row">
        <Metric label="PM10" value={formatNumber(air.pm10, " µg/m³")} />
        <Metric label="PM2.5" value={formatNumber(air.pm25, " µg/m³")} />
        <Metric label="Ozon" value={formatNumber(air.ozone, " µg/m³")} />
      </div>
    </>
  );
}

function UbaAirWidget({ data }: { data: DashboardData }) {
  const uba = data.ubaAir;
  if (!uba) return <p className="empty">UBA-Luftdaten sind gerade nicht verfügbar.</p>;
  return (
    <>
      <div className="source-line">
        <strong>{uba.stationName}</strong>
        <span>{formatDistance(uba.distance)} entfernt</span>
      </div>
      <div className="hero-metric">
        <strong>{uba.totalIndex ?? "n/a"}</strong>
        <span>Amtlicher Luftqualitätsindex · {ubaIndexLabel(uba.totalIndex)}</span>
      </div>
      <div className="metric-row">
        {uba.components.slice(0, 3).map((component) => (
          <Metric key={component.id} label={component.name} value={formatNumber(component.value, " µg/m³")} />
        ))}
      </div>
    </>
  );
}

function WarningsWidget({ data }: { data: DashboardData }) {
  if (data.warnings.length === 0) {
    return <p className="empty">Keine passenden aktiven DWD-Warnungen für Ort oder Bundesland gefunden.</p>;
  }

  return (
    <div className="warning-list">
      {data.warnings.map((warning) => (
        <section key={warning.id} className={`warning level-${Math.min(warning.level, 4)}`}>
          <strong>{warning.headline}</strong>
          <span>{warning.regionName}</span>
          <p>{warning.description}</p>
          <small>
            {formatEpoch(warning.start)} bis {formatEpoch(warning.end)}
          </small>
        </section>
      ))}
    </div>
  );
}

function SunWidget({ data }: { data: DashboardData }) {
  const today = data.weather.daily;
  return (
    <>
      <div className="sun-times">
        <div>
          <span>Aufgang</span>
          <strong>{formatHour(today.sunrise[0])}</strong>
        </div>
        <div>
          <span>Untergang</span>
          <strong>{formatHour(today.sunset[0])}</strong>
        </div>
      </div>
      <div className="metric-row">
        <Metric label="UV max" value={formatNumber(today.uvIndexMax[0], "")} />
        <Metric label="Tagesmax" value={formatNumber(today.temperatureMax[0], "°C")} />
        <Metric label="Tagesmin" value={formatNumber(today.temperatureMin[0], "°C")} />
      </div>
    </>
  );
}

function MoonWidget({ data }: { data: DashboardData }) {
  const moon = data.moon;
  const illuminationPercent = Math.round(moon.illumination * 100);
  const shadowOffset = getMoonShadowOffset(moon.illumination);
  const isWaxing = moon.phase > 0 && moon.phase < 0.5;
  return (
    <>
      <div className="moon-hero">
        <div
          className={`moon-visual ${isWaxing ? "waxing" : "waning"}`}
          style={
            {
              "--moon-shadow-offset": `${shadowOffset}%`
            } as React.CSSProperties
          }
          aria-label={`${moon.phaseName}, ${illuminationPercent} Prozent beleuchtet`}
        >
          <div className="moon-shadow" />
        </div>
        <div>
          <strong>{moon.phaseName}</strong>
          <span>{illuminationPercent}% beleuchtet · {isWaxing ? "zunehmend" : "abnehmend"}</span>
        </div>
      </div>
      <div className="sun-times moon-times">
        <div>
          <span>Aufgang</span>
          <strong>{formatMoonEvent(moon.rise, moon)}</strong>
        </div>
        <div>
          <span>Untergang</span>
          <strong>{formatMoonEvent(moon.set, moon)}</strong>
        </div>
      </div>
      <div className="metric-row">
        <Metric label="Höhe" value={`${Math.round(toDegrees(moon.altitude))}°`} />
        <Metric label="Azimut" value={`${Math.round(toDegrees(moon.azimuth) + 180)}°`} />
        <Metric label="Distanz" value={`${Math.round(moon.distance / 1000)} Tsd. km`} />
      </div>
    </>
  );
}

function WaterWidget({ data, presentation }: { data: DashboardData; presentation: WidgetPresentation }) {
  const water = data.water;
  if (!water) return <p className="empty">Kein PEGELONLINE-Pegel im näheren Umfeld gefunden.</p>;
  const showChart = presentation.rows >= 12;
  const showDetails =
    presentation.rows >= 8 &&
    (!showChart || presentation.rows >= 24 || (presentation.density === "wide" && presentation.rows >= 18));
  return (
    <div className={`water-widget ${showDetails ? "has-details" : ""} ${showChart ? "has-chart" : ""}`}>
      <div className="hero-metric">
        <strong>{formatNumber(water.value, ` ${water.unit}`)}</strong>
        <span>{water.stationName}</span>
      </div>
      {showDetails ? (
        <div className="detail-list">
          <Metric label="Gewässer" value={water.waterName} />
          <Metric label="Entfernung" value={formatDistance(water.distance)} />
          <Metric label="Status" value={translateWaterState(water.state)} />
          <Metric label="Nächste Tide" value={formatNextTide(water.nextTide)} />
        </div>
      ) : null}
      {showChart ? <WaterLevelChart history={water.history} unit={water.unit} /> : null}
    </div>
  );
}

function RoofRainWidget({ data, presentation }: { data: DashboardData; presentation: WidgetPresentation }) {
  const [settings, setSettings] = useState<RoofRainSettings>(() => loadRoofRainSettings());
  const rainForTimeframe = getNextPrecipitation(
    data.weather.current.time,
    data.weather.hourly.time,
    data.weather.hourly.precipitation,
    settings.timeframeHours
  );
  const activeArea = settings.areaInput.trim() === "" ? 0 : settings.area;
  const projectedArea = settings.areaMode === "roof" ? activeArea * Math.cos((settings.roofPitch * Math.PI) / 180) : activeArea;
  const collectedLiters = rainForTimeframe === null ? null : rainForTimeframe * projectedArea * settings.runoffFactor;
  const areaModeLabel = settings.areaMode === "roof" ? `Schrägdach ${settings.roofPitch}°` : "Grundfläche";
  const showMetrics = presentation.rows >= 7;
  const showControls = presentation.rows >= 13;
  const showSource = presentation.rows >= 9;

  const updateAreaInput = (value: string) => {
    const area = value.trim() === "" ? 0 : Number(value);
    updateRoofRainSettings({
      areaInput: value,
      ...(Number.isFinite(area) ? { area } : {})
    });
  };

  const updateRoofRainSettings = (patch: Partial<RoofRainSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveRoofRainSettings(next);
      return next;
    });
  };

  return (
    <div className={`roof-rain-widget roof-rain-${presentation.density}`}>
      <div className="hero-metric roof-rain-hero">
        <strong>{collectedLiters === null ? "n/a" : `${formatCompactLiters(collectedLiters)} L`}</strong>
        <span>in den nächsten {settings.timeframeHours} Stunden</span>
      </div>
      {showMetrics ? (
        <div className="metric-row">
          <Metric label="Regen" value={rainForTimeframe === null ? "n/a" : `${formatDecimal(rainForTimeframe, 1)} mm`} />
          <Metric
            label={
              <>
                Auffangfläche
                <InfoTooltip text="Regen wird auf die horizontale Grundfläche gemessen. Bei Schrägdächern rechnet das Widget die angegebene Dachfläche über cos(Dachneigung) auf diese Auffangfläche um." />
              </>
            }
            value={`${formatDecimal(projectedArea, 0)} m²`}
          />
          <Metric label="Abfluss" value={`${Math.round(settings.runoffFactor * 100)}%`} />
        </div>
      ) : null}
      {showControls ? (
        <div className="roof-rain-controls" onPointerDown={(event) => event.stopPropagation()} onDragStart={(event) => event.preventDefault()}>
        <div className="segmented-control timeframe-control" aria-label="Zeitraum">
          {[24, 48, 72].map((hours) => (
            <button
              key={hours}
              type="button"
              className={settings.timeframeHours === hours ? "active" : ""}
              onClick={() => updateRoofRainSettings({ timeframeHours: hours as 24 | 48 | 72 })}
            >
              {hours}h
            </button>
          ))}
        </div>
        <div className="segmented-control" aria-label="Dachflächen-Modus">
          <button
            type="button"
            className={settings.areaMode === "ground" ? "active" : ""}
            onClick={() => updateRoofRainSettings({ areaMode: "ground" })}
          >
            Grundfläche
          </button>
          <button
            type="button"
            className={settings.areaMode === "roof" ? "active" : ""}
            onClick={() => updateRoofRainSettings({ areaMode: "roof" })}
          >
            Schräge Dachfläche
          </button>
        </div>
        <label className="roof-rain-field">
          <span>Fläche</span>
          <input
            type="number"
            min="0"
            max="2000"
            step="1"
            value={settings.areaInput}
            onChange={(event) => updateAreaInput(event.target.value)}
          />
          <small>m²</small>
        </label>
        {settings.areaMode === "roof" ? (
          <label className="roof-rain-field">
            <span>Neigung</span>
            <select value={settings.roofPitch} onChange={(event) => updateRoofRainSettings({ roofPitch: Number(event.target.value) })}>
              {[10, 20, 30, 35, 45, 55].map((pitch) => (
                <option key={pitch} value={pitch}>
                  {pitch}°
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="roof-rain-field">
          <span>Abfluss</span>
          <select value={settings.runoffFactor} onChange={(event) => updateRoofRainSettings({ runoffFactor: Number(event.target.value) })}>
            <option value={0.9}>realistisch 90%</option>
            <option value={0.95}>optimal 95%</option>
            <option value={1}>roh 100%</option>
          </select>
        </label>
        </div>
      ) : null}
      {showSource ? (
        <div className="source-line">
          <strong>{areaModeLabel}</strong>
          <span>Open-Meteo · {settings.timeframeHours}h Summe</span>
        </div>
      ) : null}
    </div>
  );
}

function SolarWidget({ data, presentation }: { data: DashboardData; presentation: WidgetPresentation }) {
  const [settings, setSettings] = useState<SolarSettings>(() => loadSolarSettings());
  const [solar, setSolar] = useState<SolarForecastData | null>(null);
  const [solarError, setSolarError] = useState<string | null>(null);
  const [solarLoading, setSolarLoading] = useState(true);
  const showMetrics = presentation.rows >= 7;
  const showChart = presentation.rows >= 9;
  const showDayStrip = presentation.rows >= 11;
  const showControls = presentation.rows >= 14;
  const showSource = presentation.rows >= 9;

  useEffect(() => {
    let cancelled = false;
    setSolarLoading(true);
    setSolarError(null);
    loadSolarForecast(data.location, settings)
      .then((forecast) => {
        if (cancelled) return;
        setSolar(forecast);
      })
      .catch(() => {
        if (cancelled) return;
        setSolar(null);
        setSolarError("Solardaten sind gerade nicht verfügbar.");
      })
      .finally(() => {
        if (!cancelled) setSolarLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [data.location.latitude, data.location.longitude, settings.azimuth, settings.systemPeakKw, settings.tilt]);

  const updateSolarSettings = (patch: Partial<SolarSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSolarSettings(next);
      return next;
    });
  };

  const updateSystemPeakInput = (value: string) => {
    const systemPeakKw = value.trim() === "" ? 0 : Number(value);
    updateSolarSettings({
      systemPeakInput: value,
      ...(Number.isFinite(systemPeakKw) ? { systemPeakKw } : {})
    });
  };

  const selectedHours = solar ? getUpcomingHourlyRange(data.weather.current.time, solar.time, solar.powerKw, settings.timeframeHours) : null;
  const selectedEnergyKwh = selectedHours ? sumHourlyEnergy(selectedHours.values) : null;
  const bestSolarPhase = selectedHours ? getBestSolarPhase(selectedHours.times, selectedHours.values, 3) : null;
  const sourceText = `${formatAzimuth(settings.azimuth)} · ${settings.tilt}° · ${formatDecimal(settings.systemPeakKw, 1)} kWp`;

  return (
    <div className={`solar-widget solar-${presentation.density}`}>
      <div className="hero-metric solar-hero">
        <strong>{solarLoading ? "..." : formatKwh(selectedEnergyKwh)}</strong>
        <span>Ertrag in den nächsten {settings.timeframeHours} Stunden</span>
      </div>
      {solarError ? <p className="empty">{solarError}</p> : null}
      {showMetrics ? (
        <div className="metric-row">
          <Metric label="Jetzt" value={solarLoading ? "..." : formatKw(solar?.currentPowerKw ?? null)} />
          <Metric label="Beste Phase" value={solarLoading ? "..." : formatSolarPhase(bestSolarPhase)} />
          <Metric label={`Peak ${settings.timeframeHours}h`} value={solarLoading ? "..." : formatKw(maxValue(selectedHours?.values ?? []))} />
        </div>
      ) : null}
      {showDayStrip ? (
        <div className="solar-day-strip">
          <Metric label="Heute" value={solarLoading ? "..." : formatKwh(solar?.todayKwh ?? null)} />
          <Metric label="Morgen" value={solarLoading ? "..." : formatKwh(solar?.tomorrowKwh ?? null)} />
          <Metric label="Übermorgen" value={solarLoading ? "..." : formatKwh(solar?.dayAfterTomorrowKwh ?? null)} />
        </div>
      ) : null}
      {showChart && selectedHours ? (
        <SolarPowerChart
          times={selectedHours.times}
          values={selectedHours.values}
          timeframeHours={settings.timeframeHours}
        />
      ) : null}
      {showControls ? (
        <div className="solar-controls" onPointerDown={(event) => event.stopPropagation()} onDragStart={(event) => event.preventDefault()}>
          <div className="segmented-control timeframe-control" aria-label="Solar-Zeitraum">
            {[24, 48, 72].map((hours) => (
              <button
                key={hours}
                type="button"
                className={settings.timeframeHours === hours ? "active" : ""}
                onClick={() => updateSolarSettings({ timeframeHours: hours as 24 | 48 | 72 })}
              >
                {hours}h
              </button>
            ))}
          </div>
          <label className="solar-field">
            <span>Anlage</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={settings.systemPeakInput}
              onChange={(event) => updateSystemPeakInput(event.target.value)}
            />
            <small>kWp</small>
          </label>
          <label className="solar-field">
            <span>Ausrichtung</span>
            <select value={settings.azimuth} onChange={(event) => updateSolarSettings({ azimuth: Number(event.target.value) })}>
              <option value={-90}>Ost</option>
              <option value={-45}>Südost</option>
              <option value={0}>Süd</option>
              <option value={45}>Südwest</option>
              <option value={90}>West</option>
            </select>
          </label>
          <label className="solar-field">
            <span>Winkel</span>
            <select value={settings.tilt} onChange={(event) => updateSolarSettings({ tilt: Number(event.target.value) })}>
              {[10, 20, 30, 35, 45, 55].map((tilt) => (
                <option key={tilt} value={tilt}>
                  {tilt}°
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {showSource ? (
        <div className="source-line">
          <strong>{sourceText}</strong>
          <span>Open-Meteo GTI</span>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="info-tooltip">
      <button type="button" aria-label={text}>
        i
      </button>
      <span role="tooltip">{text}</span>
    </span>
  );
}

function BarList({ items, max }: { items: Array<{ label: string; value: number | null; detail: string }>; max: number }) {
  return (
    <div className="bar-list">
      {items.map((item) => (
        <div key={item.label} className="bar-item">
          <div>
            <span>{item.label}</span>
            <strong>{item.detail}</strong>
          </div>
          <meter min={0} max={max} value={item.value ?? 0} />
        </div>
      ))}
    </div>
  );
}

function WeatherTrendChart({
  times,
  temperatures,
  precipitation
}: {
  times: string[];
  temperatures: Array<number | null>;
  precipitation: Array<number | null>;
}) {
  const tempValues = temperatures.filter((value): value is number => value !== null);
  if (times.length === 0 || tempValues.length === 0) return null;
  const min = Math.min(...tempValues);
  const max = Math.max(...tempValues);
  const chartMax = max === min ? min + 1 : max;
  const tempPoints = temperatures
    .map((value, index) => {
      if (value === null) return null;
      const x = scale(index, 0, Math.max(temperatures.length - 1, 1), 10, 290);
      const y = scale(value, min, chartMax, 90, 18);
      return { x, y, value, label: times[index] };
    })
    .filter((point): point is ChartPoint => point !== null);
  const latestPoint = tempPoints.at(-1);
  const peakPoint = tempPoints.reduce((peak, point) => (point.value > peak.value ? point : peak), tempPoints[0]);
  const linePath = buildLinePath(tempPoints);
  const areaPath = buildAreaPath(tempPoints, 96);
  const nowMarkerX = getCurrentTimeMarkerX(times);

  return (
    <div className="chart-card">
      <div className="chart-heading">
        <strong>24h Verlauf</strong>
        <span>
          {Math.round(min)}° bis {Math.round(max)}°
        </span>
      </div>
      <div className="chart-legend" aria-hidden="true">
        <span className="legend-chip temperature">Temperatur</span>
        <span className="legend-chip rain">Regenchance</span>
      </div>
      <svg className="trend-chart" viewBox="0 0 300 124" role="img" aria-label="Temperatur und Regenwahrscheinlichkeit für 24 Stunden">
        <defs>
          <linearGradient id="temperature-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f0a339" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#f0a339" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {[24, 52, 80].map((y) => (
          <line key={y} className="chart-grid" x1="10" x2="290" y1={y} y2={y} />
        ))}
        <path className="chart-area temperature-area" d={areaPath} />
        {nowMarkerX !== null ? (
          <g className="now-marker">
            <line x1={nowMarkerX} x2={nowMarkerX} y1="18" y2="100" />
            <circle cx={nowMarkerX} cy="18" r="3.5" />
            <text x={nowMarkerX} y="12" textAnchor="middle">
              Jetzt
            </text>
          </g>
        ) : null}
        <g className="rain-bars">
          {precipitation.map((value, index) => {
            const height = scale(value ?? 0, 0, 100, 0, 32);
            const x = scale(index, 0, Math.max(precipitation.length - 1, 1), 10, 286);
            return <rect key={`${times[index]}-rain`} x={x - 3} y={99 - height} width="6" height={height} rx="3" />;
          })}
        </g>
        <path className="chart-line temperature-line" d={linePath} />
        {peakPoint ? <circle className="chart-dot peak-dot" cx={peakPoint.x} cy={peakPoint.y} r="4" /> : null}
        {latestPoint ? <circle className="chart-dot current-dot" cx={latestPoint.x} cy={latestPoint.y} r="4.8" /> : null}
        <text className="chart-axis" x="10" y="116">
          {formatHour(times[0])}
        </text>
        <text className="chart-axis" x="290" y="116" textAnchor="end">
          {formatHour(times[Math.min(23, times.length - 1)])}
        </text>
      </svg>
    </div>
  );
}

function PressureTrendChart({ times, values, timeframeHours }: { times: string[]; values: Array<number | null>; timeframeHours: 24 | 48 | 72 }) {
  const pressureValues = values.filter((value): value is number => value !== null);
  if (times.length === 0 || pressureValues.length < 2) return null;

  const min = Math.min(...pressureValues);
  const max = Math.max(...pressureValues);
  const chartMin = min === max ? min - 1 : min;
  const chartMax = min === max ? max + 1 : max;
  const points = values
    .map((value, index) => {
      if (value === null) return null;
      const x = scale(index, 0, Math.max(values.length - 1, 1), 10, 290);
      const y = scale(value, chartMin, chartMax, 90, 18);
      return { x, y, value, label: times[index] };
    })
    .filter((point): point is ChartPoint => point !== null);
  const latestPoint = points.at(-1);
  const linePath = buildLinePath(points);
  const areaPath = buildAreaPath(points, 96);
  const nowMarkerX = getCurrentTimeMarkerX(times);

  return (
    <div className="chart-card">
      <div className="chart-heading">
        <strong>{timeframeHours}h Luftdruck</strong>
        <span>
          {Math.round(min)}-{Math.round(max)} hPa
        </span>
      </div>
      <svg className="line-chart pressure-chart" viewBox="0 0 300 124" role="img" aria-label="Luftdruckverlauf für 24 Stunden">
        <defs>
          <linearGradient id="pressure-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7967a8" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#7967a8" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {[24, 52, 80].map((y) => (
          <line key={y} className="chart-grid" x1="10" x2="290" y1={y} y2={y} />
        ))}
        <path className="chart-area pressure-area" d={areaPath} />
        {nowMarkerX !== null ? (
          <g className="now-marker">
            <line x1={nowMarkerX} x2={nowMarkerX} y1="18" y2="100" />
            <circle cx={nowMarkerX} cy="18" r="3.5" />
            <text x={nowMarkerX} y="12" textAnchor="middle">
              Jetzt
            </text>
          </g>
        ) : null}
        <path className="chart-line pressure-line" d={linePath} />
        {latestPoint ? <circle className="chart-dot pressure-dot" cx={latestPoint.x} cy={latestPoint.y} r="4.8" /> : null}
        <text className="chart-axis" x="10" y="116">
          {formatHour(times[0])}
        </text>
        <text className="chart-axis" x="290" y="116" textAnchor="end">
          {formatHour(times[times.length - 1])}
        </text>
      </svg>
    </div>
  );
}

function PollenTrendChart({
  pollen
}: {
  pollen: Array<{
    name: string;
    today: string;
    tomorrow: string;
    dayAfter: string;
  }>;
}) {
  const visible = pollen.slice(0, 8);
  return (
    <div className="chart-card">
      <div className="chart-heading">
        <strong>Belastungstrend</strong>
        <span>DWD Index 0-3</span>
      </div>
      <div className="pollen-matrix" role="img" aria-label="Pollenbelastung heute, morgen und übermorgen">
        <div className="pollen-matrix-head">
          <span />
          <span>Heute</span>
          <span>Morgen</span>
          <span>+2</span>
        </div>
        {visible.map((item) => {
          const values = [item.today, item.tomorrow, item.dayAfter];
          return (
            <div key={item.name} className="pollen-matrix-row">
              <span>{item.name}</span>
              {values.map((value, index) => (
                <i key={`${item.name}-${index}`} className={`pollen-cell level-${pollenIndexValue(value)}`} title={pollenHazardLabel(value)}>
                  {pollenIndexValue(value)}
                </i>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WaterLevelChart({
  history,
  unit
}: {
  history: Array<{
    time: string;
    value: number | null;
  }>;
  unit: string;
}) {
  const values = history.map((item) => item.value).filter((value): value is number => value !== null);
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const chartMax = max === min ? min + 1 : max;
  const waterPoints = history
    .map((item, index) => {
      if (item.value === null) return null;
      const x = scale(index, 0, Math.max(history.length - 1, 1), 10, 290);
      const y = scale(item.value, min, chartMax, 88, 18);
      return { x, y, value: item.value, label: item.time };
    })
    .filter((point): point is ChartPoint => point !== null);
  const latestPoint = waterPoints.at(-1);
  const linePath = buildLinePath(waterPoints);
  const areaPath = buildAreaPath(waterPoints, 96);

  return (
    <div className="chart-card">
      <div className="chart-heading">
        <strong>48h Pegel</strong>
        <span>
          {Math.round(min)}-{Math.round(max)} {unit}
        </span>
      </div>
      <svg className="line-chart" viewBox="0 0 300 124" role="img" aria-label="Pegelverlauf der letzten 48 Stunden">
        <defs>
          <linearGradient id="water-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2f89b8" stopOpacity="0.36" />
            <stop offset="100%" stopColor="#2f89b8" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {[24, 52, 80].map((y) => (
          <line key={y} className="chart-grid" x1="10" x2="290" y1={y} y2={y} />
        ))}
        <path className="chart-area water-area" d={areaPath} />
        <path className="chart-line water-line" d={linePath} />
        {latestPoint ? <circle className="chart-dot water-dot" cx={latestPoint.x} cy={latestPoint.y} r="4.8" /> : null}
        <text className="chart-axis" x="10" y="116">
          {formatHour(history[0]?.time)}
        </text>
        <text className="chart-axis" x="290" y="116" textAnchor="end">
          {formatHour(history[history.length - 1]?.time)}
        </text>
      </svg>
    </div>
  );
}

function SolarPowerChart({
  times,
  values,
  timeframeHours
}: {
  times: string[];
  values: Array<number | null>;
  timeframeHours: 24 | 48 | 72;
}) {
  const numericValues = values.filter((value): value is number => value !== null);
  if (times.length === 0 || numericValues.length < 2) return null;
  const peakValue = Math.max(...numericValues);
  const max = Math.max(peakValue * 1.18, 0.1);
  const points = values
    .map((value, index) => {
      if (value === null) return null;
      const x = scale(index, 0, Math.max(values.length - 1, 1), 10, 290);
      const y = scale(value, 0, max, 92, 18);
      return { x, y, value, label: times[index] };
    })
    .filter((point): point is ChartPoint => point !== null);
  const peakPoint = points.reduce((peak, point) => (point.value > peak.value ? point : peak), points[0]);
  const linePath = buildLinePath(points);
  const areaPath = buildAreaPath(points, 96);
  const nowMarkerX = getCurrentTimeMarkerX(times);

  return (
    <div className="chart-card solar-chart-card">
      <div className="chart-heading">
        <strong>{timeframeHours}h Solarleistung</strong>
        <span>Peak {formatKw(peakPoint?.value ?? null)}</span>
      </div>
      <svg className="line-chart solar-chart" viewBox="0 0 300 124" role="img" aria-label={`Solarleistungsverlauf für ${timeframeHours} Stunden`}>
        <defs>
          <linearGradient id="solar-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#d4a82d" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#d4a82d" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {[24, 52, 80].map((y) => (
          <line key={y} className="chart-grid" x1="10" x2="290" y1={y} y2={y} />
        ))}
        <path className="chart-area solar-area" d={areaPath} />
        {nowMarkerX !== null ? (
          <g className="now-marker">
            <line x1={nowMarkerX} x2={nowMarkerX} y1="18" y2="100" />
            <circle cx={nowMarkerX} cy="18" r="3.5" />
            <text x={nowMarkerX} y="12" textAnchor="middle">
              Jetzt
            </text>
          </g>
        ) : null}
        <path className="chart-line solar-line" d={linePath} />
        {peakPoint ? <circle className="chart-dot solar-dot" cx={peakPoint.x} cy={peakPoint.y} r="4.8" /> : null}
      </svg>
      <div className="solar-chart-axis" aria-hidden="true">
        <span>{formatHour(times[0])}</span>
        <span>{formatHour(times[times.length - 1])}</span>
      </div>
    </div>
  );
}

type ChartPoint = {
  x: number;
  y: number;
  value: number;
  label: string;
};

function buildLinePath(points: ChartPoint[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function buildAreaPath(points: ChartPoint[], baseline: number) {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${buildLinePath(points)} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}

function getCurrentTimeMarkerX(times: string[]) {
  if (times.length < 2) return null;
  const first = new Date(times[0]).getTime();
  const last = new Date(times[times.length - 1]).getTime();
  const now = Date.now();
  if (!Number.isFinite(first) || !Number.isFinite(last) || now < first || now > last) return null;
  return scale(now, first, last, 10, 290);
}

function getUpcomingHourIndexes(times: string[], count: number) {
  const now = Date.now();
  let currentIndex = -1;
  for (let index = 0; index < times.length; index += 1) {
    if (new Date(times[index]).getTime() <= now) currentIndex = index;
  }
  const startIndex = Math.max(currentIndex, 0);
  return Array.from({ length: count }, (_, offset) => startIndex + offset).filter((index) => index < times.length);
}

function createModeId(modes: DashboardMode[]) {
  let index = modes.length + 1;
  let id = `mode-${index}`;
  const existingIds = new Set(modes.map((mode) => mode.id));
  while (existingIds.has(id)) {
    index += 1;
    id = `mode-${index}`;
  }
  return id;
}

function createModeName(modes: DashboardMode[]) {
  const baseName = "Neuer Modus";
  const existingNames = new Set(modes.map((mode) => mode.name.trim().toLowerCase()));
  if (!existingNames.has(baseName.toLowerCase())) return baseName;
  let index = 2;
  while (existingNames.has(`${baseName} ${index}`.toLowerCase())) {
    index += 1;
  }
  return `${baseName} ${index}`;
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 10 * 60 * 1000,
      timeout: 12_000
    });
  });
}

function buildGridLayouts(
  widgets: WidgetLayout[],
  savedLayouts: ModeConfiguration["gridLayout"] = {}
): GridLayouts {
  return Object.fromEntries(
    Object.entries(GRID_BREAKPOINT_COLUMNS).map(([breakpoint, columns]) => [
      breakpoint,
      buildGridLayout(widgets, savedLayouts?.[breakpoint as GridBreakpoint] ?? savedLayouts?.lg, columns)
    ])
  );
}

function buildGridLayout(
  widgets: WidgetLayout[],
  savedLayout: GridBreakpointLayouts = {},
  columns = GRID_COLUMNS
) {
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  return widgets
    .filter((widget) => widget.enabled)
    .map((widget) => {
      const size = getDefaultGridSize(widget);
      const saved = savedLayout[widget.id];
      const height = saved?.h ?? size.h;

      if (saved) {
        const width = Math.min(Math.max(1, saved.w), columns);
        return {
          i: widget.id,
          x: Math.min(Math.max(0, saved.x), columns - width),
          y: Math.max(0, saved.y),
          w: width,
          h: height,
          minH: GRID_ITEM_MIN_HEIGHT
        };
      }

      const width = Math.min(size.w, columns);
      if (cursorX + width > columns) {
        cursorX = 0;
        cursorY += rowHeight;
        rowHeight = 0;
      }

      const item = {
        i: widget.id,
        x: cursorX,
        y: cursorY,
        w: width,
        h: height,
        minH: GRID_ITEM_MIN_HEIGHT
      };
      cursorX += width;
      rowHeight = Math.max(rowHeight, height);
      return item;
    });
}

function gridLayoutsToStorage(layouts: GridLayouts): NonNullable<ModeConfiguration["gridLayout"]> {
  return Object.fromEntries(
    Object.entries(layouts)
      .filter(([breakpoint, layout]) => isGridBreakpoint(breakpoint) && Array.isArray(layout))
      .map(([breakpoint, layout]) => [
        breakpoint,
        Object.fromEntries(
          (layout ?? []).map((item) => [
            item.i as WidgetId,
            {
              x: item.x,
              y: item.y,
              w: item.w,
              h: item.h
            }
          ])
        )
      ])
  );
}

function getWidgetPresentation(columns: number, rows: number): WidgetPresentation {
  const density = columns <= 4 ? "narrow" : columns <= 7 ? "normal" : "wide";
  const heightDensity = rows <= 7 ? "short" : rows <= 12 ? "normal" : "tall";
  return { columns, rows, density, heightDensity };
}

function hasLayoutForWidgets(layout: Layout, widgets: WidgetLayout[]) {
  if (layout.length === 0) return false;
  const layoutIds = new Set(layout.map((item) => item.i));
  return widgets.every((widget) => layoutIds.has(widget.id));
}

function isGridBreakpoint(value: string): value is GridBreakpoint {
  return value in GRID_BREAKPOINT_COLUMNS;
}

function getDefaultGridSize(widget: WidgetLayout) {
  return defaultGridSizeByWidget[widget.id] ?? getGridSize(widget.size);
}

function getGridSize(size: WidgetSize): { w: number; h: number } {
  switch (size) {
    case "mini":
      return { w: 4, h: 7 };
    case "compact":
      return { w: 4, h: 9 };
    case "wide":
      return { w: 8, h: 9 };
    case "tall":
      return { w: 4, h: 13 };
    case "large":
      return { w: 8, h: 13 };
    case "full":
      return { w: 12, h: 9 };
    default:
      return { w: 4, h: 9 };
  }
}

function maxToday(times: string[], values: Array<number | null>) {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  const todaysValues = values.filter((value, index) => times[index]?.startsWith(today) && value !== null) as number[];
  return todaysValues.length ? Math.max(...todaysValues) : null;
}

function maxValue(values: Array<number | null>) {
  const numericValues = values.filter((value): value is number => value !== null);
  return numericValues.length ? Math.max(...numericValues) : null;
}

function sumHourlyEnergy(values: Array<number | null>) {
  const numericValues = values.filter((value): value is number => value !== null);
  if (numericValues.length === 0) return null;
  return numericValues.reduce((sum, value) => sum + value, 0);
}

function getBestSolarPhase(times: string[], values: Array<number | null>, windowHours: number) {
  if (times.length < windowHours || values.length < windowHours) return null;
  let bestStart = -1;
  let bestEnergy = 0;

  for (let index = 0; index <= values.length - windowHours; index += 1) {
    const windowValues = values.slice(index, index + windowHours);
    if (windowValues.some((value) => value === null)) continue;
    const energy = (windowValues as number[]).reduce((sum, value) => sum + value, 0);
    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestStart = index;
    }
  }

  if (bestStart < 0 || bestEnergy <= 0.05) return null;
  return {
    start: times[bestStart],
    end: addHours(times[bestStart + windowHours - 1], 1),
    energyKwh: bestEnergy
  };
}

function getUpcomingHourlyRange(currentTime: string, times: string[], values: Array<number | null>, hours: number) {
  const currentIndex = times.findIndex((time) => time >= currentTime);
  const startIndex = currentIndex >= 0 ? currentIndex : 0;
  return {
    times: times.slice(startIndex, startIndex + hours),
    values: values.slice(startIndex, startIndex + hours)
  };
}

function getNextPrecipitation(currentTime: string, times: string[], values: Array<number | null>, hours: number) {
  const currentIndex = times.findIndex((time) => time >= currentTime);
  const startIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextValues = values.slice(startIndex, startIndex + hours).filter((value): value is number => value !== null);
  if (nextValues.length === 0) return null;
  return nextValues.reduce((sum, value) => sum + value, 0);
}

function getNextHourlyValue(currentTime: string, times: string[], values: Array<number | null>) {
  const currentIndex = times.findIndex((time) => time >= currentTime);
  const startIndex = currentIndex >= 0 ? currentIndex : 0;
  return values.slice(startIndex, startIndex + 4).find((value) => value !== null) ?? null;
}

function getHourlyChange(currentTime: string, times: string[], values: Array<number | null>, hours: number) {
  const currentIndex = times.findIndex((time) => time >= currentTime);
  const startIndex = currentIndex >= 0 ? currentIndex : 0;
  const current = values[startIndex] ?? null;
  const future = values[startIndex + hours] ?? null;
  if (current === null || future === null) return null;
  return future - current;
}

function getWindTrend(currentTime: string, times: string[], values: Array<number | null>) {
  const currentIndex = times.findIndex((time) => time >= currentTime);
  const startIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextValues = values.slice(startIndex, startIndex + 4).filter((value): value is number => value !== null);
  if (nextValues.length < 2) return "n/a";

  const change = nextValues[nextValues.length - 1] - nextValues[0];
  if (change >= 5) return "steigend";
  if (change <= -5) return "fallend";
  return "stabil";
}

function getWindDirection(degrees: number) {
  const directions = [
    { short: "N", long: "Nord" },
    { short: "NNO", long: "Nordnordost" },
    { short: "NO", long: "Nordost" },
    { short: "ONO", long: "Ostnordost" },
    { short: "O", long: "Ost" },
    { short: "OSO", long: "Ostsüdost" },
    { short: "SO", long: "Südost" },
    { short: "SSO", long: "Südsüdost" },
    { short: "S", long: "Süd" },
    { short: "SSW", long: "Südsüdwest" },
    { short: "SW", long: "Südwest" },
    { short: "WSW", long: "Westsüdwest" },
    { short: "W", long: "West" },
    { short: "WNW", long: "Westnordwest" },
    { short: "NW", long: "Nordwest" },
    { short: "NNW", long: "Nordnordwest" }
  ];
  return directions[Math.round(degrees / 22.5) % directions.length];
}

function getBeaufort(speedKmh: number) {
  const scale = [
    { max: 1, label: "Windstille" },
    { max: 5, label: "leiser Zug" },
    { max: 11, label: "leichte Brise" },
    { max: 19, label: "schwache Brise" },
    { max: 28, label: "mäßige Brise" },
    { max: 38, label: "frische Brise" },
    { max: 49, label: "starker Wind" },
    { max: 61, label: "steifer Wind" },
    { max: 74, label: "stürmischer Wind" },
    { max: 88, label: "Sturm" },
    { max: 102, label: "schwerer Sturm" },
    { max: 117, label: "orkanartiger Sturm" },
    { max: Infinity, label: "Orkan" }
  ];
  const value = scale.findIndex((item) => speedKmh <= item.max);
  return { value, label: scale[value].label };
}

function getPressureGaugeRotation(value: number) {
  return scale(Math.min(1045, Math.max(970, value)), 970, 1045, -115, 115);
}

function pressureLabel(value: number) {
  if (value < 1000) return "tief";
  if (value > 1025) return "hoch";
  return "normal";
}

function formatSignedPressure(value: number | null) {
  if (value === null) return "n/a";
  const rounded = Math.round(value);
  if (rounded === 0) return "stabil";
  return `${rounded > 0 ? "+" : ""}${rounded} hPa/3h`;
}

function formatNumber(value: number | null | undefined, unit: string) {
  if (value === null || value === undefined) return "n/a";
  return `${Math.round(value)}${unit}`;
}

function formatKw(value: number | null | undefined) {
  if (value === null || value === undefined) return "n/a";
  return `${formatDecimal(value, value >= 10 ? 1 : 2)} kW`;
}

function formatKwh(value: number | null | undefined) {
  if (value === null || value === undefined) return "n/a";
  return `${formatDecimal(value, value >= 10 ? 1 : 2)} kWh`;
}

function formatAzimuth(value: number) {
  const labels = new Map([
    [-90, "Ost"],
    [-45, "Südost"],
    [0, "Süd"],
    [45, "Südwest"],
    [90, "West"]
  ]);
  return labels.get(value) ?? `${value}°`;
}

function formatSolarPhase(phase: { start: string; end: string; energyKwh: number } | null) {
  if (!phase) return "n/a";
  return `${formatShortHour(phase.start)}-${formatShortHour(phase.end)} Uhr`;
}

function formatDecimal(value: number, digits: number) {
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value);
}

function formatCompactLiters(value: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatRefreshError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : "";
  const code = typeof caught === "object" && caught !== null && "code" in caught ? Number(caught.code) : 0;

  if (code === 1) {
    return "Standortfreigabe wurde abgelehnt.";
  }
  if (code === 2) {
    return "Der aktuelle Standort konnte nicht ermittelt werden.";
  }
  if (code === 3) {
    return "Die Standortsuche hat zu lange gedauert.";
  }

  if (message.includes("Wetterdaten")) {
    return "Wetter konnte gerade nicht aktualisiert werden.";
  }
  if (message.includes("Standort")) {
    return message;
  }
  if (message.includes("PLZ") || message.includes("Ort")) {
    return message;
  }

  return "Ein Teil der Daten konnte gerade nicht geladen werden.";
}

function formatHour(value: string) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatShortHour(value: string) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit" }).format(new Date(value));
}

function addHours(value: string, hours: number) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function formatForecastDay(value: string, index: number) {
  if (index === 0) return "Heute";
  if (index === 1) return "Morgen";
  if (!value) return "Tag";
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(value));
}

function formatMoonEvent(value: string | null, moon: DashboardData["moon"]) {
  if (value) return formatHour(value);
  if (moon.alwaysUp) return "immer oben";
  if (moon.alwaysDown) return "nicht sichtbar";
  return "n/a";
}

function formatNextTide(tide: NonNullable<DashboardData["water"]>["nextTide"]) {
  if (!tide) return "keine Tide erkannt";
  return `${tide.type === "high" ? "HW" : "NW"} ${formatHour(tide.time)}`;
}

function formatDateTime(value: string | number) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatEpoch(value: number) {
  if (!value) return "n/a";
  return formatDateTime(value > 10_000_000_000 ? value : value * 1000);
}

function labelWeather(code: number | null) {
  return code === null ? "Unbekannt" : weatherLabels.get(code) ?? `Code ${code}`;
}

function getWeatherSymbolClass(code: number | null) {
  if (code === null) return "unknown";
  if ([95, 96, 99].includes(code)) return "storm";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if ([45, 48].includes(code)) return "fog";
  if ([2, 3].includes(code)) return "cloud";
  return "clear";
}

function getTemperatureBar(value: number | null) {
  if (value === null) return "0%";
  return `${Math.min(100, Math.max(8, ((value + 10) / 45) * 100))}%`;
}

function aqiLabel(value: number | null) {
  if (value === null) return "keine Angabe";
  if (value <= 20) return "gut";
  if (value <= 40) return "ordentlich";
  if (value <= 60) return "mäßig";
  if (value <= 80) return "schlecht";
  if (value <= 100) return "sehr schlecht";
  return "extrem";
}

function pollenLevel(value: number | null) {
  if (value === null) return "keine Saisondaten";
  if (value < 10) return "niedrig";
  if (value < 50) return "mittel";
  return "hoch";
}

function translateCondition(condition: string) {
  const labels: Record<string, string> = {
    dry: "Trocken",
    fog: "Nebel",
    rain: "Regen",
    snow: "Schnee",
    sleet: "Schneeregen",
    hail: "Hagel",
    thunderstorm: "Gewitter"
  };
  return labels[condition] ?? condition;
}

function pollenIndexValue(value: string) {
  if (value === "-1") return 0;
  if (value.includes("3")) return 3;
  if (value.includes("2")) return 2;
  if (value.includes("1")) return 1;
  return 0;
}

function pollenHazardLabel(value: string) {
  const labels: Record<string, string> = {
    "0": "keine",
    "0-1": "keine bis gering",
    "1": "gering",
    "1-2": "gering bis mittel",
    "2": "mittel",
    "2-3": "mittel bis hoch",
    "3": "hoch"
  };
  return labels[value] ?? value;
}

function ubaIndexLabel(value: number | null) {
  const labels: Record<number, string> = {
    1: "sehr gut",
    2: "gut",
    3: "mäßig",
    4: "schlecht",
    5: "sehr schlecht"
  };
  return value ? labels[value] ?? "bewertet" : "keine Angabe";
}

function translateWaterState(value: string) {
  const labels: Record<string, string> = {
    low: "niedrig",
    normal: "normal",
    high: "hoch",
    unknown: "unbekannt"
  };
  return labels[value] ?? value;
}

function formatDistance(value: number) {
  if (value < 1) return `${Math.round(value * 1000)} m`;
  return `${value.toFixed(1)} km`;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function getMoonShadowOffset(illumination: number) {
  return Math.max(0, Math.min(112, illumination * 112));
}

function scale(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  if (inMax === inMin) return (outMin + outMax) / 2;
  const ratio = (value - inMin) / (inMax - inMin);
  return outMin + ratio * (outMax - outMin);
}

function getWeatherTheme(data: DashboardData | null) {
  if (!data) return { className: "weather-loading", label: "Atmosphäre lädt mit den Wetterdaten" };

  const code = data.weather.current.weatherCode;
  const now = new Date();
  const sunrise = data.weather.daily.sunrise[0] ? new Date(data.weather.daily.sunrise[0]) : null;
  const sunset = data.weather.daily.sunset[0] ? new Date(data.weather.daily.sunset[0]) : null;
  const isNight = Boolean(sunrise && sunset && (now < sunrise || now > sunset));

  if (code === null) return { className: "weather-neutral", label: "Wetterlage nicht eindeutig" };
  if ([95, 96, 99].includes(code)) return { className: "weather-storm", label: "Gewitterstimmung" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { className: "weather-snow", label: "Schneelage" };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return { className: "weather-rain", label: "Regenlage" };
  }
  if ([45, 48].includes(code)) return { className: "weather-fog", label: "Nebelstimmung" };
  if ([2, 3].includes(code)) return { className: "weather-clouds", label: "Wolkig" };
  if (isNight) return { className: "weather-night", label: "Klare Nacht" };
  return { className: "weather-clear", label: "Klares Wetter" };
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
