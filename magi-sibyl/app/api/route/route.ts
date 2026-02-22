import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { start, end } = await req.json();
    const apiKey = process.env.ORS_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'ORS API key not configured' }, { status: 500 });
    }

    const res = await fetch(
      'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
        body: JSON.stringify({
          coordinates: [start, end],
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error('ORS error:', text);
      return NextResponse.json({ error: 'Route calculation failed' }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Route API error:', err);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
