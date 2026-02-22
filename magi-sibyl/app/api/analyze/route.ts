import { NextRequest, NextResponse } from 'next/server';
import { fullMAGISybilAnalysis } from '@/lib/ai-cores';

export const maxDuration = 120; // Increased: 4 AI cores + up to 2 retries each + Sybil + validators

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, location, envContext } = body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required and must be a non-empty string.' },
        { status: 400 }
      );
    }

    if (query.trim().length > 5000) {
      return NextResponse.json(
        { error: 'Query must be under 5000 characters.' },
        { status: 400 }
      );
    }

    const result = await fullMAGISybilAnalysis(
      query.trim(),
      typeof location === 'string' ? location.trim() : undefined,
      envContext || undefined
    );

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('MAGI analysis endpoint error:', err);
    return NextResponse.json(
      { error: 'Internal server error during analysis.', details: err?.message },
      { status: 500 }
    );
  }
}
