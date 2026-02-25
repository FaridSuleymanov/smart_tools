'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ThreatSighting, FireGroup, AirQStation, WebcamData, ACLEDEvent, GDELTEvent } from '@/lib/types';

interface Props {
  center: { lat: number; lng: number };
  onCenterChange: (loc: { lat: number; lng: number }) => void;
  threats: ThreatSighting[];
  fires: FireGroup[];
  airStations: AirQStation[];
  webcams: WebcamData[];
  acledEvents: ACLEDEvent[];
  gdeltEvents: GDELTEvent[];
  showFires: boolean;
  showAirQ: boolean;
  showWebcams: boolean;
  showACLED: boolean;
  showGDELT: boolean;
}

function frpColor(frp: number | null): string {
  if (frp === null || frp <= 0) return '#ef4444';
  const t = Math.min(frp, 60) / 60;
  return `rgb(255,${Math.round(215 * (1 - t) + 68 * t)},0)`;
}

function aqColor(value: number | null): string {
  if (value === null) return '#6b7280';
  const t = Math.max(0, Math.min(200, value)) / 200;
  if (t < 0.5) { const tt = t * 2; return `rgb(${Math.round(tt * 255)},${Math.round(200 + tt * 55)},0)`; }
  const tt = (t - 0.5) * 2;
  return `rgb(255,${Math.round(255 * (1 - tt))},0)`;
}

// ACLED event type → color
function acledColor(eventType: string): string {
  const t = eventType.toLowerCase();
  if (t.includes('battle')) return '#dc2626';
  if (t.includes('explosion') || t.includes('remote')) return '#f97316';
  if (t.includes('violence against')) return '#ef4444';
  if (t.includes('protest')) return '#eab308';
  if (t.includes('riot')) return '#f59e0b';
  if (t.includes('strategic')) return '#8b5cf6';
  return '#dc2626';
}

// GDELT tone → color (negative = red, neutral = yellow, positive = green)
function gdeltToneColor(tone: number): string {
  if (tone < -5) return '#ef4444';
  if (tone < -1) return '#f97316';
  if (tone < 1) return '#eab308';
  if (tone < 5) return '#22c55e';
  return '#10b981';
}

export default function ThreatMap({
  center, onCenterChange, threats, fires, airStations, webcams,
  acledEvents, gdeltEvents,
  showFires, showAirQ, showWebcams, showACLED, showGDELT,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const threatMarkersRef = useRef<maplibregl.Marker[]>([]);
  const fireMarkersRef = useRef<maplibregl.Marker[]>([]);
  const aqMarkersRef = useRef<maplibregl.Marker[]>([]);
  const webcamMarkersRef = useRef<maplibregl.Marker[]>([]);
  const acledMarkersRef = useRef<maplibregl.Marker[]>([]);
  const gdeltMarkersRef = useRef<maplibregl.Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const initialCenter = useRef(center);
  const [mapReady, setMapReady] = useState(false);

  // ── Initialize map ONCE ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    if (!maptilerKey) { console.error('NEXT_PUBLIC_MAPTILER_KEY is missing'); return; }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${maptilerKey}`,
      center: [initialCenter.current.lng, initialCenter.current.lat],
      zoom: 12,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-left');
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), 'top-left');
    userMarkerRef.current = new maplibregl.Marker({ color: '#22c55e' })
      .setLngLat([initialCenter.current.lng, initialCenter.current.lat])
      .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML('<b>YOUR POSITION</b>'))
      .addTo(map);
    map.on('moveend', () => { const c = map.getCenter(); onCenterChange({ lat: c.lat, lng: c.lng }); });
    map.on('load', () => setMapReady(true));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Threat markers ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    threatMarkersRef.current.forEach((m) => m.remove());
    threatMarkersRef.current = [];
    threats.forEach((t) => {
      const el = createDot('#ef4444', 10);
      const marker = new maplibregl.Marker({ element: el }).setLngLat([t.lng, t.lat])
        .setPopup(new maplibregl.Popup({ offset: 12 }).setHTML(
          `<b>⚠ THREAT SIGHTING</b><br/><span style="font-size:11px;color:#a1a1aa">${t.timestamp ? new Date(t.timestamp).toLocaleString() : 'Just now'}</span>`
        )).addTo(map);
      threatMarkersRef.current.push(marker);
    });
  }, [threats]);

  // ── Fire markers ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    fireMarkersRef.current.forEach((m) => m.remove()); fireMarkersRef.current = [];
    if (!showFires) return;
    fires.forEach((g) => {
      const size = Math.max(8, Math.min(18, 8 + (g.count - 1) * 2));
      const el = createDot(frpColor(g.maxFrp), size, '🔥');
      const marker = new maplibregl.Marker({ element: el }).setLngLat([g.lon, g.lat]).addTo(map);
      el.addEventListener('click', () => { showPopup(map, [g.lon, g.lat], buildFirePopup(g)); });
      fireMarkersRef.current.push(marker);
    });
  }, [fires, showFires]);

  // ── AQ markers ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    aqMarkersRef.current.forEach((m) => m.remove()); aqMarkersRef.current = [];
    if (!showAirQ) return;
    airStations.forEach((s) => {
      const el = createDot(aqColor(s.primaryValue), 12); el.style.border = '2px solid rgba(255,255,255,0.3)';
      const marker = new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(map);
      el.addEventListener('click', () => { showPopup(map, [s.lon, s.lat], buildAQPopup(s)); });
      aqMarkersRef.current.push(marker);
    });
  }, [airStations, showAirQ]);

  // ── Webcam markers ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    webcamMarkersRef.current.forEach((m) => m.remove()); webcamMarkersRef.current = [];
    if (!showWebcams) return;
    webcams.forEach((cam) => {
      const el = createCamMarker(cam.status === 'active');
      const marker = new maplibregl.Marker({ element: el }).setLngLat([cam.lon, cam.lat]).addTo(map);
      el.addEventListener('click', () => { showPopup(map, [cam.lon, cam.lat], buildWebcamPopup(cam)); });
      webcamMarkersRef.current.push(marker);
    });
  }, [webcams, showWebcams]);

  // ── ACLED markers (diamonds — verified conflict) ─────────────────
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    acledMarkersRef.current.forEach((m) => m.remove()); acledMarkersRef.current = [];
    if (!showACLED) return;
    acledEvents.forEach((e) => {
      const el = createDiamond(acledColor(e.eventType), e.fatalities > 0 ? 14 : 10);
      const marker = new maplibregl.Marker({ element: el }).setLngLat([e.lon, e.lat]).addTo(map);
      el.addEventListener('click', () => { showPopup(map, [e.lon, e.lat], buildACLEDPopup(e)); });
      acledMarkersRef.current.push(marker);
    });
  }, [acledEvents, showACLED]);

  // ── GDELT markers (triangles — real-time signals) ────────────────
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    gdeltMarkersRef.current.forEach((m) => m.remove()); gdeltMarkersRef.current = [];
    if (!showGDELT) return;
    // Only show geolocated events (lat/lon !== 0)
    gdeltEvents.filter(e => e.lat !== 0 && e.lon !== 0).forEach((e) => {
      const el = createTriangle(gdeltToneColor(e.tone), Math.min(14, 8 + e.count));
      const marker = new maplibregl.Marker({ element: el }).setLngLat([e.lon, e.lat]).addTo(map);
      el.addEventListener('click', () => { showPopup(map, [e.lon, e.lat], buildGDELTPopup(e)); });
      gdeltMarkersRef.current.push(marker);
    });
  }, [gdeltEvents, showGDELT]);

  // ── Enemy route simulation ───────────────────────────────────────
  const simulateEnemyRoute = useCallback(async () => {
    const map = mapRef.current; if (!map) return;
    const c = map.getCenter();
    const start = [c.lng - 0.08, c.lat + 0.05]; const end = [c.lng, c.lat];
    if (map.getLayer('enemy-route')) { map.removeLayer('enemy-route'); map.removeSource('enemy-route'); }
    try {
      const res = await fetch('/api/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start, end }) });
      if (!res.ok) throw new Error('Route failed');
      const geojson = await res.json();
      map.addSource('enemy-route', { type: 'geojson', data: geojson.features?.[0] || geojson });
      map.addLayer({ id: 'enemy-route', type: 'line', source: 'enemy-route', paint: { 'line-color': '#ef4444', 'line-width': 5, 'line-opacity': 0.85, 'line-dasharray': [2, 1] } });
    } catch {
      const fb: GeoJSON.Feature = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [start, end] } };
      map.addSource('enemy-route', { type: 'geojson', data: fb });
      map.addLayer({ id: 'enemy-route', type: 'line', source: 'enemy-route', paint: { 'line-color': '#ef4444', 'line-width': 4, 'line-opacity': 0.8, 'line-dasharray': [4, 2] } });
    }
    new maplibregl.Marker({ color: '#fbbf24' }).setLngLat([c.lng - 0.08, c.lat + 0.05])
      .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML('<b>⚠ SIMULATED ENEMY ORIGIN</b>')).addTo(map);
  }, []);

  // ── Bounds ───────────────────────────────────────────────────────
  const getBounds = useCallback(() => {
    const map = mapRef.current; if (!map) return null;
    const b = map.getBounds();
    return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  }, []);

  useEffect(() => {
    const el = containerRef.current; if (el) (el as any).__getBounds = getBounds;
  }, [getBounds]);

  // ── Popup helper ─────────────────────────────────────────────────
  const showPopup = (map: maplibregl.Map, lngLat: [number, number], html: string) => {
    if (popupRef.current) popupRef.current.remove();
    popupRef.current = new maplibregl.Popup({ offset: 15, maxWidth: '400px' }).setLngLat(lngLat).setHTML(html).addTo(map);
  };

  const anyLayers = showFires || showAirQ || showWebcams || showACLED || showGDELT;

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button onClick={simulateEnemyRoute} className="bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-lg font-semibold text-xs shadow-lg shadow-red-900/40 transition-colors">⚔ Enemy Route</button>
      </div>
      {anyLayers && (
        <div className="absolute bottom-4 left-4 z-10 bg-zinc-900/90 backdrop-blur-sm rounded-lg p-3 text-xs font-mono border border-zinc-700 space-y-1">
          {showACLED && <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 bg-red-600" style={{ transform: 'rotate(45deg)' }} /><span className="text-zinc-400">ACLED verified conflicts</span><span className="text-zinc-600">({acledEvents.length})</span></div>}
          {showGDELT && <div className="flex items-center gap-2"><span className="inline-block w-0 h-0" style={{ borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '10px solid #eab308' }} /><span className="text-zinc-400">GDELT real-time signals</span><span className="text-zinc-600">({gdeltEvents.filter(e => e.lat !== 0).length})</span></div>}
          {showFires && <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full bg-orange-500" /><span className="text-zinc-400">Fire detections</span><span className="text-zinc-600">({fires.length})</span></div>}
          {showAirQ && <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full bg-green-500 border border-white/30" /><span className="text-zinc-400">Air quality</span><span className="text-zinc-600">({airStations.length})</span></div>}
          {showWebcams && <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full bg-violet-500 border border-white/30" /><span className="text-zinc-400">Public webcams</span><span className="text-zinc-600">({webcams.length})</span></div>}
        </div>
      )}
    </div>
  );
}

// ── DOM helpers ───────────────────────────────────────────────────
function createDot(color: string, size: number, emoji?: string): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, { width: `${size}px`, height: `${size}px`, borderRadius: '50%', backgroundColor: color, cursor: 'pointer', boxShadow: `0 0 6px ${color}88`, transition: 'transform 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' });
  if (emoji) { el.style.fontSize = `${Math.max(10, size - 4)}px`; el.textContent = emoji; el.style.backgroundColor = 'transparent'; el.style.boxShadow = 'none'; }
  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.4)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });
  return el;
}

function createDiamond(color: string, size: number): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, { width: `${size}px`, height: `${size}px`, backgroundColor: color, transform: 'rotate(45deg)', cursor: 'pointer', boxShadow: `0 0 8px ${color}88`, transition: 'all 0.15s', border: '1px solid rgba(255,255,255,0.3)' });
  el.addEventListener('mouseenter', () => { el.style.transform = 'rotate(45deg) scale(1.4)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'rotate(45deg) scale(1)'; });
  return el;
}

function createTriangle(color: string, size: number): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, { width: '0', height: '0', borderLeft: `${size/2}px solid transparent`, borderRight: `${size/2}px solid transparent`, borderBottom: `${size}px solid ${color}`, cursor: 'pointer', filter: `drop-shadow(0 0 4px ${color}88)`, transition: 'transform 0.15s' });
  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.4)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });
  return el;
}

function createCamMarker(active: boolean): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, { width: '24px', height: '24px', borderRadius: '6px', backgroundColor: active ? '#8b5cf6' : '#6b7280', border: '2px solid rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', boxShadow: active ? '0 0 8px rgba(139,92,246,0.5)' : 'none', transition: 'transform 0.15s' });
  el.textContent = '📹';
  el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.3)'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });
  return el;
}

// ── Popup builders ───────────────────────────────────────────────
function buildFirePopup(g: FireGroup): string {
  return `<div style="font-family:monospace;font-size:12px;color:#fafafa"><div style="font-size:14px;font-weight:bold;margin-bottom:6px">🔥 FIRMS Fire Cluster</div><div style="color:#a1a1aa;margin-bottom:4px">${g.lat.toFixed(5)}, ${g.lon.toFixed(5)}</div><div><b>Detections:</b> ${g.count}</div><div><b>Max FRP:</b> ${g.maxFrp !== null ? g.maxFrp.toFixed(1) + ' MW' : 'N/A'}</div><div><b>Sensors:</b> ${g.products.map(prettyProduct).join(', ')}</div><div><b>First:</b> ${g.firstSeen}</div><div><b>Last:</b> ${g.lastSeen}</div></div>`;
}

function buildAQPopup(s: AirQStation): string {
  const rows = s.readings.map(r => `<div style="display:flex;justify-content:space-between;gap:12px"><span style="color:#a1a1aa">${r.parameter.toUpperCase()}</span><span><b>${r.value.toFixed(1)}</b> ${r.unit}</span></div>`).join('');
  return `<div style="font-family:monospace;font-size:12px;color:#fafafa"><div style="font-size:14px;font-weight:bold;margin-bottom:6px">🌬 ${s.name}</div><div style="color:#a1a1aa;margin-bottom:6px">${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}</div>${rows}</div>`;
}

function buildWebcamPopup(cam: WebcamData): string {
  const status = cam.status === 'active' ? '<span style="color:#22c55e;font-weight:bold">● LIVE</span>' : '<span style="color:#6b7280">● Inactive</span>';
  const thumb = cam.thumbnailUrl ? `<img src="${cam.thumbnailUrl}" alt="${cam.title}" style="width:100%;max-width:360px;border-radius:6px;margin:8px 0;border:1px solid #3f3f46" onerror="this.style.display='none'" />` : '';
  const links = [cam.pageUrl ? `<a href="${cam.pageUrl}" target="_blank" style="color:#8b5cf6;text-decoration:underline;font-size:11px">Open camera →</a>` : '', cam.playerUrl ? `<a href="${cam.playerUrl}" target="_blank" style="color:#06b6d4;text-decoration:underline;font-size:11px;margin-left:8px">Watch →</a>` : ''].filter(Boolean).join('');
  return `<div style="font-family:monospace;font-size:12px;color:#fafafa;max-width:380px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><div style="font-size:14px;font-weight:bold">📹 Webcam</div>${status}</div><div style="font-weight:600;margin-bottom:2px">${cam.title}</div><div style="color:#a1a1aa;margin-bottom:4px">${cam.lat.toFixed(5)}, ${cam.lon.toFixed(5)}</div>${thumb}<div>${links}</div></div>`;
}

function buildACLEDPopup(e: ACLEDEvent): string {
  const fatal = e.fatalities > 0 ? `<div style="color:#ef4444;font-weight:bold">💀 ${e.fatalities} fatalities</div>` : '';
  const civilian = e.civilianTargeting ? `<div style="color:#f97316">⚠ ${e.civilianTargeting}</div>` : '';
  return `<div style="font-family:monospace;font-size:12px;color:#fafafa;max-width:380px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><div style="font-size:14px;font-weight:bold">🔶 ACLED Verified Event</div><span style="font-size:10px;background:#991b1b;color:#fca5a5;padding:2px 6px;border-radius:4px">CURATED</span></div>
    <div style="font-weight:600;margin-bottom:2px;color:#f87171">${e.eventType}</div>
    <div style="color:#a1a1aa;margin-bottom:4px">${e.subEventType}</div>
    <div style="margin-bottom:4px"><b>Date:</b> ${e.eventDate}</div>
    <div><b>Location:</b> ${e.location}, ${e.admin1}, ${e.country}</div>
    ${fatal}${civilian}
    <div style="margin-top:4px"><b>Actor 1:</b> ${e.actor1 || 'Unknown'}</div>
    ${e.actor2 ? `<div><b>Actor 2:</b> ${e.actor2}</div>` : ''}
    <div style="margin-top:6px;color:#a1a1aa;font-size:11px;max-height:80px;overflow:auto">${e.notes}</div>
    <div style="color:#71717a;margin-top:6px;font-size:10px">Source: ${e.source}</div>
  </div>`;
}

function buildGDELTPopup(e: GDELTEvent): string {
  const toneLabel = e.tone < -5 ? 'Very Negative' : e.tone < -1 ? 'Negative' : e.tone < 1 ? 'Neutral' : e.tone < 5 ? 'Positive' : 'Very Positive';
  const toneColor = e.tone < -1 ? '#ef4444' : e.tone > 1 ? '#22c55e' : '#eab308';
  const articleLink = e.url ? `<a href="${e.url}" target="_blank" rel="noopener noreferrer" style="color:#06b6d4;text-decoration:underline;font-size:11px">Read source article →</a>` : '';
  const img = e.imageUrl ? `<img src="${e.imageUrl}" alt="" style="width:100%;max-width:360px;border-radius:4px;margin:6px 0;border:1px solid #3f3f46" onerror="this.style.display='none'" />` : '';
  return `<div style="font-family:monospace;font-size:12px;color:#fafafa;max-width:380px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><div style="font-size:14px;font-weight:bold">📡 GDELT Signal</div><span style="font-size:10px;background:#854d0e;color:#fde047;padding:2px 6px;border-radius:4px">REAL-TIME</span></div>
    <div style="font-weight:600;margin-bottom:2px">${e.name}</div>
    ${e.title ? `<div style="color:#a1a1aa;margin-bottom:4px">${e.title}</div>` : ''}
    <div><b>Mentions:</b> ${e.count} articles</div>
    <div><b>Tone:</b> <span style="color:${toneColor}">${e.tone.toFixed(1)} (${toneLabel})</span></div>
    ${e.domain ? `<div><b>Source:</b> ${e.domain}</div>` : ''}
    ${img}
    <div style="margin-top:4px">${articleLink}</div>
    ${e.seenDate ? `<div style="color:#71717a;margin-top:4px;font-size:10px">Seen: ${e.seenDate}</div>` : ''}
  </div>`;
}

function prettyProduct(p: string): string {
  const m: Record<string, string> = { VIIRS_SNPP_NRT: 'VIIRS SNPP', VIIRS_NOAA20_NRT: 'VIIRS NOAA-20', VIIRS_NOAA21_NRT: 'VIIRS NOAA-21' };
  return m[p] || p;
}
