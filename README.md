# Ortblick

Responsive React/TypeScript dashboard for German places and postal codes. Ortblick stores postal code, modes, enabled widgets, widget order, widget sizes and widget panel state in `localStorage`, so it works without login or backend.

## Features

- Search by German postal code or place name, with a side panel for ambiguous postal-code results.
- Current location mode that asks for browser geolocation permission and loads dashboard data for the user's live coordinates.
- Versioned help drawer that opens once after updates with a short list of new features, plus a persistent help button for returning users.
- Editable dashboard modes with separate widget layouts, names and colors. Standard, hunting, fishing and current-location modes are prefilled, and users can add their own empty modes.
- Default modes can be restored from the widget panel after confirmation.
- Configurable widgets with drag-and-drop ordering, sizes and collapsible settings sections.
- Existing local widget settings are migrated into the newer mode format so returning users keep their layouts. When new default modes are introduced, they are added without overwriting existing user modes.
- Automatic refresh when the app becomes visible again and the current data is older than 15 minutes.
- Focused weather, air, pollen, warnings, sun, moon, water level, roof rain, solar, wind, humidity and pressure data.
- Solar forecast widget with configurable kWp, azimuth and panel tilt, 24/48/72-hour energy forecast, current expected power, peak, best solar phase and 3-day yield summary.
- Enhanced wind widget with gusts, Beaufort rating, direction, daily maxima and short-term trend.
- Installable PWA metadata via web app manifest.

## Free data sources

- Postal code lookup: [Zippopotam.us](https://docs.zippopotam.us/)
- Administrative postal code context: [OpenPLZ API](https://www.openplzapi.org/de/)
- Coordinate fallback for invalid postal-code coordinates: [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)
- Reverse geocoding for current-location labels: [OpenStreetMap Nominatim](https://nominatim.org/)
- Weather and sunrise/sunset: [Open-Meteo Forecast API](https://open-meteo.com/)
- Solar irradiance forecast: [Open-Meteo Forecast API](https://open-meteo.com/) with `global_tilted_irradiance`
- Moon phase, position and rise/set: local calculations based on [SunCalc](https://github.com/mourner/suncalc)
- Official DWD weather observations: [Bright Sky](https://brightsky.dev/)
- Air quality and pollen: [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api)
- Official air quality station data: [Umweltbundesamt Luftdaten](https://luftdaten.umweltbundesamt.de/en)
- Weather warnings: [DWD warnings JSONP](https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json)
- Official pollen hazard index: [DWD Open Data](https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json)
- Water levels: [PEGELONLINE](https://www.pegelonline.wsv.de/webservices/rest-api/v2/)

No paid APIs or API keys are used.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The Vite `base` is set to `./`, so the generated `dist` folder works on GitHub Pages project URLs.

## GitHub Pages

The repository includes `.github/workflows/deploy.yml`. Push to `main`, then set the repository Pages source to **GitHub Actions**.
