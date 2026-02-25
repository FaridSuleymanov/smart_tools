import { NextRequest, NextResponse } from 'next/server';

// ── Types ─────────────────────────────────────────────────────────
export interface WebcamData {
  id: string;
  title: string;
  lat: number;
  lon: number;
  thumbnailUrl: string;   // current/preview image
  previewUrl: string;     // larger preview
  playerUrl: string;      // embed/player link
  pageUrl: string;        // full webcam page on windy
  status: 'active' | 'inactive';
  lastUpdated: string;    // ISO date of last image update
  category: string;       // e.g. "traffic", "city", "landscape"
}

export interface WebcamsResponse {
  webcams: WebcamData[];
  total: number;
  error?: string;
}

const MAX_DEG_SPAN = 8;
const MAX_WEBCAMS = 50;

/**
 * POST /api/webcams
 * Body: { south, west, north, east }  (bounding box)
 *
 * Fetches public webcams from Windy Webcams API v3 within the viewport.
 * Only returns active, legally public webcams.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.WINDY_WEBCAMS_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { webcams: [], total: 0, error: 'WINDY_WEBCAMS_KEY not configured' } satisfies WebcamsResponse
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
        { webcams: [], total: 0, error: 'Zoom in further (max 8° span)' } satisfies WebcamsResponse
      );
    }

    // Windy Webcams API v3
    // bbox format: {north},{east},{south},{west} (top-right, bottom-left)
    const url = new URL('https://api.windy.com/webcams/api/v3/webcams');
    url.searchParams.set('bbox', `${north},${east},${south},${west}`);
    url.searchParams.set('limit', String(MAX_WEBCAMS));
    url.searchParams.set('include', 'images,urls,location,categories');

    const res = await fetch(url.toString(), {
      headers: {
        'x-windy-api-key': apiKey,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      // Fallback: try v2 API format
      const v2Result = await tryV2Api(apiKey, north, east, south, west);
      if (v2Result) return NextResponse.json(v2Result);

      const errText = await res.text().catch(() => '');
      console.error(`[Webcams] API HTTP ${res.status}: ${errText}`);
      return NextResponse.json(
        { webcams: [], total: 0, error: `Webcams API error: ${res.status}` } satisfies WebcamsResponse
      );
    }

    const data = await res.json();
    const webcams = parseV3Response(data);

    return NextResponse.json({
      webcams,
      total: webcams.length,
    } satisfies WebcamsResponse);
  } catch (err: any) {
    console.error('[Webcams] endpoint error:', err);
    return NextResponse.json(
      { webcams: [], total: 0, error: err?.message } satisfies WebcamsResponse,
      { status: 500 }
    );
  }
}

// ── Parse v3 API response ─────────────────────────────────────────
function parseV3Response(data: any): WebcamData[] {
  const webcams: WebcamData[] = [];
  const items = data.webcams || data.result?.webcams || [];

  for (const cam of items) {
    try {
      const id = cam.webcamId || cam.id || '';
      const title = cam.title || 'Unknown Camera';

      // Location
      const lat = cam.location?.latitude ?? cam.position?.latitude;
      const lon = cam.location?.longitude ?? cam.position?.longitude;
      if (typeof lat !== 'number' || typeof lon !== 'number') continue;

      // Status
      const status = cam.status === 'active' || cam.lastUpdatedOn ? 'active' : 'inactive';

      // Images
      const images = cam.images || cam.image || {};
      const current = images.current || images.daylight || {};
      const thumbnailUrl = current.thumbnail || current.icon || current.preview || '';
      const previewUrl = current.preview || current.thumbnail || '';

      // URLs
      const urls = cam.urls || cam.url || {};
      const playerUrl = urls.player || urls.embed || '';
      const pageUrl = urls.detail || urls.edit ||
        `https://www.windy.com/webcams/${id}`;

      // Last updated
      const lastUpdated = cam.lastUpdatedOn || cam.lastUpdate || '';

      // Categories
      const categories = cam.categories || [];
      const category = categories.length > 0
        ? (categories[0].name || categories[0].id || categories[0] || 'general')
        : 'general';

      webcams.push({
        id: String(id),
        title,
        lat,
        lon,
        thumbnailUrl,
        previewUrl,
        playerUrl,
        pageUrl,
        status: status as 'active' | 'inactive',
        lastUpdated,
        category: String(category).toLowerCase(),
      });
    } catch {
      continue;
    }
  }

  return webcams;
}

// ── Fallback: try Windy Webcams v2 API ────────────────────────────
async function tryV2Api(
  apiKey: string,
  north: number,
  east: number,
  south: number,
  west: number,
): Promise<WebcamsResponse | null> {
  try {
    // v2 format: /v2/list/bbox={ne_lat},{ne_lng},{sw_lat},{sw_lng}
    const url = `https://api.windy.com/api/webcams/v2/list/bbox=${north},${east},${south},${west}/limit=${MAX_WEBCAMS}?show=webcams:image,location,url&key=${apiKey}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const result = data.result || {};
    const cams = result.webcams || [];

    const webcams: WebcamData[] = [];

    for (const cam of cams) {
      try {
        const id = cam.id || '';
        const title = cam.title || 'Unknown Camera';
        const lat = cam.location?.latitude;
        const lon = cam.location?.longitude;
        if (typeof lat !== 'number' || typeof lon !== 'number') continue;

        const status = cam.status === 'active' ? 'active' : 'inactive';

        const image = cam.image || {};
        const current = image.current || image.daylight || {};
        const thumbnailUrl = current.thumbnail || current.icon || '';
        const previewUrl = current.preview || current.thumbnail || '';

        const urlData = cam.url || {};
        const pageUrl = urlData.current?.desktop || urlData.edit ||
          `https://www.windy.com/webcams/${id}`;
        const playerUrl = urlData.current?.mobile || pageUrl;

        const lastUpdated = cam.image?.update
          ? new Date(cam.image.update * 1000).toISOString()
          : '';

        const category = cam.category?.[0]?.id || 'general';

        webcams.push({
          id: String(id),
          title,
          lat,
          lon,
          thumbnailUrl,
          previewUrl,
          playerUrl,
          pageUrl,
          status,
          lastUpdated,
          category: String(category).toLowerCase(),
        });
      } catch {
        continue;
      }
    }

    return { webcams, total: webcams.length };
  } catch {
    return null;
  }
}
