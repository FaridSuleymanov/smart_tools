'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import CoreCard from '@/components/CoreCard';
import SybilPanel from '@/components/SybilPanel';
import LoadingSpinner from '@/components/LoadingSpinner';
import {
  Mic, Volume2, Users, AlertTriangle, History, Zap,
  Flame, Wind, RefreshCw, MapPin, Video,
} from 'lucide-react';
import type {
  MAGIResult, ThreatSighting, HistoryEntry,
  FireGroup, FIRMSResponse, AirQStation, OpenAQResponse,
  WebcamData, WebcamsResponse,
  EnvironmentalContext,
} from '@/lib/types';

const ThreatMap = dynamic(() => import('@/components/ThreatMap'), { ssr: false });

// ── Simple Tabs ───────────────────────────────────────────────────
function Tabs({
  tabs, active, onChange,
}: {
  tabs: { id: string; label: string; icon: React.ReactNode }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
            active === t.id
              ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-600/30'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          {t.icon}
          <span className="hidden sm:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── History helpers ───────────────────────────────────────────────
const HISTORY_KEY = 'magi-sybil-history-v2';
const MAX_HISTORY = 30;

function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch { localStorage.removeItem(HISTORY_KEY); }
}

// ── Environmental summary builder ─────────────────────────────────
function buildEnvContext(
  fires: FireGroup[],
  totalFirePts: number,
  airStations: AirQStation[],
  webcams: WebcamData[],
): EnvironmentalContext {
  const ctx: EnvironmentalContext = {};

  if (fires.length > 0) {
    const maxFrp = fires.reduce((mx, g) =>
      g.maxFrp !== null && (mx === null || g.maxFrp > mx) ? g.maxFrp : mx,
      null as number | null
    );
    const highConf = fires.filter((g) =>
      g.points.some((p) => p.confidence >= 80 || p.confidenceRaw === 'h')
    ).length;

    ctx.fires = {
      totalPoints: totalFirePts,
      groups: fires.length,
      highestFrp: maxFrp,
      summary: `${highConf} high-confidence clusters detected. Products: ${
        [...new Set(fires.flatMap((g) => g.products))].join(', ')
      }.`,
    };
  }

  if (airStations.length > 0) {
    const pm25s = airStations
      .filter((s) => s.primaryParam === 'pm25' && s.primaryValue !== null)
      .map((s) => s.primaryValue!);

    const pm25Range = pm25s.length > 0
      ? `${Math.min(...pm25s).toFixed(1)}–${Math.max(...pm25s).toFixed(1)} µg/m³`
      : null;

    let worstParam: string | null = null;
    let worstVal = 0;
    for (const s of airStations) {
      for (const r of s.readings) {
        if (r.value > worstVal) {
          worstVal = r.value;
          worstParam = `${r.parameter.toUpperCase()} ${r.value.toFixed(1)} ${r.unit}`;
        }
      }
    }

    ctx.airQuality = {
      stations: airStations.length,
      pm25Range,
      worstParameter: worstParam,
      summary: `${airStations.length} monitoring stations in viewport. ${
        pm25s.length > 0
          ? `Average PM2.5: ${(pm25s.reduce((a, b) => a + b, 0) / pm25s.length).toFixed(1)} µg/m³.`
          : 'No PM2.5 data available.'
      }`,
    };
  }

  if (webcams.length > 0) {
    const activeCount = webcams.filter((c) => c.status === 'active').length;
    const categories = [...new Set(webcams.map((c) => c.category).filter(Boolean))];

    ctx.webcams = {
      total: webcams.length,
      activeCount,
      categories,
      summary: `${activeCount} active public webcams in viewport (${webcams.length} total). Categories: ${
        categories.length > 0 ? categories.slice(0, 5).join(', ') : 'general'
      }. These can be used for visual ground-truth verification of conditions.`,
    };
  }

  return ctx;
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function MAGISybil() {
  // ── State ────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('Warsaw, Poland');
  const [results, setResults] = useState<MAGIResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('advisor');

  // Map
  const [mapCenter, setMapCenter] = useState({ lat: 52.2297, lng: 21.0122 });
  const [isListening, setIsListening] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Supabase threats
  const [threats, setThreats] = useState<ThreatSighting[]>([]);

  // FIRMS fires
  const [fires, setFires] = useState<FireGroup[]>([]);
  const [totalFirePts, setTotalFirePts] = useState(0);
  const [showFires, setShowFires] = useState(false);
  const [firesLoading, setFiresLoading] = useState(false);

  // OpenAQ air quality
  const [airStations, setAirStations] = useState<AirQStation[]>([]);
  const [showAirQ, setShowAirQ] = useState(false);
  const [aqLoading, setAqLoading] = useState(false);

  // Webcams
  const [webcams, setWebcams] = useState<WebcamData[]>([]);
  const [showWebcams, setShowWebcams] = useState(false);
  const [webcamsLoading, setWebcamsLoading] = useState(false);

  // ── Init ─────────────────────────────────────────────────────────
  useEffect(() => { setHistory(loadHistory()); }, []);

  // Supabase realtime
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('threat_sightings')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(100)
      .then(({ data }) => { if (data) setThreats(data); });

    const channel = supabase
      .channel('threat-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'threat_sightings' },
        (payload) => setThreats((prev) => [payload.new as ThreatSighting, ...prev]))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Get map viewport bounds ──────────────────────────────────────
  const getMapBounds = useCallback(() => {
    const mapEl = document.querySelector('[class*="maplibregl"]')?.parentElement;
    const fn = (mapEl as any)?.__getBounds;
    if (fn) return fn();
    return {
      south: mapCenter.lat - 0.15,
      west: mapCenter.lng - 0.25,
      north: mapCenter.lat + 0.15,
      east: mapCenter.lng + 0.25,
    };
  }, [mapCenter]);

  // ── Fetch FIRMS fire data ────────────────────────────────────────
  const fetchFires = useCallback(async () => {
    setFiresLoading(true);
    setError(null);
    try {
      const bounds = getMapBounds();
      const res = await fetch('/api/firms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bounds),
      });
      const data: FIRMSResponse = await res.json();
      if (data.error) setError(`FIRMS: ${data.error}`);
      setFires(data.fires || []);
      setTotalFirePts(data.totalPoints || 0);
      setShowFires(true);
    } catch (err: any) {
      setError(`FIRMS fetch failed: ${err?.message}`);
    } finally {
      setFiresLoading(false);
    }
  }, [getMapBounds]);

  // ── Fetch OpenAQ air quality ─────────────────────────────────────
  const fetchAirQ = useCallback(async () => {
    setAqLoading(true);
    setError(null);
    try {
      const bounds = getMapBounds();
      const res = await fetch('/api/openaq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bounds),
      });
      const data: OpenAQResponse = await res.json();
      if (data.error) setError(`OpenAQ: ${data.error}`);
      setAirStations(data.stations || []);
      setShowAirQ(true);
    } catch (err: any) {
      setError(`OpenAQ fetch failed: ${err?.message}`);
    } finally {
      setAqLoading(false);
    }
  }, [getMapBounds]);

  // ── Fetch Webcams ────────────────────────────────────────────────
  const fetchWebcams = useCallback(async () => {
    setWebcamsLoading(true);
    setError(null);
    try {
      const bounds = getMapBounds();
      const res = await fetch('/api/webcams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bounds),
      });
      const data: WebcamsResponse = await res.json();
      if (data.error) setError(`Webcams: ${data.error}`);
      setWebcams(data.webcams || []);
      setShowWebcams(true);
    } catch (err: any) {
      setError(`Webcams fetch failed: ${err?.message}`);
    } finally {
      setWebcamsLoading(false);
    }
  }, [getMapBounds]);

  // ── Run MAGI + Sybil analysis ────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError('Enter a query before activating.');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    const envContext = buildEnvContext(fires, totalFirePts, airStations, webcams);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed, location, envContext }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${res.status}`);
      }

      const data: MAGIResult = await res.json();
      setResults(data);

      const entry: HistoryEntry = { timestamp: Date.now(), query: trimmed, location, result: data };
      const newHist = [entry, ...history];
      setHistory(newHist);
      saveHistory(newHist);
    } catch (err: any) {
      setError(err?.message || 'Analysis failed.');
    } finally {
      setLoading(false);
    }
  }, [query, location, history, fires, totalFirePts, airStations, webcams]);

  // ── Voice ────────────────────────────────────────────────────────
  const startVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError('Speech recognition not supported. Try Chrome.'); return; }
    const r = new SR();
    r.lang = 'en-US';
    r.interimResults = false;
    r.onresult = (e: any) => setQuery((prev) => (prev ? prev + ' ' + e.results[0][0].transcript : e.results[0][0].transcript));
    r.onerror = () => setIsListening(false);
    r.onend = () => setIsListening(false);
    r.start();
    setIsListening(true);
  }, []);

  const speakVerdict = useCallback(() => {
    if (!results?.sybil?.finalVerdict) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(`Sybil System verdict: ${results.sybil.finalVerdict}`);
    u.rate = 0.9;
    speechSynthesis.speak(u);
  }, [results]);

  // ── Share threat ─────────────────────────────────────────────────
  const shareThreat = useCallback(async () => {
    if (!supabase) { setError('Supabase not configured.'); return; }
    const { error: e } = await supabase.from('threat_sightings').insert({
      lat: mapCenter.lat, lng: mapCenter.lng, user_id: 'anonymous',
    });
    if (e) setError('Share failed: ' + e.message);
  }, [mapCenter]);

  const restoreHistory = useCallback((entry: HistoryEntry) => {
    setResults(entry.result);
    setQuery(entry.query);
    setLocation(entry.location);
    setActiveTab('advisor');
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  const hasEnvData = fires.length > 0 || airStations.length > 0 || webcams.length > 0;

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-6">
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-glow-cyan">
            MAGI + SYBIL
          </h1>
          <p className="text-zinc-500 text-sm font-mono mt-1">
            v2.2 — FIRMS • OpenAQ • Webcams • Multi-Agent Analysis • Live Threats
          </p>
          {results?.errors && results.errors.length > 0 && (
            <div className="mt-3 flex items-start gap-2 text-yellow-500 text-xs font-mono bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>{results.errors.map((e, i) => <div key={i}>{e}</div>)}</div>
            </div>
          )}
        </header>

        {/* Tabs */}
        <Tabs
          tabs={[
            { id: 'advisor', label: 'Advisor', icon: <Zap className="w-4 h-4" /> },
            { id: 'maps', label: 'Map + Data', icon: <MapPin className="w-4 h-4" /> },
            { id: 'history', label: 'History', icon: <History className="w-4 h-4" /> },
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-center gap-2 bg-red-900/20 border border-red-700/40 text-red-400 text-sm rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-300 text-xs">dismiss</button>
          </div>
        )}

        {/* ═══════ ADVISOR TAB ═══════ */}
        {activeTab === 'advisor' && (
          <div className="mt-6 grid lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex gap-2">
                <Button onClick={startVoice} variant={isListening ? 'destructive' : 'outline'} className="flex-1">
                  <Mic className="w-4 h-4 mr-1.5" />{isListening ? 'Listening…' : 'Voice'}
                </Button>
                <Button onClick={speakVerdict} variant="outline" disabled={!results?.sybil} className="flex-1">
                  <Volume2 className="w-4 h-4 mr-1.5" />Verdict
                </Button>
              </div>

              <Textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Describe the situation, threat, or scenario to analyze…"
                className="min-h-[160px] font-mono text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runAnalysis(); }}
              />

              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full p-3 bg-zinc-900/80 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-colors"
                placeholder="Location context (optional)"
              />

              {/* Environmental context indicator */}
              {hasEnvData && (
                <Card className="p-3 border-cyan-800/40">
                  <div className="text-[10px] font-mono text-cyan-500 uppercase tracking-widest mb-2">
                    Environmental Data Loaded
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {fires.length > 0 && (
                      <span className="bg-orange-900/30 text-orange-400 px-2 py-1 rounded font-mono">
                        🔥 {totalFirePts} fire pts / {fires.length} clusters
                      </span>
                    )}
                    {airStations.length > 0 && (
                      <span className="bg-blue-900/30 text-blue-400 px-2 py-1 rounded font-mono">
                        🌬 {airStations.length} AQ stations
                      </span>
                    )}
                    {webcams.length > 0 && (
                      <span className="bg-violet-900/30 text-violet-400 px-2 py-1 rounded font-mono">
                        📹 {webcams.filter(c => c.status === 'active').length} live cameras
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1">
                    This data will be included in the MAGI analysis as environmental context.
                  </p>
                </Card>
              )}

              <Button onClick={runAnalysis} disabled={loading || !query.trim()} size="lg" className="w-full font-display tracking-wider">
                {loading ? 'PROCESSING…' : '⚡ ACTIVATE FULL SYSTEM'}
              </Button>
              <p className="text-[10px] text-zinc-600 font-mono text-center">Ctrl+Enter to submit • Load FIRMS/OpenAQ/Webcam data from Map tab first for richer analysis</p>
            </div>

            <div className="lg:col-span-3 space-y-4">
              {loading && <LoadingSpinner />}
              {!loading && results && (
                <>
                  <div className="space-y-3">
                    <CoreCard name="CASPER" model="DeepSeek" content={results.casper} color="border-blue-500" icon="🧊" />
                    <CoreCard name="BALTHASAR" model="GPT-4o" content={results.balthasar} color="border-emerald-500" icon="💚" />
                    <CoreCard name="MELCHIOR" model="Grok" content={results.melchior} color="border-purple-500" icon="🔮" />
                  </div>
                  <SybilPanel data={results.sybil} />
                </>
              )}
              {!loading && !results && (
                <Card className="p-12 flex flex-col items-center justify-center text-center">
                  <div className="text-5xl mb-4 opacity-30">⬡</div>
                  <p className="text-zinc-500 text-sm font-mono">MAGI SYSTEM IDLE</p>
                  <p className="text-zinc-600 text-xs mt-1">Enter a query and activate to begin</p>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ═══════ MAP + DATA TAB ═══════ */}
        {activeTab === 'maps' && (
          <div className="mt-6 grid lg:grid-cols-3 gap-6">
            {/* Map */}
            <div className="lg:col-span-2 h-[600px] md:h-[700px] border border-zinc-700 rounded-xl overflow-hidden" ref={mapContainerRef}>
              <ThreatMap
                center={mapCenter}
                onCenterChange={setMapCenter}
                threats={threats}
                fires={fires}
                airStations={airStations}
                webcams={webcams}
                showFires={showFires}
                showAirQ={showAirQ}
                showWebcams={showWebcams}
              />
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <Card className="p-4">
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">Map Center</div>
                <div className="font-mono text-sm">{mapCenter.lat.toFixed(4)}, {mapCenter.lng.toFixed(4)}</div>
              </Card>

              {/* Data layer controls */}
              <Card className="p-4 space-y-3">
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Data Layers</div>

                <div className="flex gap-2">
                  <Button
                    onClick={fetchFires}
                    disabled={firesLoading}
                    variant={showFires ? 'default' : 'outline'}
                    className="flex-1 text-xs"
                  >
                    {firesLoading ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Flame className="w-3.5 h-3.5 mr-1.5" />}
                    FIRMS Fires
                  </Button>
                  <Button
                    onClick={fetchAirQ}
                    disabled={aqLoading}
                    variant={showAirQ ? 'default' : 'outline'}
                    className="flex-1 text-xs"
                  >
                    {aqLoading ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Wind className="w-3.5 h-3.5 mr-1.5" />}
                    Air Quality
                  </Button>
                </div>

                {/* Webcams button - full width row */}
                <Button
                  onClick={fetchWebcams}
                  disabled={webcamsLoading}
                  variant={showWebcams ? 'default' : 'outline'}
                  className="w-full text-xs"
                >
                  {webcamsLoading ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Video className="w-3.5 h-3.5 mr-1.5" />}
                  Public Webcams
                </Button>

                {/* Toggle visibility */}
                {(fires.length > 0 || airStations.length > 0 || webcams.length > 0) && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {fires.length > 0 && (
                      <button
                        onClick={() => setShowFires(!showFires)}
                        className={`flex-1 px-2 py-1.5 rounded font-mono transition-colors ${
                          showFires ? 'bg-orange-900/30 text-orange-400' : 'bg-zinc-800 text-zinc-500'
                        }`}
                      >
                        🔥 {showFires ? 'Hide' : 'Show'} ({fires.length})
                      </button>
                    )}
                    {airStations.length > 0 && (
                      <button
                        onClick={() => setShowAirQ(!showAirQ)}
                        className={`flex-1 px-2 py-1.5 rounded font-mono transition-colors ${
                          showAirQ ? 'bg-blue-900/30 text-blue-400' : 'bg-zinc-800 text-zinc-500'
                        }`}
                      >
                        🌬 {showAirQ ? 'Hide' : 'Show'} ({airStations.length})
                      </button>
                    )}
                    {webcams.length > 0 && (
                      <button
                        onClick={() => setShowWebcams(!showWebcams)}
                        className={`flex-1 px-2 py-1.5 rounded font-mono transition-colors ${
                          showWebcams ? 'bg-violet-900/30 text-violet-400' : 'bg-zinc-800 text-zinc-500'
                        }`}
                      >
                        📹 {showWebcams ? 'Hide' : 'Show'} ({webcams.length})
                      </button>
                    )}
                  </div>
                )}
              </Card>

              {/* Fire summary */}
              {fires.length > 0 && showFires && (
                <Card className="p-4">
                  <div className="text-[10px] font-mono text-orange-500 uppercase tracking-widest mb-2">
                    🔥 FIRMS — {totalFirePts} detections / {fires.length} clusters
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-auto text-xs font-mono">
                    {fires.slice(0, 15).map((g, i) => (
                      <div key={i} className="flex justify-between text-zinc-400">
                        <span>{g.lat.toFixed(3)}, {g.lon.toFixed(3)}</span>
                        <span className="text-orange-400">
                          {g.count}× {g.maxFrp !== null ? `FRP ${g.maxFrp.toFixed(0)}` : ''}
                        </span>
                      </div>
                    ))}
                    {fires.length > 15 && <div className="text-zinc-600">…and {fires.length - 15} more</div>}
                  </div>
                </Card>
              )}

              {/* AQ summary */}
              {airStations.length > 0 && showAirQ && (
                <Card className="p-4">
                  <div className="text-[10px] font-mono text-blue-500 uppercase tracking-widest mb-2">
                    🌬 OpenAQ — {airStations.length} stations
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-auto text-xs font-mono">
                    {airStations.slice(0, 15).map((s, i) => (
                      <div key={i} className="flex justify-between text-zinc-400">
                        <span className="truncate max-w-[140px]">{s.name}</span>
                        <span className={s.primaryParam === 'pm25' && s.primaryValue !== null && s.primaryValue > 50 ? 'text-red-400' : 'text-green-400'}>
                          {s.primaryParam?.toUpperCase()} {s.primaryValue?.toFixed(1) ?? '?'}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Webcam summary */}
              {webcams.length > 0 && showWebcams && (
                <Card className="p-4">
                  <div className="text-[10px] font-mono text-violet-500 uppercase tracking-widest mb-2">
                    📹 Webcams — {webcams.filter(c => c.status === 'active').length} active / {webcams.length} total
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-auto text-xs font-mono">
                    {webcams.slice(0, 15).map((cam, i) => (
                      <div key={i} className="flex justify-between text-zinc-400">
                        <span className="truncate max-w-[160px]">{cam.title}</span>
                        <span className={cam.status === 'active' ? 'text-green-400' : 'text-zinc-600'}>
                          {cam.status === 'active' ? '● LIVE' : '○ OFF'}
                        </span>
                      </div>
                    ))}
                    {webcams.length > 15 && <div className="text-zinc-600">…and {webcams.length - 15} more</div>}
                  </div>
                </Card>
              )}

              {/* Actions */}
              <Button onClick={runAnalysis} disabled={loading || !query.trim()} size="lg" className="w-full">
                <Zap className="w-4 h-4 mr-2" />Analyze with Map Data
              </Button>

              <Button onClick={shareThreat} variant="destructive" className="w-full">
                <Users className="w-4 h-4 mr-2" />Share Threat at Center
              </Button>

              {/* Threats list */}
              <Card className="p-4">
                <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">
                  Live Threats ({threats.length})
                </div>
                <div className="space-y-1 max-h-32 overflow-auto">
                  {threats.slice(0, 10).map((t, i) => (
                    <div key={t.id || i} className="text-xs font-mono text-zinc-400">
                      {t.lat.toFixed(4)}, {t.lng.toFixed(4)}
                      {t.timestamp && <span className="text-zinc-600 ml-2">{new Date(t.timestamp).toLocaleTimeString()}</span>}
                    </div>
                  ))}
                  {threats.length === 0 && <p className="text-xs text-zinc-600">No sightings</p>}
                </div>
              </Card>

              {results?.sybil && <SybilPanel data={results.sybil} />}
            </div>
          </div>
        )}

        {/* ═══════ HISTORY TAB ═══════ */}
        {activeTab === 'history' && (
          <div className="mt-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg font-bold tracking-wider">ANALYSIS HISTORY</h3>
                <span className="text-xs font-mono text-zinc-500">{history.length} / {MAX_HISTORY}</span>
              </div>
              {history.length === 0 ? (
                <p className="text-zinc-500 text-sm font-mono py-8 text-center">No analyses yet.</p>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-auto">
                  {history.map((h, i) => (
                    <button key={i} onClick={() => restoreHistory(h)} className="w-full text-left p-4 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition-colors group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono text-zinc-500">{new Date(h.timestamp).toLocaleString()}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          h.result.sybil.psychoPassColor === 'green' ? 'bg-emerald-900/50 text-emerald-400'
                            : h.result.sybil.psychoPassColor === 'yellow' ? 'bg-yellow-900/50 text-yellow-400'
                            : h.result.sybil.psychoPassColor === 'orange' ? 'bg-orange-900/50 text-orange-400'
                            : 'bg-red-900/50 text-red-400'
                        }`}>
                          {h.result.sybil.psychoPassColor.toUpperCase()} • {h.result.sybil.safetyCoefficient}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-300 truncate">{h.query}</p>
                      <p className="text-xs text-zinc-500 mt-1 truncate">{h.result.sybil.finalVerdict}</p>
                      <span className="text-[10px] text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity mt-1 inline-block">Click to restore →</span>
                    </button>
                  ))}
                </div>
              )}
              {history.length > 0 && (
                <button
                  onClick={() => { if (confirm('Clear all history?')) { setHistory([]); localStorage.removeItem(HISTORY_KEY); } }}
                  className="mt-4 text-xs text-red-500 hover:text-red-400 font-mono transition-colors"
                >Clear all history</button>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
