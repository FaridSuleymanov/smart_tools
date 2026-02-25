import { NextRequest, NextResponse } from 'next/server';

// ── Types ─────────────────────────────────────────────────────────
export interface ACLEDEvent {
  eventId: string;
  eventDate: string;
  eventType: string;
  subEventType: string;
  actor1: string;
  actor2: string;
  lat: number;
  lon: number;
  location: string;
  country: string;
  admin1: string;
  fatalities: number;
  notes: string;
  source: string;
  disorderType: string;
  civilianTargeting: string;
}

export interface ACLEDResponse {
  events: ACLEDEvent[];
  total: number;
  source: 'acled';
  timeRange: string;
  error?: string;
}

const MAX_DEG_SPAN = 15; // ACLED works better with larger areas
const DEFAULT_DAYS = 30; // Last 30 days of curated data

/**
 * POST /api/acled
 * Body: { south, west, north, east, days? }
 *
 * Fetches analyst-curated conflict events from ACLED.
 * ACLED data is the gold standard — weekly updated, human-verified,
 * includes event types, actors, fatalities, and detailed notes.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.ACLED_API_KEY;
  const email = process.env.ACLED_EMAIL;

  if (!apiKey || !email) {
    return NextResponse.json(
      { events: [], total: 0, source: 'acled', timeRange: '', error: 'ACLED_API_KEY and ACLED_EMAIL not configured' } satisfies ACLEDResponse
    );
  }

  try {
    const body = await req.json();
    const { south, west, north, east, days } = body;

    if ([south, west, north, east].some((v) => typeof v !== 'number' || isNaN(v))) {
      return NextResponse.json({ error: 'Invalid bounding box' }, { status: 400 });
    }

    const latSpan = Math.abs(north - south);
    const lonSpan = Math.abs(east - west);
    if (latSpan > MAX_DEG_SPAN || lonSpan > MAX_DEG_SPAN) {
      return NextResponse.json(
        { events: [], total: 0, source: 'acled', timeRange: '', error: 'Zoom in further (max 15° span)' } satisfies ACLEDResponse
      );
    }

    // Date range
    const numDays = typeof days === 'number' ? Math.min(days, 365) : DEFAULT_DAYS;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numDays);
    const startStr = formatDate(startDate);
    const endStr = formatDate(endDate);

    // Build ACLED API URL
    // ACLED API uses latitude/longitude range filters
    const params = new URLSearchParams({
      key: apiKey,
      email: email,
      event_date: `${startStr}|${endStr}`,
      event_date_where: 'BETWEEN',
      latitude: String(south),
      latitude_where: '>=',
      longitude: String(west),
      longitude_where: '>=',
      limit: '500',
      fields: 'event_id_cnty|event_date|disorder_type|event_type|sub_event_type|actor1|actor2|latitude|longitude|location|country|admin1|fatalities|notes|source|civilian_targeting',
    });

    // We need two lat/lon filters: >= south AND <= north, >= west AND <= east
    // ACLED API supports pipe-separated fields but only one where per field
    // So we do a broader query and filter client-side for the upper bounds
    const url = `https://api.acleddata.com/acled/read?${params.toString()}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[ACLED] HTTP ${res.status}: ${errText}`);
      return NextResponse.json(
        { events: [], total: 0, source: 'acled', timeRange: `${startStr} to ${endStr}`, error: `ACLED API error: ${res.status}` } satisfies ACLEDResponse
      );
    }

    const data = await res.json();

    // ACLED returns { success: true, data: [...] } or { count, data }
    const rawEvents: any[] = data.data || [];

    // Filter to actual bbox (ACLED API only supports >= on lat/lon, not <=)
    const events: ACLEDEvent[] = [];
    for (const e of rawEvents) {
      const lat = parseFloat(e.latitude);
      const lon = parseFloat(e.longitude);
      if (isNaN(lat) || isNaN(lon)) continue;
      if (lat > north || lon > east) continue; // client-side upper bound filter

      events.push({
        eventId: e.event_id_cnty || '',
        eventDate: e.event_date || '',
        eventType: e.event_type || '',
        subEventType: e.sub_event_type || '',
        actor1: e.actor1 || '',
        actor2: e.actor2 || '',
        lat,
        lon,
        location: e.location || '',
        country: e.country || '',
        admin1: e.admin1 || '',
        fatalities: parseInt(e.fatalities, 10) || 0,
        notes: e.notes || '',
        source: e.source || '',
        disorderType: e.disorder_type || '',
        civilianTargeting: e.civilian_targeting || '',
      });
    }

    return NextResponse.json({
      events,
      total: events.length,
      source: 'acled',
      timeRange: `${startStr} to ${endStr}`,
    } satisfies ACLEDResponse);
  } catch (err: any) {
    console.error('[ACLED] endpoint error:', err);
    return NextResponse.json(
      { events: [], total: 0, source: 'acled', timeRange: '', error: err?.message } satisfies ACLEDResponse,
      { status: 500 }
    );
  }
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
