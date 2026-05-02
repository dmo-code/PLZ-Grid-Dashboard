export type WidgetId =
  | "weather"
  | "pollen"
  | "air"
  | "warnings"
  | "sun"
  | "insights"
  | "place"
  | "dwdWeather"
  | "dwdPollen"
  | "ubaAir"
  | "water"
  | "strom"
  | "moon";

export type WidgetSize = "mini" | "compact" | "wide" | "tall" | "large" | "full";
export type ThemeMode = "system" | "standard" | "dark";

export type WidgetLayout = {
  id: WidgetId;
  enabled: boolean;
  size: WidgetSize;
};

export type DashboardSettings = {
  postalCode: string;
  theme: ThemeMode;
  widgets: WidgetLayout[];
};

export type LocationInfo = {
  postalCode: string;
  place: string;
  state: string;
  latitude: number;
  longitude: number;
};

export type PlaceData = {
  postalCode: string;
  name: string;
  municipality?: string;
  municipalityType?: string;
  district?: string;
  districtType?: string;
  governmentRegion?: string;
  federalState?: string;
};

export type WeatherData = {
  current: {
    time: string;
    temperature: number | null;
    apparentTemperature: number | null;
    humidity: number | null;
    precipitation: number | null;
    weatherCode: number | null;
    windSpeed: number | null;
  };
  hourly: {
    time: string[];
    temperature: Array<number | null>;
    precipitationProbability: Array<number | null>;
    weatherCode: Array<number | null>;
  };
  daily: {
    time: string[];
    sunrise: string[];
    sunset: string[];
    temperatureMax: Array<number | null>;
    temperatureMin: Array<number | null>;
    precipitationSum: Array<number | null>;
    uvIndexMax: Array<number | null>;
  };
};

export type AirQualityData = {
  current: {
    time: string;
    europeanAqi: number | null;
    pm10: number | null;
    pm25: number | null;
    ozone: number | null;
    nitrogenDioxide: number | null;
  };
  hourly: {
    time: string[];
    europeanAqi: Array<number | null>;
    pm10: Array<number | null>;
    pm25: Array<number | null>;
    alder: Array<number | null>;
    birch: Array<number | null>;
    grass: Array<number | null>;
    mugwort: Array<number | null>;
    ragweed: Array<number | null>;
  };
};

export type WarningItem = {
  id: string;
  headline: string;
  description: string;
  regionName: string;
  level: number;
  type: number;
  start: number;
  end: number;
  instruction?: string;
};

export type BrightSkyData = {
  stationName: string;
  distance: number | null;
  timestamp: string;
  temperature: number | null;
  condition: string;
  windSpeed: number | null;
  windGust: number | null;
  sunshine: number | null;
  solar: number | null;
  alerts: Array<{
    id: string;
    event: string;
    headline: string;
    severity: string;
    effective: string;
    expires: string;
  }>;
};

export type DwdPollenData = {
  lastUpdate: string;
  regionName: string;
  partRegionName: string;
  pollen: Array<{
    name: string;
    today: string;
    tomorrow: string;
    dayAfter: string;
  }>;
};

export type UbaAirData = {
  stationName: string;
  stationCode: string;
  distance: number;
  timestamp: string;
  totalIndex: number | null;
  components: Array<{
    id: number;
    name: string;
    value: number | null;
    index: number | null;
  }>;
};

export type WaterLevelData = {
  stationName: string;
  waterName: string;
  distance: number;
  timestamp: string;
  value: number | null;
  unit: string;
  state: string;
  nextTide: {
    time: string;
    type: "high" | "low";
    estimated: boolean;
  } | null;
  history: Array<{
    time: string;
    value: number | null;
  }>;
};

export type StromGedachtData = {
  state: number | null;
  load: number | null;
  renewableEnergy: number | null;
  residualLoad: number | null;
  superGreenThreshold: number | null;
};

export type MoonData = {
  phase: number;
  phaseName: string;
  illumination: number;
  angle: number;
  altitude: number;
  azimuth: number;
  distance: number;
  rise: string | null;
  set: string | null;
  alwaysUp: boolean;
  alwaysDown: boolean;
};

export type DashboardData = {
  location: LocationInfo;
  place: PlaceData | null;
  weather: WeatherData;
  air: AirQualityData;
  warnings: WarningItem[];
  brightSky: BrightSkyData | null;
  dwdPollen: DwdPollenData | null;
  ubaAir: UbaAirData | null;
  water: WaterLevelData | null;
  strom: StromGedachtData | null;
  moon: MoonData;
  updatedAt: string;
};
