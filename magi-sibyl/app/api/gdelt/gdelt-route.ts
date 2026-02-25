import { NextRequest, NextResponse } from 'next/server';

// ── Types ─────────────────────────────────────────────────────────
export interface GDELTEvent {
  lat: number;
  lon: number;
  name: string;           // location name
  count: number;          // number of articles mentioning this location
  url: string;            // source article URL
  title: string;          // article title
  tone: number;           // sentiment score (-100 to +100)
  domain: string;         // source domain
  language: string;       // article language
  seenDate: string;       // when GDELT saw it
  imageUrl: string;       // sharing image if available
}

export interface GDELTResponse {
  events: GDELTEvent[];
  total: number;
  source: 'gdelt';
  query: string;
  timespan: string;
  error?: string;
}

// Conflict/security themes for GDELT GEO queries
const CONFLICT_THEMES = [
  'KILL', 'WOUND', 'KIDNAP',
  'MILITARY', 'TERROR', 'PROTEST',
  'REBELLION', 'ARREST', 'CRISISLEX_C01_CASUALTY',
  'CRISISLEX_C03_DEAD', 'CRISISLEX_C07_SAFETY',
].join(' OR ');

const DEFAULT_CONFLICT_QUERY = `(${CONFLICT_THEMES})`;

/**
 * POST /api/gdelt
 * Body: { south, west, north, east, query?, timespan? }
 *
 * Fetches real-time conflict/security events from GDELT.
 * GDELT is free, no API key required, updates every 15 minutes.
 * Uses the GEO 2.0 API for geographic points + DOC API for articles.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { south, west, north, east, query, timespan } = body;

    if ([south, west, north, east].some((v) => typeof v !== 'number' || isNaN(v))) {
      return NextResponse.json({ error: 'Invalid bounding box' }, { status: 400 });
    }

    // Build search query - use user query or default conflict themes
    const searchQuery = query && typeof query === 'string' && query.trim()
      ? query.trim()
      : DEFAULT_CONFLICT_QUERY;

    // Timespan: default 24h for real-time monitoring
    const ts = timespan || '24h';

    // Strategy: use both GEO API (for map points) and DOC API (for articles)
    const [geoEvents, docArticles] = await Promise.all([
      fetchGeoEvents(searchQuery, ts, south, west, north, east),
      fetchDocArticles(searchQuery, ts, south, west, north, east),
    ]);

    // Merge: geo events are primary (have coordinates), enrich with doc articles
    const events = mergeResults(geoEvents, docArticles);

    return NextResponse.json({
      events,
      total: events.length,
      source: 'gdelt',
      query: searchQuery,
      timespan: ts,
    } satisfies GDELTResponse);
  } catch (err: any) {
    console.error('[GDELT] endpoint error:', err);
    return NextResponse.json(
      { events: [], total: 0, source: 'gdelt', query: '', timespan: '', error: err?.message } satisfies GDELTResponse,
      { status: 500 }
    );
  }
}

// ── GDELT GEO 2.0 API ────────────────────────────────────────────
// Returns GeoJSON of locations mentioned near conflict keywords
async function fetchGeoEvents(
  query: string,
  timespan: string,
  south: number, west: number, north: number, east: number,
): Promise<GDELTEvent[]> {
  try {
    // GEO API: returns point locations from news coverage
    const url = new URL('https://api.gdeltproject.org/api/v2/geo/geo');
    url.searchParams.set('query', query);
    url.searchParams.set('mode', 'PointData');
    url.searchParams.set('format', 'GeoJSON');
    url.searchParams.set('timespan', timespan);
    url.searchParams.set('maxpoints', '200');
    url.searchParams.set('OUTPUTFIELDS', 'name,url,tone,domain,seendate,sharingimage');

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`[GDELT GEO] HTTP ${res.status}`);
      return [];
    }

    const geojson = await res.json();
    const features = geojson.features || [];
    const events: GDELTEvent[] = [];

    for (const f of features) {
      try {
        const coords = f.geometry?.coordinates;
        if (!coords || coords.length < 2) continue;

        const lon = coords[0];
        const lat = coords[1];

        // Filter to viewport
        if (lat < south || lat > north || lon < west || lon > east) continue;

        const props = f.properties || {};

        events.push({
          lat,
          lon,
          name: props.name || props.locationname || 'Unknown',
          count: props.count || props.numentions || 1,
          url: props.url || '',
          title: props.title || props.name || '',
          tone: parseFloat(props.tone) || 0,
          domain: props.domain || '',
          language: props.language || 'en',
          seenDate: props.seendate || props.urlpubtimedate || '',
          imageUrl: props.sharingimage || '',
        });
      } catch { continue; }
    }

    return events;
  } catch (err: any) {
    console.error('[GDELT GEO] error:', err?.message);
    return [];
  }
}

// ── GDELT DOC 2.0 API ────────────────────────────────────────────
// Returns articles matching conflict keywords near the viewport
async function fetchDocArticles(
  query: string,
  timespan: string,
  south: number, west: number, north: number, east: number,
): Promise<GDELTEvent[]> {
  try {
    // Construct a location-scoped search using sourceloc or near operator
    // The DOC API doesn't have native bbox, but we can use sourcecountry
    // and filter results by their geolocation metadata
    const centerLat = (south + north) / 2;
    const centerLon = (west + east) / 2;

    const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
    url.searchParams.set('query', query);
    url.searchParams.set('mode', 'ArtList');
    url.searchParams.set('format', 'json');
    url.searchParams.set('timespan', timespan);
    url.searchParams.set('maxrecords', '75');
    url.searchParams.set('sort', 'DateDesc');

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`[GDELT DOC] HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const articles = data.articles || [];
    const events: GDELTEvent[] = [];

    for (const a of articles) {
      try {
        // DOC API articles don't always have coordinates
        // We'll include them as supplementary context without map points
        events.push({
          lat: 0,  // no direct coordinates from DOC API
          lon: 0,
          name: a.sourcecountry || '',
          count: 1,
          url: a.url || '',
          title: a.title || '',
          tone: parseFloat(a.tone) || 0,
          domain: a.domain || '',
          language: a.language || 'en',
          seenDate: a.seendate || '',
          imageUrl: a.socialimage || '',
        });
      } catch { continue; }
    }

    return events;
  } catch (err: any) {
    console.error('[GDELT DOC] error:', err?.message);
    return [];
  }
}

// ── Merge GEO + DOC results ──────────────────────────────────────
function mergeResults(
  geoEvents: GDELTEvent[],
  docArticles: GDELTEvent[],
): GDELTEvent[] {
  // GEO events have coordinates → map markers
  // DOC articles are supplementary context (no coords, lat/lon = 0)
  // Keep geolocated events for map, add top doc articles as context
  const result: GDELTEvent[] = [...geoEvents];

  // Add doc articles that aren't duplicates (by URL)
  const seenUrls = new Set(geoEvents.map(e => e.url).filter(Boolean));
  for (const a of docArticles) {
    if (a.url && !seenUrls.has(a.url)) {
      result.push(a);
      seenUrls.add(a.url);
    }
  }

  return result;
}
