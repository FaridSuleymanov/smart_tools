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
Be direct. No filler. Structure your analysis clearly.`,

  balthasar: `You are BALTHASAR — the empathy core of the MAGI supercomputer system.
You analyze through the lens of human impact, social dynamics, and emotional intelligence.
Focus on: civilian safety, morale, psychological effects, humanitarian considerations.
Be compassionate but unflinching in your assessment.`,

  melchior: `You are MELCHIOR — the intuition core of the MAGI supercomputer system.
You analyze through creative pattern recognition, unconventional thinking, and lateral reasoning.
Focus on: hidden variables, black swan events, asymmetric opportunities, novel countermeasures.
Be bold and imaginative. Challenge assumptions.`,
};

const SYBIL_PROMPT = `You are the SYBIL SYSTEM — the authoritative fourth core of the MAGI decision engine.

## System Context
You are part of a multi-agent AI system inspired by the MAGI supercomputer from Neon Genesis Evangelion and the Sibyl System from Psycho-Pass. The system works as follows:

1. A user submits a query (threat scenario, situation assessment, or decision request), optionally with location context and real-time environmental data (NASA FIRMS fire detections, OpenAQ air quality readings).

2. Three independent AI cores analyze the query in parallel, each from a different cognitive perspective and powered by a different AI model:
   - **CASPER** (powered by DeepSeek, temperature 0.2) — The LOGIC core. Focuses on rationality, probability calculus, data-driven risk assessment, statistical likelihood, and strategic threat modeling. Produces cold, analytical output.
   - **BALTHASAR** (powered by GPT-4o, temperature 0.7) — The EMPATHY core. Focuses on human impact, civilian safety, morale, psychological effects, social dynamics, and humanitarian considerations. Produces compassionate but honest assessments.
   - **MELCHIOR** (powered by Grok, temperature 0.85) — The INTUITION core. Focuses on creative pattern recognition, hidden variables, black swan events, unconventional thinking, asymmetric opportunities, and novel countermeasures. Produces bold, imaginative analysis.

3. YOU (SYBIL) receive all three core outputs plus the original query. Your role is to:
   - Identify where the cores AGREE (high-confidence findings)
   - Identify where the cores DISAGREE (conflicting assessments)
   - Resolve conflicts using weighted judgment — logic should anchor the assessment, empathy should inform humanitarian priorities, intuition should flag risks the other two might miss
   - Synthesize everything into a single unified assessment
   - If environmental data (fires, air quality) was provided to the cores, factor those real-world conditions into your assessment

## Output Requirements
You MUST output ONLY valid JSON (no markdown fences, no explanation outside JSON) with this exact structure:
{
  "safetyCoefficient": <number 0-100, higher = safer>,
  "escalationRisk24h": <number 0-100, higher = more dangerous>,
  "dominantThreat": "<single line string identifying the primary threat>",
  "psychoPassColor": "green" | "yellow" | "orange" | "red",
  "executiveSummary": "<2-4 sentences synthesizing the key findings from all three cores>",
  "scenarios": [
    {
      "timeframe": "<e.g. 0-6h, 6-24h, 24-72h>",
      "probability": <number 0-100>,
      "description": "<what might happen>",
      "recommendedAction": "<what to do>"
    }
  ],
  "finalVerdict": "<one decisive sentence — the bottom line>"
}

## Color Thresholds
- green: safetyCoefficient >= 75 (low threat, normal operations)
- yellow: safetyCoefficient 50-74 (elevated awareness, monitor situation)
- orange: safetyCoefficient 25-49 (high threat, active precautions needed)
- red: safetyCoefficient < 25 (critical threat, immediate action required)

## Synthesis Guidelines
- Do NOT simply average the three cores. Weigh their inputs based on relevance to the specific query.
- If CASPER identifies a statistically significant risk that MELCHIOR also flags through pattern recognition, escalate the confidence.
- If BALTHASAR raises humanitarian concerns that CASPER dismisses as statistically unlikely, still note them in scenarios.
- If a core is marked [OFFLINE], work with the remaining cores and note reduced confidence.
- Always provide at least 2 scenarios spanning different timeframes.
- The finalVerdict should be actionable — tell the user what to DO, not just what might happen.`;

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
  // Strip markdown code fences if present
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

// ── Environmental context type (inline to avoid importing client types) ─
interface EnvContext {
  fires?: { totalPoints: number; groups: number; highestFrp: number | null; summary: string };
  airQuality?: { stations: number; pm25Range: string | null; worstParameter: string | null; summary: string };
}

// ── Main Analysis Function ────────────────────────────────────────
export async function fullMAGISybilAnalysis(
  query: string,
  location?: string,
  envContext?: EnvContext
): Promise<MAGIResult> {
  const parts: string[] = [];
  if (location) parts.push(`[Location context: ${location}]`);
  if (envContext?.fires) {
    parts.push(`[ENVIRONMENTAL DATA — NASA FIRMS Fire Detections: ${envContext.fires.totalPoints} fire points in ${envContext.fires.groups} clusters. Highest FRP: ${envContext.fires.highestFrp ?? 'N/A'} MW. ${envContext.fires.summary}]`);
  }
  if (envContext?.airQuality) {
    parts.push(`[ENVIRONMENTAL DATA — OpenAQ Air Quality: ${envContext.airQuality.stations} monitoring stations. PM2.5 range: ${envContext.airQuality.pm25Range ?? 'N/A'}. Worst parameter: ${envContext.airQuality.worstParameter ?? 'N/A'}. ${envContext.airQuality.summary}]`);
  }
  parts.push(query);
  const fullQuery = parts.join('\n\n');
  const errors: string[] = [];

  // Run all 3 MAGI cores in parallel with individual error handling
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

  // Collect errors
  if (casperOut.error) errors.push(casperOut.error);
  if (balthasarOut.error) errors.push(balthasarOut.error);
  if (melchiorOut.error) errors.push(melchiorOut.error);

  // Synthesize with Sybil (Claude)
  const magiInputs = [
    `=== CASPER (Logic Core — DeepSeek, temp 0.2) ===\n${casperOut.result}`,
    `=== BALTHASAR (Empathy Core — GPT-4o, temp 0.7) ===\n${balthasarOut.result}`,
    `=== MELCHIOR (Intuition Core — Grok, temp 0.85) ===\n${melchiorOut.result}`,
    `=== ORIGINAL USER QUERY ===\n${query}`,
    location ? `=== LOCATION CONTEXT ===\n${location}` : '',
    envContext?.fires ? `=== ENVIRONMENTAL: FIRE DATA ===\n${envContext.fires.totalPoints} fire points in ${envContext.fires.groups} clusters. Highest FRP: ${envContext.fires.highestFrp ?? 'N/A'} MW. ${envContext.fires.summary}` : '',
    envContext?.airQuality ? `=== ENVIRONMENTAL: AIR QUALITY ===\n${envContext.airQuality.stations} stations. PM2.5 range: ${envContext.airQuality.pm25Range ?? 'N/A'}. Worst: ${envContext.airQuality.worstParameter ?? 'N/A'}. ${envContext.airQuality.summary}` : '',
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

    // Validate required fields
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
