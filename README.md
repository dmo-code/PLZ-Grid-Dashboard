# PLZ Grid Dashboard

Responsive React/TypeScript dashboard for German postal codes. The app stores postal code, enabled widgets, widget order and widget sizes in `localStorage`, so it works without login or backend.

## Free data sources

- Postal code lookup: [Zippopotam.us](https://docs.zippopotam.us/)
- Administrative postal code context: [OpenPLZ API](https://www.openplzapi.org/de/)
- Weather and sunrise/sunset: [Open-Meteo Forecast API](https://open-meteo.com/)
- Moon phase, position and rise/set: local calculations based on [SunCalc](https://github.com/mourner/suncalc)
- Official DWD weather observations: [Bright Sky](https://brightsky.dev/)
- Air quality and pollen: [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api)
- Official air quality station data: [Umweltbundesamt Luftdaten](https://luftdaten.umweltbundesamt.de/en)
- Weather warnings: [DWD warnings JSONP](https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json)
- Official pollen hazard index: [DWD Open Data](https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json)
- Water levels: [PEGELONLINE](https://www.pegelonline.wsv.de/webservices/rest-api/v2/)
- Grid state: [StromGedacht API](https://www.stromgedacht.de/api-docs)

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
