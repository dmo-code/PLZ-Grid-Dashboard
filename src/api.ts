import type {
  AirQualityData,
  BrightSkyData,
  DashboardData,
  DwdPollenData,
  LocationInfo,
  PlaceData,
  UbaAirData,
  WarningItem,
  WaterLevelData,
  WeatherData
} from "./types";
import { getMoonData } from "./moon";

type ZippopotamusResponse = {
  "post code": string;
  places: Array<{
    "place name": string;
    state: string;
    latitude: string;
    longitude: string;
  }>;
};

type DwdWarningPayload = {
  warnings?: Record<string, DwdWarning[]>;
  vorabInformation?: Record<string, DwdWarning[]>;
};

type DwdWarning = {
  event?: string;
  headline?: string;
  description?: string;
  regionName?: string;
  level?: number;
  type?: number;
  start?: number;
  end?: number;
  instruction?: string;
};

type OpenPlzLocality = {
  postalCode: string;
  name: string;
  municipality?: { name?: string; type?: string };
  district?: { name?: string; type?: string };
  governmentRegion?: { name?: string };
  federalState?: { name?: string };
};

export type LocationChoice = OpenPlzLocality;

type OpenMeteoGeocodingResponse = {
  results?: Array<{
    name?: string;
    latitude?: number;
    longitude?: number;
    admin1?: string;
    country_code?: string;
  }>;
};

type NominatimReverseResponse = {
  display_name?: string;
  address?: {
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    suburb?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
};

type DwdPollenPayload = {
  last_update?: string;
  content?: Array<{
    region_name: string;
    partregion_name: string;
    Pollen: Record<string, { today?: string; tomorrow?: string; dayafter_to?: string }>;
  }>;
};

type AchooPollenItem = {
  region: string;
  sub_region: string;
  pollen: Array<{
    name: string;
    today: { severity?: string; description?: string };
    tomorrow: { severity?: string; description?: string };
    day_after_tomorrow: { severity?: string; description?: string };
  }>;
};

type BrightSkyResponse = {
  weather?: {
    timestamp?: string;
    temperature?: number;
    condition?: string;
    wind_speed_10?: number;
    wind_gust_speed_10?: number;
    sunshine_60?: number;
    solar_60?: number;
  };
  sources?: Array<{ station_name?: string; distance?: number }>;
};

type BrightSkyAlertsResponse = {
  alerts?: Array<{
    id?: string;
    event?: string;
    headline?: string;
    severity?: string;
    effective?: string;
    expires?: string;
  }>;
};

type PegelStation = {
  uuid?: string;
  shortname?: string;
  longname?: string;
  longitude?: number;
  latitude?: number;
  water?: { shortname?: string; longname?: string };
  timeseries?: Array<{
    shortname?: string;
    unit?: string;
    currentMeasurement?: {
      timestamp?: string;
      value?: number;
      stateMnwMhw?: string;
    };
  }>;
};

type PegelMeasurement = {
  timestamp?: string;
  value?: number;
};

type TideEstimate = {
  time: string;
  type: "high" | "low";
  estimated: boolean;
};

declare global {
  interface Window {
    warnWetter?: {
      loadWarnings?: (payload: DwdWarningPayload) => void;
    };
  }
}

const numberOrNull = (value: unknown): number | null => {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export async function loadDashboardData(searchTerm: string, selectedPlace?: LocationChoice): Promise<DashboardData> {
  const resolvedPlace = selectedPlace ?? (/^\d{5}$/.test(searchTerm) ? null : requireLocationChoice((await searchLocationChoices(searchTerm))[0]));
  const postalCode = resolvedPlace?.postalCode ?? searchTerm;
  const location = await getLocation(postalCode, resolvedPlace);
  return loadDashboardDataForResolvedLocation(
    location,
    resolvedPlace ? localityToPlaceData(resolvedPlace) : await optional(() => getOpenPlz(postalCode))
  );
}

export async function loadDashboardDataForCoordinates(latitude: number, longitude: number): Promise<DashboardData> {
  if (!isValidCoordinates(latitude, longitude)) {
    throw new Error("Der aktuelle Standort konnte nicht gelesen werden.");
  }

  const { location, place } = await getLocationFromCoordinates(latitude, longitude);
  return loadDashboardDataForResolvedLocation(location, place);
}

async function loadDashboardDataForResolvedLocation(location: LocationInfo, place: PlaceData | null): Promise<DashboardData> {
  const [weather, air, warnings, resolvedPlace, brightSky, dwdPollen, ubaAir, water] = await Promise.all([
    getWeather(location),
    getAirQuality(location),
    getWarnings(location),
    Promise.resolve(place),
    optional(() => getBrightSky(location)),
    optional(() => getDwdPollen(location)),
    optional(() => getUbaAir(location)),
    optional(() => getWaterLevel(location))
  ]);

  return {
    location,
    place: resolvedPlace,
    weather,
    air,
    warnings,
    brightSky,
    dwdPollen,
    ubaAir,
    water,
    moon: getMoonData(location),
    updatedAt: new Date().toISOString()
  };
}

export async function searchLocationChoices(name: string): Promise<LocationChoice[]> {
  const params = new URLSearchParams({ name, pageSize: "50" });
  const response = await fetch(`https://openplzapi.org/de/Localities?${params.toString()}`, {
    headers: { accept: "text/json" }
  });
  if (!response.ok) {
    throw new Error("Dieser Ort konnte nicht gefunden werden.");
  }

  const data = (await response.json()) as OpenPlzLocality[];
  const normalizedName = normalize(name);
  const localitiesWithPostalCode = data.filter((entry) => entry.postalCode);
  const exactMatches = localitiesWithPostalCode.filter((entry) => {
    return normalize(entry.name) === normalizedName || normalize(entry.municipality?.name ?? "") === normalizedName;
  });
  const matches = (exactMatches.length ? exactMatches : localitiesWithPostalCode)
    .sort((a, b) => {
      const aExact = normalize(a.name) === normalizedName || normalize(a.municipality?.name ?? "") === normalizedName;
      const bExact = normalize(b.name) === normalizedName || normalize(b.municipality?.name ?? "") === normalizedName;
      return Number(bExact) - Number(aExact) || a.postalCode.localeCompare(b.postalCode);
    });

  const choices = new Map<string, LocationChoice>();
  for (const locality of matches) {
    if (!choices.has(locality.postalCode)) choices.set(locality.postalCode, locality);
  }

  return [...choices.values()];
}

async function optional<T>(loader: () => Promise<T>, timeoutMs = 4500): Promise<T | null> {
  try {
    return await Promise.race([
      loader(),
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), timeoutMs);
      })
    ]);
  } catch {
    return null;
  }
}

async function getLocation(postalCode: string, locality?: OpenPlzLocality | null): Promise<LocationInfo> {
  const response = await fetch(`https://api.zippopotam.us/de/${encodeURIComponent(postalCode)}`);
  if (!response.ok) {
    throw new Error("Diese PLZ oder dieser Ort konnte nicht gefunden werden.");
  }

  const data = (await response.json()) as ZippopotamusResponse;
  const place = data.places?.[0];
  if (!place) {
    throw new Error("Zu dieser PLZ wurden keine Ortsdaten geliefert.");
  }
  const placeName = locality?.name ?? place["place name"];
  const state = locality?.federalState?.name ?? place.state;
  const coordinates = await resolveCoordinates(Number(place.latitude), Number(place.longitude), placeName, state);

  return {
    postalCode: data["post code"],
    place: placeName,
    state,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude
  };
}

async function getLocationFromCoordinates(latitude: number, longitude: number): Promise<{ location: LocationInfo; place: PlaceData | null }> {
  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(latitude),
    lon: String(longitude),
    zoom: "18",
    addressdetails: "1",
    "accept-language": "de"
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
    headers: { accept: "application/json" }
  });

  const reverse = response.ok ? ((await response.json()) as NominatimReverseResponse) : null;
  const address = reverse?.address;
  const placeName =
    address?.city ??
    address?.town ??
    address?.village ??
    address?.municipality ??
    address?.suburb ??
    "Aktueller Standort";
  const state = address?.state ?? address?.country ?? "Standort";
  const postalCode = address?.postcode ?? "Aktueller Standort";

  return {
    location: {
      postalCode,
      place: placeName,
      state,
      latitude,
      longitude
    },
    place: address?.postcode
      ? {
          postalCode: address.postcode,
          name: placeName,
          municipality: address.municipality,
          district: address.county,
          federalState: address.state
        }
      : null
  };
}

async function resolveCoordinates(latitude: number, longitude: number, placeName: string, state: string) {
  if (isValidCoordinates(latitude, longitude)) return { latitude, longitude };

  const geocoded = await getGeocodedCoordinates(placeName, state);
  if (geocoded) return geocoded;

  throw new Error("Koordinaten für diesen Ort konnten nicht geladen werden.");
}

function isValidCoordinates(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

async function getGeocodedCoordinates(placeName: string, state: string) {
  const params = new URLSearchParams({
    name: placeName,
    count: "5",
    language: "de",
    format: "json",
    countryCode: "DE"
  });
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`);
  if (!response.ok) return null;

  const data = (await response.json()) as OpenMeteoGeocodingResponse;
  const results = data.results ?? [];
  const match = results.find((result) => result.admin1 === state) ?? results[0];
  if (!match || !isValidCoordinates(Number(match.latitude), Number(match.longitude))) return null;

  return {
    latitude: Number(match.latitude),
    longitude: Number(match.longitude)
  };
}

function requireLocationChoice(choice: LocationChoice | undefined): LocationChoice {
  if (!choice?.postalCode) {
    throw new Error("Zu diesem Ort wurde keine PLZ gefunden.");
  }
  return choice;
}

async function getOpenPlz(postalCode: string): Promise<PlaceData | null> {
  const params = new URLSearchParams({ postalCode, pageSize: "5" });
  const response = await fetch(`https://openplzapi.org/de/Localities?${params.toString()}`, {
    headers: { accept: "text/json" }
  });
  if (!response.ok) return null;

  const data = (await response.json()) as OpenPlzLocality[];
  const first = data[0];
  if (!first) return null;

  return localityToPlaceData(first);
}

function localityToPlaceData(locality: OpenPlzLocality): PlaceData {
  return {
    postalCode: locality.postalCode,
    name: locality.name,
    municipality: locality.municipality?.name,
    municipalityType: locality.municipality?.type,
    district: locality.district?.name,
    districtType: locality.district?.type,
    governmentRegion: locality.governmentRegion?.name,
    federalState: locality.federalState?.name
  };
}

async function getWeather(location: LocationInfo): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: "Europe/Berlin",
    forecast_days: "4",
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
      "pressure_msl",
      "surface_pressure"
    ].join(","),
    hourly: [
      "temperature_2m",
      "precipitation",
      "precipitation_probability",
      "weather_code",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
      "pressure_msl",
      "surface_pressure"
    ].join(","),
    daily: [
      "sunrise",
      "sunset",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "weather_code",
      "uv_index_max",
      "wind_speed_10m_max",
      "wind_gusts_10m_max",
      "wind_direction_10m_dominant"
    ].join(",")
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Wetterdaten konnten nicht geladen werden.");
  }

  const data = await response.json();
  return {
    current: {
      time: data.current?.time ?? "",
      temperature: numberOrNull(data.current?.temperature_2m),
      apparentTemperature: numberOrNull(data.current?.apparent_temperature),
      humidity: numberOrNull(data.current?.relative_humidity_2m),
      precipitation: numberOrNull(data.current?.precipitation),
      weatherCode: numberOrNull(data.current?.weather_code),
      windSpeed: numberOrNull(data.current?.wind_speed_10m),
      windDirection: numberOrNull(data.current?.wind_direction_10m),
      windGusts: numberOrNull(data.current?.wind_gusts_10m),
      pressureMsl: numberOrNull(data.current?.pressure_msl),
      surfacePressure: numberOrNull(data.current?.surface_pressure)
    },
    hourly: {
      time: data.hourly?.time ?? [],
      temperature: data.hourly?.temperature_2m ?? [],
      precipitation: data.hourly?.precipitation ?? [],
      precipitationProbability: data.hourly?.precipitation_probability ?? [],
      weatherCode: data.hourly?.weather_code ?? [],
      windSpeed: data.hourly?.wind_speed_10m ?? [],
      windDirection: data.hourly?.wind_direction_10m ?? [],
      windGusts: data.hourly?.wind_gusts_10m ?? [],
      pressureMsl: data.hourly?.pressure_msl ?? [],
      surfacePressure: data.hourly?.surface_pressure ?? []
    },
    daily: {
      time: data.daily?.time ?? [],
      sunrise: data.daily?.sunrise ?? [],
      sunset: data.daily?.sunset ?? [],
      temperatureMax: data.daily?.temperature_2m_max ?? [],
      temperatureMin: data.daily?.temperature_2m_min ?? [],
      precipitationSum: data.daily?.precipitation_sum ?? [],
      weatherCode: data.daily?.weather_code ?? [],
      uvIndexMax: data.daily?.uv_index_max ?? [],
      windSpeedMax: data.daily?.wind_speed_10m_max ?? [],
      windGustsMax: data.daily?.wind_gusts_10m_max ?? [],
      windDirectionDominant: data.daily?.wind_direction_10m_dominant ?? []
    }
  };
}

async function getAirQuality(location: LocationInfo): Promise<AirQualityData> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: "Europe/Berlin",
    forecast_days: "4",
    current: ["european_aqi", "pm10", "pm2_5", "ozone", "nitrogen_dioxide"].join(","),
    hourly: [
      "european_aqi",
      "pm10",
      "pm2_5",
      "alder_pollen",
      "birch_pollen",
      "grass_pollen",
      "mugwort_pollen",
      "ragweed_pollen"
    ].join(",")
  });

  const response = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Luftqualitätsdaten konnten nicht geladen werden.");
  }

  const data = await response.json();
  return {
    current: {
      time: data.current?.time ?? "",
      europeanAqi: numberOrNull(data.current?.european_aqi),
      pm10: numberOrNull(data.current?.pm10),
      pm25: numberOrNull(data.current?.pm2_5),
      ozone: numberOrNull(data.current?.ozone),
      nitrogenDioxide: numberOrNull(data.current?.nitrogen_dioxide)
    },
    hourly: {
      time: data.hourly?.time ?? [],
      europeanAqi: data.hourly?.european_aqi ?? [],
      pm10: data.hourly?.pm10 ?? [],
      pm25: data.hourly?.pm2_5 ?? [],
      alder: data.hourly?.alder_pollen ?? [],
      birch: data.hourly?.birch_pollen ?? [],
      grass: data.hourly?.grass_pollen ?? [],
      mugwort: data.hourly?.mugwort_pollen ?? [],
      ragweed: data.hourly?.ragweed_pollen ?? []
    }
  };
}

async function getBrightSky(location: LocationInfo): Promise<BrightSkyData | null> {
  const params = new URLSearchParams({
    lat: String(location.latitude),
    lon: String(location.longitude)
  });
  const [currentResponse, alertsResponse] = await Promise.all([
    fetch(`https://api.brightsky.dev/current_weather?${params.toString()}`),
    fetch(`https://api.brightsky.dev/alerts?${params.toString()}`)
  ]);

  if (!currentResponse.ok) return null;
  const current = (await currentResponse.json()) as BrightSkyResponse;
  const alerts = alertsResponse.ok ? ((await alertsResponse.json()) as BrightSkyAlertsResponse).alerts ?? [] : [];
  const source = current.sources?.[0];
  const weather = current.weather;
  if (!weather) return null;

  return {
    stationName: source?.station_name ?? "DWD-Station",
    distance: numberOrNull(source?.distance),
    timestamp: weather.timestamp ?? "",
    temperature: numberOrNull(weather.temperature),
    condition: weather.condition ?? "unknown",
    windSpeed: numberOrNull(weather.wind_speed_10),
    windGust: numberOrNull(weather.wind_gust_speed_10),
    sunshine: numberOrNull(weather.sunshine_60),
    solar: numberOrNull(weather.solar_60),
    alerts: alerts.slice(0, 3).map((alert, index) => ({
      id: alert.id ?? `${alert.event ?? "alert"}-${index}`,
      event: alert.event ?? "Wetterwarnung",
      headline: alert.headline ?? alert.event ?? "DWD-Warnung",
      severity: alert.severity ?? "unknown",
      effective: alert.effective ?? "",
      expires: alert.expires ?? ""
    }))
  };
}

async function getDwdPollen(location: LocationInfo): Promise<DwdPollenData | null> {
  try {
    return await getDwdPollenDirect(location);
  } catch {
    return getDwdPollenViaAchoo(location);
  }
}

async function getDwdPollenDirect(location: LocationInfo): Promise<DwdPollenData | null> {
  const response = await fetch("https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json");
  if (!response.ok) throw new Error("DWD pollen unavailable");
  const data = (await response.json()) as DwdPollenPayload;
  const state = mapStateToDwdPollenRegion(location.state);
  const content = data.content ?? [];
  const region =
    content.find((entry) => normalize(entry.region_name).includes(normalize(state))) ??
    content.find((entry) => normalize(entry.region_name).includes(normalize(location.state))) ??
    content[0];
  if (!region) return null;

  return {
    lastUpdate: data.last_update ?? "",
    regionName: region.region_name,
    partRegionName: region.partregion_name,
    pollen: Object.entries(region.Pollen).map(([name, values]) => ({
      name,
      today: values.today ?? "0",
      tomorrow: values.tomorrow ?? "0",
      dayAfter: values.dayafter_to ?? "0"
    }))
  };
}

async function getDwdPollenViaAchoo(location: LocationInfo): Promise<DwdPollenData | null> {
  const response = await fetch("https://api.achoo.dev/pollen");
  if (!response.ok) return null;
  const data = (await response.json()) as AchooPollenItem[];
  const state = mapStateToDwdPollenRegion(location.state);
  const region =
    data.find((entry) => normalize(entry.region).includes(normalize(state))) ??
    data.find((entry) => normalize(entry.region).includes(normalize(location.state))) ??
    data[0];
  if (!region) return null;

  return {
    lastUpdate: "DWD via achoo.dev",
    regionName: region.region,
    partRegionName: region.sub_region,
    pollen: region.pollen.map((item) => ({
      name: item.name,
      today: item.today.severity ?? "0",
      tomorrow: item.tomorrow.severity ?? "0",
      dayAfter: item.day_after_tomorrow.severity ?? "0"
    }))
  };
}

async function getUbaAir(location: LocationInfo): Promise<UbaAirData | null> {
  const stationsResponse = await fetch("https://luftdaten.umweltbundesamt.de/api-proxy/stations/json");
  if (!stationsResponse.ok) return null;
  const stationsPayload = (await stationsResponse.json()) as {
    data?: Record<string, Array<string | null>>;
  };

  const stations = Object.values(stationsPayload.data ?? {})
    .map((station) => ({
      id: station[0] ?? "",
      code: station[1] ?? "",
      name: station[2] ?? "",
      activeTo: station[6],
      longitude: Number(station[7]),
      latitude: Number(station[8])
    }))
    .filter((station) => {
      return !station.activeTo && Number.isFinite(station.latitude) && Number.isFinite(station.longitude);
    })
    .map((station) => ({
      ...station,
      distance: distanceKm(location.latitude, location.longitude, station.latitude, station.longitude)
    }))
    .sort((a, b) => a.distance - b.distance);

  const station = stations[0];
  if (!station) return null;

  const today = localDate();
  const params = new URLSearchParams({
    date_from: today,
    date_to: today,
    time_from: "1",
    time_to: "24",
    station: station.code
  });
  const airResponse = await fetch(`https://luftdaten.umweltbundesamt.de/api-proxy/airquality/json?${params.toString()}`);
  if (!airResponse.ok) return null;
  const airPayload = (await airResponse.json()) as {
    data?: Record<string, Record<string, unknown[]>>;
  };
  const stationData = Object.values(airPayload.data ?? {})[0];
  const latest = Object.values(stationData ?? {}).at(-1) as unknown[] | undefined;
  if (!latest) {
    return {
      stationName: station.name,
      stationCode: station.code,
      distance: station.distance,
      timestamp: "",
      totalIndex: null,
      components: []
    };
  }

  return {
    stationName: station.name,
    stationCode: station.code,
    distance: station.distance,
    timestamp: String(latest[0] ?? ""),
    totalIndex: numberOrNull(latest[1]),
    components: latest
      .slice(3)
      .filter(Array.isArray)
      .map((component) => {
        const values = component as unknown[];
        const id = Number(values[0]);
        return {
          id,
          name: ubaComponentName(id),
          value: numberOrNull(values[1]),
          index: numberOrNull(values[2])
        };
      })
  };
}

async function getWaterLevel(location: LocationInfo): Promise<WaterLevelData | null> {
  const fetchStations = async (radius: number) => {
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      radius: String(radius),
      includeTimeseries: "true",
      includeCurrentMeasurement: "true"
    });
    const response = await fetch(`https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations.json?${params.toString()}`);
    if (!response.ok) return [] as PegelStation[];
    return (await response.json()) as PegelStation[];
  };

  const stations30 = await fetchStations(30);
  const stations = stations30.length ? stations30 : await fetchStations(80);
  const station = stations
    .map((candidate) => ({
      station: candidate,
      waterLevel: candidate.timeseries?.find((series) => series.shortname === "W" && series.currentMeasurement),
      distance: distanceKm(location.latitude, location.longitude, candidate.latitude ?? 0, candidate.longitude ?? 0)
    }))
    .filter((candidate) => candidate.waterLevel?.currentMeasurement && Number.isFinite(candidate.distance))
    .sort((a, b) => a.distance - b.distance)[0];

  if (!station?.waterLevel?.currentMeasurement) return null;
  const history = station.station.uuid
    ? await getWaterLevelHistory(station.station.uuid, station.waterLevel.shortname ?? "W")
    : [];
  return {
    stationName: station.station.shortname ?? station.station.longname ?? "Pegel",
    waterName: station.station.water?.longname ?? station.station.water?.shortname ?? "Gewässer",
    distance: station.distance,
    timestamp: station.waterLevel.currentMeasurement.timestamp ?? "",
    value: numberOrNull(station.waterLevel.currentMeasurement.value),
    unit: station.waterLevel.unit ?? "cm",
    state: station.waterLevel.currentMeasurement.stateMnwMhw ?? "unknown",
    nextTide: estimateNextTide(history),
    history
  };
}

async function getWaterLevelHistory(uuid: string, timeseries: string) {
  const response = await fetch(
    `https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/${uuid}/${timeseries}/measurements.json?start=P2D`
  );
  if (!response.ok) return [];
  const data = (await response.json()) as PegelMeasurement[];
  return data
    .slice(-192)
    .map((measurement) => ({
      time: measurement.timestamp ?? "",
      value: numberOrNull(measurement.value)
    }))
    .filter((measurement) => measurement.time);
}

function estimateNextTide(history: WaterLevelData["history"]): TideEstimate | null {
  const points = history
    .map((measurement) => ({
      time: Date.parse(measurement.time),
      value: measurement.value
    }))
    .filter((point): point is { time: number; value: number } => Number.isFinite(point.time) && point.value !== null)
    .sort((a, b) => a.time - b.time);

  if (points.length < 16) return null;

  const extrema: Array<{ time: number; value: number; type: "high" | "low" }> = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if (current.value >= previous.value && current.value > next.value) {
      extrema.push({ ...current, type: "high" });
    } else if (current.value <= previous.value && current.value < next.value) {
      extrema.push({ ...current, type: "low" });
    }
  }

  const filtered = extrema.reduce<typeof extrema>((result, current) => {
    const previous = result.at(-1);
    if (!previous) return [current];
    const hoursSincePrevious = (current.time - previous.time) / 3_600_000;
    const valueChange = Math.abs(current.value - previous.value);
    if (hoursSincePrevious < 3 || valueChange < 10) {
      if (
        previous.type === current.type &&
        ((current.type === "high" && current.value > previous.value) || (current.type === "low" && current.value < previous.value))
      ) {
        result[result.length - 1] = current;
      }
      return result;
    }
    if (previous.type === current.type) {
      result[result.length - 1] =
        current.type === "high"
          ? current.value > previous.value
            ? current
            : previous
          : current.value < previous.value
            ? current
            : previous;
      return result;
    }
    result.push(current);
    return result;
  }, []);

  if (filtered.length < 3) return null;

  const intervals = filtered
    .slice(1)
    .map((extremum, index) => extremum.time - filtered[index].time)
    .filter((interval) => interval >= 4 * 3_600_000 && interval <= 9 * 3_600_000);

  if (intervals.length < 2) return null;

  const medianInterval = intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
  let lastExtremum = filtered.at(-1);
  if (!lastExtremum) return null;

  const latestMeasurementTime = points.at(-1)?.time ?? Date.now();
  let nextTime = lastExtremum.time + medianInterval;
  let nextType: "high" | "low" = lastExtremum.type === "high" ? "low" : "high";

  while (nextTime <= latestMeasurementTime) {
    nextTime += medianInterval;
    nextType = nextType === "high" ? "low" : "high";
  }

  return {
    time: new Date(nextTime).toISOString(),
    type: nextType,
    estimated: true
  };
}

function getWarnings(location: LocationInfo): Promise<WarningItem[]> {
  return new Promise((resolve) => {
    const previous = window.warnWetter;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve([]);
    }, 6000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      script.remove();
      window.warnWetter = previous;
    };

    window.warnWetter = {
      loadWarnings: (payload) => {
        cleanup();
        resolve(filterDwdWarnings(payload, location));
      }
    };

    script.onerror = () => {
      cleanup();
      resolve([]);
    };
    script.src = "https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json";
    document.body.appendChild(script);
  });
}

function filterDwdWarnings(payload: DwdWarningPayload, location: LocationInfo): WarningItem[] {
  const allWarnings = [
    ...Object.values(payload.warnings ?? {}).flat(),
    ...Object.values(payload.vorabInformation ?? {}).flat()
  ];
  const searchTerms = [location.place, location.state]
    .map(normalize)
    .filter((term) => term.length >= 4);

  return allWarnings
    .filter((warning) => {
      const region = normalize(warning.regionName ?? "");
      return searchTerms.some((term) => region.includes(term) || term.includes(region));
    })
    .map((warning, index) => ({
      id: `${warning.start ?? "warning"}-${warning.type ?? 0}-${index}`,
      headline: warning.headline || warning.event || "DWD-Warnung",
      description: warning.description ?? "",
      regionName: warning.regionName ?? location.place,
      level: warning.level ?? 0,
      type: warning.type ?? 0,
      start: warning.start ?? 0,
      end: warning.end ?? 0,
      instruction: warning.instruction
    }))
    .sort((a, b) => b.level - a.level || a.start - b.start)
    .slice(0, 5);
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapStateToDwdPollenRegion(state: string) {
  const normalized = normalize(state);
  if (["schleswig holstein", "hamburg"].includes(normalized)) return "Schleswig-Holstein und Hamburg";
  if (["niedersachsen", "bremen"].includes(normalized)) return "Niedersachsen und Bremen";
  if (["brandenburg", "berlin"].includes(normalized)) return "Brandenburg und Berlin";
  if (["rheinland pfalz", "saarland"].includes(normalized)) return "Rheinland-Pfalz und Saarland";
  return state;
}

function ubaComponentName(id: number) {
  const names: Record<number, string> = {
    1: "PM10",
    2: "CO",
    3: "Ozon",
    4: "SO2",
    5: "NO2",
    9: "PM2.5"
  };
  return names[id] ?? `Komponente ${id}`;
}

function localDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}
