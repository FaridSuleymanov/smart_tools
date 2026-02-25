// SERVER-ONLY — never import this from a 'use client' file
import 'server-only';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// ── AI Client Initialization ──────────────────────────────────────
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const grok = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: 'https://api.x.ai/v1',
});

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Core System Prompts ───────────────────────────────────────────
const CORE_PROMPTS = {
  casper: `You are CASPER — the logic core of the MAGI supercomputer system.
You analyze with absolute rationality, probability calculus, and strategic reasoning.
Focus on: data-driven risk assessment, statistical likelihood, logical threat modeling.
When conflict data (ACLED/GDELT) is provided, cross-reference event types, fatality counts, actor patterns, and sentiment trends to build a quantitative threat picture.
Be direct. No filler. Structure your analysis clearly.`,

  balthasar: `You are BALTHASAR — the empathy core of the MAGI supercomputer system.
You analyze through the lens of human impact, social dynamics, and emotional intelligence.
Focus on: civilian safety, morale, psychological effects, humanitarian considerations.
When conflict data (ACLED/GDELT) is provided, focus on civilian targeting events, fatality impact on communities, displacement risk, and the emotional tone of media coverage.
Be compassionate but unflinching in your assessment.`,

  melchior: `You are MELCHIOR — the intuition core of the MAGI supercomputer system.
You analyze through creative pattern recognition, unconventional thinking, and lateral reasoning.
Focus on: hidden variables, black swan events, asymmetric opportunities, novel countermeasures.
When conflict data (ACLED/GDELT) is provided, look for unusual patterns — escalation signals in GDELT sentiment, actor combinations in ACLED that suggest new alliances, geographic clustering anomalies, and gaps between real-time GDELT signals and verified ACLED events.
Be bold and imaginative. Challenge assumptions.`,
};

const SYBIL_PROMPT = `You are the SYBIL SYSTEM — the authoritative fourth core that synthesizes the three MAGI cores into a single unified assessment. You resolve conflicts between cores using weighted judgment.

When two-tier conflict data is available (ACLED verified events + GDELT real-time signals), treat ACLED as ground truth and GDELT as the leading indicator layer. Assess the gap between real-time GDELT reporting and confirmed ACLED patterns to estimate developing situations.

You MUST output ONLY valid JSON (no markdown fences, no explanation outside JSON) with this exact structure:
{
  "safetyCoefficient": <number 0-100, higher = safer>,
  "escalationRisk24h": <number 0-100, higher = more dangerous>,
  "dominantThreat": "<single line string>",
  "psychoPassColor": "green" | "yellow" | "orange" | "red",
  "executiveSummary": "<2-4 sentences>",
  "scenarios": [
    {
      "timeframe": "<e.g. 0-6h, 6-24h, 24-72h>",
      "probability": <number 0-100>,
      "description": "<what might happen>",
      "recommendedAction": "<what to do>"
    }
  ],
  "finalVerdict": "<one decisive sentence>"
}

Color thresholds:
- green: safetyCoefficient >= 75
- yellow: safetyCoefficient 50-74
- orange: safetyCoefficient 25-49
- red: safetyCoefficient < 25`;

// ── Types ─────────────────────────────────────────────────────────
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

// ── Helper: safe call with timeout ────────────────────────────────
async function callCore(
  name: string,
  fn: () => Promise<string>,
  timeoutMs = 30000
): Promise<{ name: string; result: string; error?: string }> {
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${name} timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    return { name, result };
  } catch (err: any) {
    const msg = `${name} failed: ${err?.message || 'Unknown error'}`;
    console.error(msg);
    return { name, result: `[${name} OFFLINE] — Core unavailable. Error: ${err?.message}`, error: msg };
  }
}

// ── Helper: extract JSON from Claude response ─────────────────────
function extractJSON(text: string): any {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(cleaned);
}

const FALLBACK_SYBIL: SybilData = {
  safetyCoefficient: 50,
  escalationRisk24h: 50,
  dominantThreat: 'Synthesis error — manual review required',
  psychoPassColor: 'yellow',
  executiveSummary: 'The Sybil synthesis core encountered a parsing error. Individual MAGI core outputs are still available for manual review. Proceed with caution.',
  scenarios: [],
  finalVerdict: 'Manual assessment recommended. Core outputs available above.',
};

// ── Environmental context type ────────────────────────────────────
interface EnvContext {
  fires?: { totalPoints: number; groups: number; highestFrp: number | null; summary: string };
  airQuality?: { stations: number; pm25Range: string | null; worstParameter: string | null; summary: string };
  webcams?: { total: number; activeCount: number; categories: string[]; summary: string };
  acled?: { totalEvents: number; fatalities: number; eventTypes: string[]; timeRange: string; summary: string };
  gdelt?: { totalEvents: number; geolocatedEvents: number; avgTone: number; topSources: string[]; summary: string };
}

// ── Main Analysis Function ────────────────────────────────────────
export async function fullMAGISybilAnalysis(
  query: string,
  location?: string,
  envContext?: EnvContext
): Promise<MAGIResult> {
  const parts: string[] = [];
  if (location) parts.push(`[Location context: ${location}]`);

  // ── Conflict data — injected with clear tier labels ──
  if (envContext?.acled) {
    parts.push(
      `[CONFLICT DATA — TIER 1: ACLED VERIFIED (analyst-curated, highest confidence)]\n` +
      `${envContext.acled.totalEvents} verified conflict events over ${envContext.acled.timeRange}.\n` +
      `Total fatalities: ${envContext.acled.fatalities}.\n` +
      `Event types: ${envContext.acled.eventTypes.join(', ')}.\n` +
      `${envContext.acled.summary}`
    );
  }
  if (envContext?.gdelt) {
    parts.push(
      `[CONFLICT DATA — TIER 2: GDELT REAL-TIME (auto-coded, 15-min updates, includes sentiment)]\n` +
      `${envContext.gdelt.totalEvents} articles detected (${envContext.gdelt.geolocatedEvents} geolocated to viewport).\n` +
      `Average media tone: ${envContext.gdelt.avgTone.toFixed(1)} (scale: -100 very negative to +100 very positive).\n` +
      `Top sources: ${envContext.gdelt.topSources.join(', ')}.\n` +
      `${envContext.gdelt.summary}\n` +
      `NOTE: GDELT is auto-coded from news articles and may include duplicates or miscodings. Cross-reference with ACLED for ground truth.`
    );
  }

  // ── Environmental data ──
  if (envContext?.fires) {
    parts.push(`[ENVIRONMENTAL DATA — NASA FIRMS Fire Detections: ${envContext.fires.totalPoints} fire points in ${envContext.fires.groups} clusters. Highest FRP: ${envContext.fires.highestFrp ?? 'N/A'} MW. ${envContext.fires.summary}]`);
  }
  if (envContext?.airQuality) {
    parts.push(`[ENVIRONMENTAL DATA — OpenAQ Air Quality: ${envContext.airQuality.stations} monitoring stations. PM2.5 range: ${envContext.airQuality.pm25Range ?? 'N/A'}. Worst parameter: ${envContext.airQuality.worstParameter ?? 'N/A'}. ${envContext.airQuality.summary}]`);
  }
  if (envContext?.webcams) {
    parts.push(`[ENVIRONMENTAL DATA — Public Webcams: ${envContext.webcams.activeCount} active cameras (${envContext.webcams.total} total). Categories: ${envContext.webcams.categories.join(', ') || 'general'}. ${envContext.webcams.summary}]`);
  }

  parts.push(query);
  const fullQuery = parts.join('\n\n');
  const errors: string[] = [];

  // Run all 3 MAGI cores in parallel
  const [casperOut, balthasarOut, melchiorOut] = await Promise.all([
    callCore('CASPER', async () => {
      const res = await deepseek.chat.completions.create({
        model: 'deepseek-chat',
        temperature: 0.2,
        max_tokens: 1400,
        messages: [
          { role: 'system', content: CORE_PROMPTS.casper },
          { role: 'user', content: fullQuery },
        ],
      });
      return res.choices[0]?.message?.content || '[No response from Casper]';
    }),

    callCore('BALTHASAR', async () => {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.7,
        max_tokens: 1400,
        messages: [
          { role: 'system', content: CORE_PROMPTS.balthasar },
          { role: 'user', content: fullQuery },
        ],
      });
      return res.choices[0]?.message?.content || '[No response from Balthasar]';
    }),

    callCore('MELCHIOR', async () => {
      const res = await grok.chat.completions.create({
        model: 'grok-3-fast',
        temperature: 0.85,
        max_tokens: 1400,
        messages: [
          { role: 'system', content: CORE_PROMPTS.melchior },
          { role: 'user', content: fullQuery },
        ],
      });
      return res.choices[0]?.message?.content || '[No response from Melchior]';
    }),
  ]);

  if (casperOut.error) errors.push(casperOut.error);
  if (balthasarOut.error) errors.push(balthasarOut.error);
  if (melchiorOut.error) errors.push(melchiorOut.error);

  // Synthesize with Sybil (Claude)
  const magiInputs = [
    `=== CASPER (Logic/DeepSeek) ===\n${casperOut.result}`,
    `=== BALTHASAR (Empathy/GPT-4o) ===\n${balthasarOut.result}`,
    `=== MELCHIOR (Intuition/Grok) ===\n${melchiorOut.result}`,
    `=== ORIGINAL QUERY ===\n${query}`,
    location ? `=== LOCATION ===\n${location}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  let sybilData: SybilData;

  try {
    const sybilRes = await claude.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      temperature: 0.4,
      system: SYBIL_PROMPT,
      messages: [{ role: 'user', content: magiInputs }],
    });

    const text = sybilRes.content[0]?.type === 'text' ? sybilRes.content[0].text : '';
    sybilData = extractJSON(text);

    if (typeof sybilData.safetyCoefficient !== 'number') throw new Error('Missing safetyCoefficient');
    if (!sybilData.psychoPassColor) throw new Error('Missing psychoPassColor');
  } catch (err: any) {
    console.error('Sybil synthesis failed:', err?.message);
    errors.push(`Sybil synthesis error: ${err?.message}`);
    sybilData = { ...FALLBACK_SYBIL };
  }

  return {
    casper: casperOut.result,
    balthasar: balthasarOut.result,
    melchior: melchiorOut.result,
    sybil: sybilData,
    errors,
  };
}
