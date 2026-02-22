// ── Sybil / MAGI ──────────────────────────────────────────────────

export interface SybilData {
  safetyCoefficient: number;
  escalationRisk24h: number;
  dominantThreat: string;
  psychoPassColor: 'green' | 'yellow' | 'orange' | 'red';
  executiveSummary: string;
  scenarios: {
    timeframe: string;
    probability: number;
    description: string;
    recommendedAction: string;
  }[];
  finalVerdict: string;
}

export interface MAGIResult {
  casper: string;
  balthasar: string;
  melchior: string;
  sybil: SybilData;
  errors: string[];
}

// ── FIRMS (NASA Fire Data) ────────────────────────────────────────

export interface FirePoint {
  lat: number;
  lon: number;
  acqDate: string;
  acqTime: string;
  confidence: number;
  confidenceRaw: string | null;
  frp: number | null;
  product: string;
  brightness?: number;
}

export interface FireGroup {
  lat: number;
  lon: number;
  count: number;
  points: FirePoint[];
  maxFrp: number | null;
  firstSeen: string;
  lastSeen: string;
  products: string[];
}

export interface FIRMSResponse {
  fires: FireGroup[];
  totalPoints: number;
  products: string[];
  error?: string;
}

// ── OpenAQ (Air Quality) ──────────────────────────────────────────

export interface AirQReading {
  parameter: string;
  value: number;
  unit: string;
  lastUpdated: string;
}

export interface AirQStation {
  id: number;
  name: string;
  lat: number;
  lon: number;
  readings: AirQReading[];
  primaryValue: number | null;
  primaryParam: string | null;
}

export interface OpenAQResponse {
  stations: AirQStation[];
  totalStations: number;
  error?: string;
}

// ── Threat Sightings (Supabase) ───────────────────────────────────

export interface ThreatSighting {
  id?: number;
  lat: number;
  lng: number;
  user_id: string;
  timestamp?: string;
}

// ── History ───────────────────────────────────────────────────────

export interface HistoryEntry {
  timestamp: number;
  query: string;
  location: string;
  result: MAGIResult;
}

// ── Environmental Context (fed to MAGI) ───────────────────────────

export interface EnvironmentalContext {
  fires?: {
    totalPoints: number;
    groups: number;
    highestFrp: number | null;
    summary: string;
  };
  airQuality?: {
    stations: number;
    pm25Range: string | null;
    worstParameter: string | null;
    summary: string;
  };
}
