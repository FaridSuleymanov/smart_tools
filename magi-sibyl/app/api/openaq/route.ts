import { NextRequest, NextResponse } from 'next/server';
import type { AirQStation, AirQReading, OpenAQResponse } from '@/lib/types';

const MAX_LOCATIONS = 50;  // limit to prevent excessive sub-requests
const MAX_DEG_SPAN = 8;

// Parameter priority for "primary" metric
const PARAM_PRIORITY: Record<string, number> = {
  'pm25': 1, 'pm2.5': 1,
  'pm10': 2,
  'no2': 3,
  'o3': 4,
  'so2': 5,
  'co': 6,
  'bc': 7,
};

/**
 * POST /api/openaq
 * Body: { south, west, north, east }
 *
 * Fetches air quality stations within bbox from OpenAQ v3,
 * then fetches latest sensor data for each station.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { stations: [], totalStations: 0, error: 'OPENAQ_API_KEY not configured' } satisfies OpenAQResponse
    );
  }

  try {
    const { south, west, north, east } = await req.json();

    if ([south, west, north, east].some((v) => typeof v !== 'number' || isNaN(v))) {
      return NextResponse.json({ error: 'Invalid bounding box' }, { status: 400 });
    }

    if (Math.abs(north - south) > MAX_DEG_SPAN || Math.abs(east - west) > MAX_DEG_SPAN) {
      return NextResponse.json(
        { stations: [], totalStations: 0, error: 'Zoom in further (max 8° span)' } satisfies OpenAQResponse
      );
    }

    // OpenAQ v3 bbox format: minX,minY,maxX,maxY (lon,lat,lon,lat)
    const bbox = `${west},${south},${east},${north}`;

    // Step 1: Get locations in bbox
    const locationsUrl = `https://api.openaq.org/v3/locations?bbox=${encodeURIComponent(bbox)}&limit=${MAX_LOCATIONS}&page=1`;

    const locRes = await fetch(locationsUrl, {
      headers: {
        'X-API-Key': apiKey,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!locRes.ok) {
      const errText = await locRes.text().catch(() => '');
      console.error(`[OpenAQ] locations HTTP ${locRes.status}: ${errText}`);
      return NextResponse.json(
        { stations: [], totalStations: 0, error: `OpenAQ locations error: ${locRes.status}` } satisfies OpenAQResponse
      );
    }

    const locData = await locRes.json();
    const locations: any[] = locData.results || [];

    if (locations.length === 0) {
      return NextResponse.json({ stations: [], totalStations: 0 } satisfies OpenAQResponse);
    }

    // Step 2: For each location, get latest sensor readings
    // Process in parallel batches of 10 to not overwhelm the API
    const stations: AirQStation[] = [];
    const batchSize = 10;

    for (let i = 0; i < locations.length; i += batchSize) {
      const batch = locations.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(async (loc: any) => {
          const locId = loc.id;
          if (!locId) return null;

          // Extract coordinates from location object
          const coords = loc.coordinates || {};
          const lat = coords.latitude;
          const lon = coords.longitude;
          if (typeof lat !== 'number' || typeof lon !== 'number') return null;

          const locName = loc.name || `Station ${locId}`;

          // Try to get latest data for this location
          try {
            const latestUrl = `https://api.openaq.org/v3/locations/${locId}/latest`;
            const latestRes = await fetch(latestUrl, {
              headers: {
                'X-API-Key': apiKey,
                'Accept': 'application/json',
              },
              signal: AbortSignal.timeout(10000),
            });

            if (!latestRes.ok) {
              // Fallback: try sensors endpoint (matches the Processing code approach)
              return await fetchViaSensors(locId, lat, lon, locName, apiKey);
            }

            const latestData = await latestRes.json();
            const results = latestData.results || [];

            const readings: AirQReading[] = [];
            for (const r of results) {
              try {
                const sensorParam = r.sensors?.[0]?.parameter?.name
                  || r.parameter?.name
                  || r.parameter
                  || 'unknown';
                const sensorUnit = r.sensors?.[0]?.parameter?.units
                  || r.parameter?.units
                  || 'µg/m³';
                const value = typeof r.value === 'number' ? r.value : parseFloat(r.value);
                if (isNaN(value)) continue;

                const dt = r.datetime?.utc || r.datetime?.local || '';

                readings.push({
                  parameter: normalizeParam(sensorParam),
                  value,
                  unit: sensorUnit,
                  lastUpdated: dt,
                });
              } catch {
                continue;
              }
            }

            if (readings.length === 0) return null;

            // Determine primary metric
            const { primaryValue, primaryParam } = pickPrimary(readings);

            return {
              id: locId,
              name: locName,
              lat,
              lon,
              readings,
              primaryValue,
              primaryParam,
            } satisfies AirQStation;
          } catch (err: any) {
            console.error(`[OpenAQ] station ${locId} error:`, err?.message);
            return null;
          }
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          stations.push(result.value);
        }
      }
    }

    return NextResponse.json({
      stations,
      totalStations: stations.length,
    } satisfies OpenAQResponse);
  } catch (err: any) {
    console.error('[OpenAQ] endpoint error:', err);
    return NextResponse.json(
      { stations: [], totalStations: 0, error: err?.message } satisfies OpenAQResponse,
      { status: 500 }
    );
  }
}

// ── Fallback: fetch via /locations/{id}/sensors ───────────────────
async function fetchViaSensors(
  locId: number,
  lat: number,
  lon: number,
  name: string,
  apiKey: string
): Promise<AirQStation | null> {
  try {
    const url = `https://api.openaq.org/v3/locations/${locId}/sensors`;
    const res = await fetch(url, {
      headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const sensors = data.results || [];
    const readings: AirQReading[] = [];

    for (const s of sensors) {
      try {
        const param = s.parameter?.name || 'unknown';
        const units = s.parameter?.units || 'µg/m³';

        // latest value
        const latest = s.latest || s.summary?.last;
        if (!latest) continue;

        const value = typeof latest.value === 'number'
          ? latest.value
          : parseFloat(latest.value);
        if (isNaN(value)) continue;

        const dt = latest.datetime?.utc || latest.datetime?.local || '';

        readings.push({
          parameter: normalizeParam(param),
          value,
          unit: units,
          lastUpdated: dt,
        });
      } catch {
        continue;
      }
    }

    if (readings.length === 0) return null;

    const { primaryValue, primaryParam } = pickPrimary(readings);

    return { id: locId, name, lat, lon, readings, primaryValue, primaryParam };
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function normalizeParam(p: string): string {
  const lower = p.toLowerCase().trim();
  if (lower === 'pm2.5' || lower === 'pm25') return 'pm25';
  return lower;
}

function pickPrimary(readings: AirQReading[]): {
  primaryValue: number | null;
  primaryParam: string | null;
} {
  // Sort by priority, pick highest-priority parameter
  const sorted = [...readings].sort((a, b) => {
    const pa = PARAM_PRIORITY[a.parameter] || 99;
    const pb = PARAM_PRIORITY[b.parameter] || 99;
    return pa - pb;
  });

  if (sorted.length === 0) return { primaryValue: null, primaryParam: null };
  return { primaryValue: sorted[0].value, primaryParam: sorted[0].parameter };
}
