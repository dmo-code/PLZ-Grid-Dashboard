import type { LocationInfo, MoonData } from "./types";

const dayMs = 1000 * 60 * 60 * 24;
const j1970 = 2440588;
const j2000 = 2451545;
const rad = Math.PI / 180;
const e = rad * 23.4397;

type MoonCoords = {
  ra: number;
  dec: number;
  dist: number;
};

type MoonTimes = {
  rise?: Date;
  set?: Date;
  alwaysUp?: boolean;
  alwaysDown?: boolean;
};

export function getMoonData(location: LocationInfo, date = new Date()): MoonData {
  const illumination = getMoonIllumination(date);
  const position = getMoonPosition(date, location.latitude, location.longitude);
  const times = getMoonTimes(date, location.latitude, location.longitude);

  return {
    phase: illumination.phase,
    phaseName: moonPhaseName(illumination.phase),
    illumination: illumination.fraction,
    angle: illumination.angle,
    altitude: position.altitude,
    azimuth: position.azimuth,
    distance: position.distance,
    rise: times.rise?.toISOString() ?? null,
    set: times.set?.toISOString() ?? null,
    alwaysUp: Boolean(times.alwaysUp),
    alwaysDown: Boolean(times.alwaysDown)
  };
}

function toJulian(date: Date) {
  return date.valueOf() / dayMs - 0.5 + j1970;
}

function toDays(date: Date) {
  return toJulian(date) - j2000;
}

function rightAscension(l: number, b: number) {
  return Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
}

function declination(l: number, b: number) {
  return Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
}

function azimuth(h: number, phi: number, dec: number) {
  return Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
}

function altitude(h: number, phi: number, dec: number) {
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h));
}

function siderealTime(d: number, lw: number) {
  return rad * (280.16 + 360.9856235 * d) - lw;
}

function astroRefraction(h: number) {
  const altitudeValue = h < 0 ? 0 : h;
  return 0.0002967 / Math.tan(altitudeValue + 0.00312536 / (altitudeValue + 0.08901179));
}

function solarMeanAnomaly(d: number) {
  return rad * (357.5291 + 0.98560028 * d);
}

function eclipticLongitude(m: number) {
  const c = rad * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
  const p = rad * 102.9372;
  return m + c + p + Math.PI;
}

function sunCoords(d: number) {
  const m = solarMeanAnomaly(d);
  const l = eclipticLongitude(m);
  return { dec: declination(l, 0), ra: rightAscension(l, 0) };
}

function moonCoords(d: number): MoonCoords {
  const l = rad * (218.316 + 13.176396 * d);
  const m = rad * (134.963 + 13.064993 * d);
  const f = rad * (93.272 + 13.22935 * d);
  const longitude = l + rad * 6.289 * Math.sin(m);
  const latitude = rad * 5.128 * Math.sin(f);
  const dist = 385001 - 20905 * Math.cos(m);

  return {
    ra: rightAscension(longitude, latitude),
    dec: declination(longitude, latitude),
    dist
  };
}

function getMoonPosition(date: Date, lat: number, lng: number) {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const c = moonCoords(d);
  const h = siderealTime(d, lw) - c.ra;
  let altitudeValue = altitude(h, phi, c.dec);
  const pa = Math.atan2(Math.sin(h), Math.tan(phi) * Math.cos(c.dec) - Math.sin(c.dec) * Math.cos(h));
  altitudeValue += astroRefraction(altitudeValue);

  return {
    azimuth: azimuth(h, phi, c.dec),
    altitude: altitudeValue,
    distance: c.dist,
    parallacticAngle: pa
  };
}

function getMoonIllumination(date: Date) {
  const d = toDays(date);
  const sun = sunCoords(d);
  const moon = moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(
    Math.sin(sun.dec) * Math.sin(moon.dec) + Math.cos(sun.dec) * Math.cos(moon.dec) * Math.cos(sun.ra - moon.ra)
  );
  const inc = Math.atan2(sdist * Math.sin(phi), moon.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(sun.dec) * Math.sin(sun.ra - moon.ra),
    Math.sin(sun.dec) * Math.cos(moon.dec) - Math.cos(sun.dec) * Math.sin(moon.dec) * Math.cos(sun.ra - moon.ra)
  );

  return {
    fraction: (1 + Math.cos(inc)) / 2,
    phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI,
    angle
  };
}

function hoursLater(date: Date, hours: number) {
  return new Date(date.valueOf() + hours * 60 * 60 * 1000);
}

function getMoonTimes(date: Date, lat: number, lng: number): MoonTimes {
  const t = new Date(date);
  t.setHours(0, 0, 0, 0);

  const hc = 0.133 * rad;
  let h0 = getMoonPosition(t, lat, lng).altitude - hc;
  let rise = 0;
  let set = 0;
  let ye = 0;

  for (let i = 1; i <= 24; i += 2) {
    const h1 = getMoonPosition(hoursLater(t, i), lat, lng).altitude - hc;
    const h2 = getMoonPosition(hoursLater(t, i + 1), lat, lng).altitude - hc;
    const a = (h0 + h2) / 2 - h1;
    const b = (h2 - h0) / 2;
    const xe = -b / (2 * a);
    ye = (a * xe + b) * xe + h1;
    const d = b * b - 4 * a * h1;
    let roots = 0;
    let x1 = 0;
    let x2 = 0;

    if (d >= 0) {
      const dx = Math.sqrt(d) / (Math.abs(a) * 2);
      x1 = xe - dx;
      x2 = xe + dx;
      if (Math.abs(x1) <= 1) roots += 1;
      if (Math.abs(x2) <= 1) roots += 1;
      if (x1 < -1) x1 = x2;
    }

    if (roots === 1) {
      if (h0 < 0) rise = i + x1;
      else set = i + x1;
    } else if (roots === 2) {
      rise = i + (ye < 0 ? x2 : x1);
      set = i + (ye < 0 ? x1 : x2);
    }

    if (rise && set) break;
    h0 = h2;
  }

  const result: MoonTimes = {};
  if (rise) result.rise = hoursLater(t, rise);
  if (set) result.set = hoursLater(t, set);
  if (!rise && !set) {
    if (ye > 0) result.alwaysUp = true;
    else result.alwaysDown = true;
  }
  return result;
}

function moonPhaseName(phase: number) {
  if (phase < 0.03 || phase > 0.97) return "Neumond";
  if (phase < 0.22) return "Zunehmende Sichel";
  if (phase < 0.28) return "Erstes Viertel";
  if (phase < 0.47) return "Zunehmender Mond";
  if (phase < 0.53) return "Vollmond";
  if (phase < 0.72) return "Abnehmender Mond";
  if (phase < 0.78) return "Letztes Viertel";
  return "Abnehmende Sichel";
}
