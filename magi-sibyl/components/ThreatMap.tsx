'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ThreatSighting, FireGroup, AirQStation } from '@/lib/types';

interface Props {
  center: { lat: number; lng: number };
  onCenterChange: (loc: { lat: number; lng: number }) => void;
  threats: ThreatSighting[];
  fires: FireGroup[];
  airStations: AirQStation[];
  showFires: boolean;
  showAirQ: boolean;
}

// FRP -> color interpolation (gold to red)
function frpColor(frp: number | null): string {
  if (frp === null || frp <= 0) return '#ef4444';
  const t = Math.min(frp, 60) / 60;
  const r = Math.round(255);
  const g = Math.round(215 * (1 - t) + 68 * t);
  const b = Math.round(0);
  return `rgb(${r},${g},${b})`;
}

// PM value -> color interpolation (green to red via yellow)
function aqColor(value: number | null): string {
  if (value === null) return '#6b7280';
  const v = Math.max(0, Math.min(200, value));
  const t = v / 200;
  if (t < 0.5) {
    // green -> yellow
    const tt = t * 2;
    return `rgb(${Math.round(tt * 255)},${Math.round(200 + tt * 55)},0)`;
  } else {
    // yellow -> red
    const tt = (t - 0.5) * 2;
    return `rgb(${Math.round(255)},${Math.round(255 * (1 - tt))},0)`;
  }
}

export default function ThreatMap({
  center, onCenterChange, threats, fires, airStations, showFires, showAirQ,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const threatMarkersRef = useRef<maplibregl.Marker[]>([]);
  const fireMarkersRef = useRef<maplibregl.Marker[]>([]);
  const aqMarkersRef = useRef<maplibregl.Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const initialCenter = useRef(center);
  const [mapReady, setMapReady] = useState(false);

  // ── Initialize map ONCE ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    if (!maptilerKey) {
      console.error('NEXT_PUBLIC_MAPTILER_KEY is missing');
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${maptilerKey}`,
      center: [initialCenter.current.lng, initialCenter.current.lat],
      zoom: 12,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-left');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-left'
    );

    userMarkerRef.current = new maplibregl.Marker({ color: '#22c55e' })
      .setLngLat([initialCenter.current.lng, initialCenter.current.lat])
      .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML('<b>YOUR POSITION</b>'))
      .addTo(map);

    map.on('moveend', () => {
      const c = map.getCenter();
      onCenterChange({ lat: c.lat, lng: c.lng });
    });

    map.on('load', () => setMapReady(true));

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update threat markers ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    threatMarkersRef.current.forEach((m) => m.remove());
    threatMarkersRef.current = [];

    threats.forEach((t) => {
      const el = createDot('#ef4444', 10);
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([t.lng, t.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 12 }).setHTML(
            `<b>⚠ THREAT SIGHTING</b><br/><span style="font-size:11px;color:#a1a1aa">${
              t.timestamp ? new Date(t.timestamp).toLocaleString() : 'Just now'
            }</span>`
          )
        )
        .addTo(map);
      threatMarkersRef.current.push(marker);
    });
  }, [threats]);

  // ── Update fire markers ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old
    fireMarkersRef.current.forEach((m) => m.remove());
    fireMarkersRef.current = [];

    if (!showFires) return;

    fires.forEach((g) => {
      const color = frpColor(g.maxFrp);
      const size = Math.max(8, Math.min(18, 8 + (g.count - 1) * 2));
      const el = createDot(color, size, '🔥');

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([g.lon, g.lat])
        .addTo(map);

      el.addEventListener('click', () => {
        if (popupRef.current) popupRef.current.remove();
        popupRef.current = new maplibregl.Popup({ offset: 15, maxWidth: '360px' })
          .setLngLat([g.lon, g.lat])
          .setHTML(buildFirePopup(g))
          .addTo(map);
      });

      fireMarkersRef.current.push(marker);
    });
  }, [fires, showFires]);

  // ── Update air quality markers ───────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    aqMarkersRef.current.forEach((m) => m.remove());
    aqMarkersRef.current = [];

    if (!showAirQ) return;

    airStations.forEach((s) => {
      const color = aqColor(s.primaryValue);
      const el = createDot(color, 12, '');
      el.style.border = '2px solid rgba(255,255,255,0.3)';

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([s.lon, s.lat])
        .addTo(map);

      el.addEventListener('click', () => {
        if (popupRef.current) popupRef.current.remove();
        popupRef.current = new maplibregl.Popup({ offset: 15, maxWidth: '360px' })
          .setLngLat([s.lon, s.lat])
          .setHTML(buildAQPopup(s))
          .addTo(map);
      });

      aqMarkersRef.current.push(marker);
    });
  }, [airStations, showAirQ]);

  // ── Enemy route simulation ───────────────────────────────────────
  const simulateEnemyRoute = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    const c = map.getCenter();
    const start = [c.lng - 0.08, c.lat + 0.05];
    const end = [c.lng, c.lat];

    if (map.getLayer('enemy-route')) {
      map.removeLayer('enemy-route');
      map.removeSource('enemy-route');
    }

    try {
      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end }),
      });
      if (!res.ok) throw new Error('Route failed');
      const geojson = await res.json();

      map.addSource('enemy-route', {
        type: 'geojson',
        data: geojson.features?.[0] || geojson,
      });
      map.addLayer({
        id: 'enemy-route',
        type: 'line',
        source: 'enemy-route',
        paint: {
          'line-color': '#ef4444',
          'line-width': 5,
          'line-opacity': 0.85,
          'line-dasharray': [2, 1],
        },
      });
    } catch {
      const fallback: GeoJSON.Feature = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [start, end] },
      };
      map.addSource('enemy-route', { type: 'geojson', data: fallback });
      map.addLayer({
        id: 'enemy-route',
        type: 'line',
        source: 'enemy-route',
        paint: { 'line-color': '#ef4444', 'line-width': 4, 'line-opacity': 0.8, 'line-dasharray': [4, 2] },
      });
    }

    new maplibregl.Marker({ color: '#fbbf24' })
      .setLngLat([c.lng - 0.08, c.lat + 0.05])
      .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML('<b>⚠ SIMULATED ENEMY ORIGIN</b>'))
      .addTo(map);
  }, []);

  // ── Get current viewport bounds ──────────────────────────────────
  const getBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map) return null;
    const b = map.getBounds();
    return {
      south: b.getSouth(),
      west: b.getWest(),
      north: b.getNorth(),
      east: b.getEast(),
    };
  }, []);

  // Expose getBounds via a callback on the container element
  useEffect(() => {
    const el = containerRef.current;
    if (el) (el as any).__getBounds = getBounds;
  }, [getBounds]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Overlay controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button
          onClick={simulateEnemyRoute}
          className="bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-lg font-semibold text-xs shadow-lg shadow-red-900/40 transition-colors"
        >
          ⚔ Enemy Route
        </button>
      </div>

      {/* Legend */}
      {(showFires || showAirQ) && (
        <div className="absolute bottom-4 left-4 z-10 bg-zinc-900/90 backdrop-blur-sm rounded-lg p-3 text-xs font-mono border border-zinc-700 space-y-1">
          {showFires && (
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-orange-500" />
              <span className="text-zinc-400">Fire detections (FIRMS)</span>
              <span className="text-zinc-600">({fires.length} groups)</span>
            </div>
          )}
          {showAirQ && (
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-green-500 border border-white/30" />
              <span className="text-zinc-400">Air quality (OpenAQ)</span>
              <span className="text-zinc-600">({airStations.length} stations)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── DOM helpers ───────────────────────────────────────────────────
function createDot(color: string, size: number, emoji?: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.borderRadius = '50%';
  el.style.backgroundColor = color;
  el.style.cursor = 'pointer';
  el.style.boxShadow = `0 0 6px ${color}88`;
  el.style.transition = 'transform 0.15s';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  if (emoji) {
    el.style.fontSize = `${Math.max(10, size - 4)}px`;
    el.textContent = emoji;
    el.style.backgroundColor = 'transparent';
    el.style.boxShadow = 'none';
  }
  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.4)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });
  return el;
}

function buildFirePopup(g: FireGroup): string {
  const frpInfo = g.maxFrp !== null ? `${g.maxFrp.toFixed(1)} MW` : 'N/A';
  const products = g.products.map(prettyProduct).join(', ');
  let html = `
    <div style="font-family:monospace;font-size:12px;color:#fafafa">
      <div style="font-size:14px;font-weight:bold;margin-bottom:6px">🔥 FIRMS Fire Cluster</div>
      <div style="color:#a1a1aa;margin-bottom:4px">${g.lat.toFixed(5)}, ${g.lon.toFixed(5)}</div>
      <div><b>Detections:</b> ${g.count}</div>
      <div><b>Max FRP:</b> ${frpInfo}</div>
      <div><b>Sensors:</b> ${products}</div>
      <div><b>First:</b> ${g.firstSeen}</div>
      <div><b>Last:</b> ${g.lastSeen}</div>
    </div>`;
  return html;
}

function buildAQPopup(s: AirQStation): string {
  let rows = '';
  for (const r of s.readings) {
    rows += `<div style="display:flex;justify-content:space-between;gap:12px">
      <span style="color:#a1a1aa">${r.parameter.toUpperCase()}</span>
      <span><b>${r.value.toFixed(1)}</b> ${r.unit}</span>
    </div>`;
  }
  const dt = s.readings.find((r) => r.lastUpdated)?.lastUpdated || '';
  return `
    <div style="font-family:monospace;font-size:12px;color:#fafafa">
      <div style="font-size:14px;font-weight:bold;margin-bottom:6px">🌬 ${s.name}</div>
      <div style="color:#a1a1aa;margin-bottom:6px">${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}</div>
      ${rows}
      ${dt ? `<div style="color:#71717a;margin-top:6px;font-size:10px">Updated: ${dt}</div>` : ''}
    </div>`;
}

function prettyProduct(p: string): string {
  const map: Record<string, string> = {
    VIIRS_SNPP_NRT: 'VIIRS SNPP',
    VIIRS_NOAA20_NRT: 'VIIRS NOAA-20',
    VIIRS_NOAA21_NRT: 'VIIRS NOAA-21',
    MODIS_NRT: 'MODIS',
    LANDSAT_NRT: 'Landsat',
  };
  return map[p] || p;
}
