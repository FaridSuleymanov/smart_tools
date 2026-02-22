# MAGI + SYBIL v2.1

> **Neon Genesis Evangelion × Psycho-Pass** — Multi-Agent Decision Engine  
> Now with **NASA FIRMS fire detection** and **OpenAQ air quality** environmental intelligence.

## Architecture

```
     ┌─────────┐  ┌──────────┐  ┌──────────┐
     │ CASPER   │  │BALTHASAR │  │ MELCHIOR │
     │(DeepSeek)│  │ (GPT-4o) │  │  (Grok)  │
     │  Logic   │  │  Empathy │  │ Intuition│
     └────┬─────┘  └────┬─────┘  └────┬─────┘
          │              │              │
          └──────────────┼──────────────┘
                         │
  ┌──────────────────────┼──────────────────────┐
  │                      ▼                      │
  │            ┌─────────────────┐              │
  │            │  SYBIL SYSTEM   │              │
  │            │ (Claude Sonnet) │              │
  │            │   Synthesis     │              │
  │            └────────┬────────┘              │
  │                     │                       │
  │  ┌──────────────────┼──────────────────┐    │
  │  │         Environmental Context       │    │
  │  │  🔥 NASA FIRMS  │  🌬 OpenAQ      │    │
  │  │  Fire Detections │  Air Quality     │    │
  │  │  ⚠ Live Threats │  📍 ORS Routes  │    │
  │  └─────────────────────────────────────┘    │
  └─────────────────────────────────────────────┘
                        ▼
               Unified Assessment
```

## Data Sources

| Source | What it provides | API Key |
|--------|-----------------|---------|
| **NASA FIRMS** | Near real-time fire detections from VIIRS (SNPP, NOAA-20, NOAA-21) satellites. Fire Radiative Power (FRP), confidence, coordinates, time. | Free — [firms.modaps.eosdis.nasa.gov/api/map_key](https://firms.modaps.eosdis.nasa.gov/api/map_key/) |
| **OpenAQ v3** | Air quality readings (PM2.5, PM10, NO2, O3, SO2, CO) from government and research monitoring stations worldwide. | Free — [docs.openaq.org](https://docs.openaq.org) |
| **Supabase** | Shared live threat sightings between users via real-time database. | Free tier — [supabase.com](https://supabase.com) |
| **OpenRouteService** | Driving route simulation for enemy advance visualization. | Free — [openrouteservice.org](https://openrouteservice.org/dev/#/signup) |
| **MapTiler** | Dark-themed vector map tiles. | Free tier — [cloud.maptiler.com](https://cloud.maptiler.com) |

## How Environmental Data Feeds Into MAGI

When you load FIRMS or OpenAQ data on the Map tab, that data is summarized and injected into the MAGI analysis as **environmental context**. The four AI cores receive:

- Total fire detections and cluster count
- Highest Fire Radiative Power (FRP) value
- Number of high-confidence fire clusters
- Number of AQ monitoring stations
- PM2.5 range and average
- Worst pollutant reading

This gives the cores real situational awareness — Casper can assess fire spread risk statistically, Balthasar evaluates civilian health impact from air quality, Melchior spots patterns in fire+AQ combinations, and Sybil synthesizes everything into actionable intelligence.

## Quick Start

### 1. Create project & install

```bash
npx create-next-app@latest magi-sybil --typescript --tailwind --eslint --app --yes
cd magi-sybil
# Copy all project files in, overwriting defaults
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
# Edit .env.local with your keys
```

All API keys needed:

| Key | Required? |
|-----|-----------|
| `DEEPSEEK_API_KEY` | Yes (Casper core) |
| `OPENAI_API_KEY` | Yes (Balthasar core) |
| `GROK_API_KEY` | Yes (Melchior core) |
| `ANTHROPIC_API_KEY` | Yes (Sybil synthesis) |
| `FIRMS_MAP_KEY` | For fire data |
| `OPENAQ_API_KEY` | For air quality |
| `NEXT_PUBLIC_MAPTILER_KEY` | For maps |
| `ORS_API_KEY` | For route simulation |
| `NEXT_PUBLIC_SUPABASE_URL` | For shared threats |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | For shared threats |

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Usage Workflow

1. **Map tab** → Pan to your area of interest
2. **Click "FIRMS Fires"** → Loads fire detections in current viewport (last 3 days)
3. **Click "Air Quality"** → Loads OpenAQ stations in current viewport
4. **Click fire/AQ dots** on map for detailed popups
5. **Switch to Advisor tab** → Notice "Environmental Data Loaded" indicator
6. **Type your scenario** → The MAGI cores now have fire + AQ context
7. **Activate** → Get analysis informed by real environmental data

## Project Structure

```
magi-sybil/
├── app/
│   ├── api/
│   │   ├── analyze/route.ts    ← MAGI + Sybil (4 AI cores)
│   │   ├── firms/route.ts      ← NASA FIRMS proxy (fire data)
│   │   ├── openaq/route.ts     ← OpenAQ v3 proxy (air quality)
│   │   └── route/route.ts      ← ORS routing proxy
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                 ← Main app (all tabs)
├── components/
│   ├── ui/{badge,button,card,textarea}.tsx
│   ├── CoreCard.tsx
│   ├── LoadingSpinner.tsx
│   ├── SybilPanel.tsx
│   └── ThreatMap.tsx            ← Map with fire/AQ/threat overlays
├── lib/
│   ├── ai-cores.ts              ← Server-only AI orchestration
│   ├── supabase.ts
│   └── types.ts                 ← All TypeScript interfaces
├── public/manifest.json
└── .env.local.example
```

## API Notes

### FIRMS
- Endpoint: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{KEY}/{PRODUCT}/{bbox}/{days}`
- Products: `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`
- Returns CSV with: latitude, longitude, acq_date, acq_time, confidence, frp, brightness
- Rate limit: 5000 transactions per 10-minute window
- Points grouped by ~10m proximity buckets (matching your Processing code logic)

### OpenAQ v3
- Step 1: `GET /v3/locations?bbox={bbox}&limit=50` → get station IDs
- Step 2: `GET /v3/locations/{id}/latest` → get latest sensor readings
- Fallback: `GET /v3/locations/{id}/sensors` → get sensor data with latest values
- Header: `X-API-Key: {key}`
- v1/v2 endpoints retired January 31, 2025

## Supabase Setup (optional)

```sql
CREATE TABLE threat_sightings (
  id SERIAL PRIMARY KEY,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  user_id TEXT DEFAULT 'anonymous',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

ALTER PUBLICATION supabase_realtime ADD TABLE threat_sightings;

ALTER TABLE threat_sightings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public insert" ON threat_sightings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select" ON threat_sightings FOR SELECT USING (true);
```
