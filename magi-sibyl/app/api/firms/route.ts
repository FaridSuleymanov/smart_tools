import { NextRequest, NextResponse } from 'next/server';
import type { FirePoint, FireGroup, FIRMSResponse } from '@/lib/types';

// Products to query (all current VIIRS NRT sensors)
const FIRMS_PRODUCTS = [
  'VIIRS_SNPP_NRT',
  'VIIRS_NOAA20_NRT',
  'VIIRS_NOAA21_NRT',
];

const FIRMS_DAY_RANGE = 3; // last 3 days
const MAX_DEG_SPAN = 8;    // reject too-large viewports

/**
 * POST /api/firms
 * Body: { south, west, north, east }  (bounding box)
 *
 * Fetches fire data from NASA FIRMS for all VIIRS products,
 * parses CSV, groups by ~10m proximity, returns JSON.
 */
export async function POST(req: NextRequest) {
  const firmsKey = process.env.FIRMS_MAP_KEY;
  if (!firmsKey) {
    return NextResponse.json(
      { fires: [], totalPoints: 0, products: [], error: 'FIRMS_MAP_KEY not configured' } satisfies FIRMSResponse,
      { status: 200 } // still 200 so client degrades gracefully
    );
  }

  try {
    const { south, west, north, east } = await req.json();

    // Validate bounds
    if ([south, west, north, east].some((v) => typeof v !== 'number' || isNaN(v))) {
      return NextResponse.json({ error: 'Invalid bounding box' }, { status: 400 });
    }

    const latSpan = Math.abs(north - south);
    const lonSpan = Math.abs(east - west);
    if (latSpan > MAX_DEG_SPAN || lonSpan > MAX_DEG_SPAN) {
      return NextResponse.json(
        { fires: [], totalPoints: 0, products: [], error: 'Zoom in further (max 8° span)' } satisfies FIRMSResponse
      );
    }

    // FIRMS expects: west,south,east,north
    const bbox = `${west},${south},${east},${north}`;

    // Fetch all products in parallel
    const allPoints: FirePoint[] = [];
    const usedProducts: string[] = [];

    const fetches = FIRMS_PRODUCTS.map(async (product) => {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/${product}/${bbox}/${FIRMS_DAY_RANGE}`;

      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) {
          console.error(`[FIRMS] ${product} HTTP ${res.status}`);
          return;
        }

        const csv = await res.text();
        const points = parseFirmsCsv(csv, product);
        if (points.length > 0) {
          allPoints.push(...points);
          usedProducts.push(product);
        }
      } catch (err: any) {
        console.error(`[FIRMS] ${product} error:`, err?.message);
      }
    });

    await Promise.all(fetches);

    // Group points by proximity (~10m buckets)
    const groups = groupFirePoints(allPoints);

    const response: FIRMSResponse = {
      fires: groups,
      totalPoints: allPoints.length,
      products: usedProducts,
    };

    return NextResponse.json(response);
  } catch (err: any) {
    console.error('[FIRMS] endpoint error:', err);
    return NextResponse.json(
      { fires: [], totalPoints: 0, products: [], error: err?.message } satisfies FIRMSResponse,
      { status: 500 }
    );
  }
}

// ── CSV Parser ────────────────────────────────────────────────────
function parseFirmsCsv(csv: string, product: string): FirePoint[] {
  const points: FirePoint[] = [];
  if (!csv?.trim()) return points;

  const lines = csv.trim().split('\n');
  if (lines.length <= 1) return points;

  // Parse header
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = {
    lat: header.indexOf('latitude'),
    lon: header.indexOf('longitude'),
    date: header.indexOf('acq_date'),
    time: header.indexOf('acq_time'),
    conf: header.indexOf('confidence'),
    frp: header.indexOf('frp'),
    bright: header.indexOf('bright_ti4'),
  };

  if (idx.lat < 0 || idx.lon < 0) return points;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].trim();
    if (!row) continue;

    const cols = row.split(',');
    try {
      const lat = parseFloat(cols[idx.lat]);
      const lon = parseFloat(cols[idx.lon]);
      if (isNaN(lat) || isNaN(lon)) continue;

      const acqDate = idx.date >= 0 && idx.date < cols.length ? cols[idx.date].trim() : '';
      let acqTime = '??:??';
      if (idx.time >= 0 && idx.time < cols.length) {
        const t = cols[idx.time].trim();
        const num = parseInt(t, 10);
        if (!isNaN(num)) {
          const hhmm = String(num).padStart(4, '0');
          acqTime = `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;
        }
      }

      let confidence = -1;
      let confidenceRaw: string | null = null;
      if (idx.conf >= 0 && idx.conf < cols.length) {
        const c = cols[idx.conf].trim();
        const cNum = parseInt(c, 10);
        if (!isNaN(cNum)) {
          confidence = cNum;
        } else if (c.length > 0) {
          confidenceRaw = c; // "l", "n", "h" for VIIRS
        }
      }

      let frp: number | null = null;
      if (idx.frp >= 0 && idx.frp < cols.length) {
        const f = parseFloat(cols[idx.frp]);
        if (!isNaN(f)) frp = f;
      }

      let brightness: number | undefined;
      if (idx.bright >= 0 && idx.bright < cols.length) {
        const b = parseFloat(cols[idx.bright]);
        if (!isNaN(b)) brightness = b;
      }

      points.push({
        lat,
        lon,
        acqDate,
        acqTime,
        confidence,
        confidenceRaw,
        frp,
        product,
        brightness,
      });
    } catch {
      continue;
    }
  }

  return points;
}

// ── Group by ~10m proximity ───────────────────────────────────────
function groupFirePoints(points: FirePoint[]): FireGroup[] {
  const buckets = new Map<string, FirePoint[]>();

  for (const p of points) {
    // Bucket to ~10m (4 decimal places)
    const key = `${Math.round(p.lat * 10000)}:${Math.round(p.lon * 10000)}`;
    const arr = buckets.get(key) || [];
    arr.push(p);
    buckets.set(key, arr);
  }

  const groups: FireGroup[] = [];

  for (const pts of buckets.values()) {
    // Sort by time
    pts.sort((a, b) => {
      const ta = `${a.acqDate} ${a.acqTime}`;
      const tb = `${b.acqDate} ${b.acqTime}`;
      return ta.localeCompare(tb);
    });

    const first = pts[0];
    const last = pts[pts.length - 1];

    let maxFrp: number | null = null;
    const productSet = new Set<string>();
    for (const p of pts) {
      if (p.frp !== null && (maxFrp === null || p.frp > maxFrp)) maxFrp = p.frp;
      productSet.add(p.product);
    }

    groups.push({
      lat: first.lat,
      lon: first.lon,
      count: pts.length,
      points: pts,
      maxFrp,
      firstSeen: `${first.acqDate} ${first.acqTime}Z`,
      lastSeen: `${last.acqDate} ${last.acqTime}Z`,
      products: Array.from(productSet),
    });
  }

  return groups;
}
