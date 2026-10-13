/**
 * Minimal OSRM client (public demo server, no API key).
 * Road distance + driving duration only — never straight-line math.
 */

export interface OsrmRoute {
  distanceKm: number;
  durationMin: number;
}

export async function fetchOsrmRoute(
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number,
  signal?: AbortSignal,
): Promise<OsrmRoute | null> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const data = await res.json();
  const r = data?.routes?.[0];
  if (!r || typeof r.duration !== "number" || typeof r.distance !== "number") return null;
  return { distanceKm: r.distance / 1000, durationMin: r.duration / 60 };
}
