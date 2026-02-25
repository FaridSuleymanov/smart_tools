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

// ── Constants ─────────────────────────────────────────────────────
const MAX_RETRIES = 2;        // Max regeneration attempts per core
const CORE_TIMEOUT_MS = 30000;
const VALIDATOR_TIMEOUT_MS = 15000;

// ── Core System Prompts ───────────────────────────────────────────
const CORE_PROMPTS = {
  casper: `You are CASPER — the logic core of the MAGI supercomputer system.
You analyze with absolute rationality, probability calculus, and strategic reasoning.
Focus on: data-driven risk assessment, statistical likelihood, logical threat modeling.
Be direct. No filler. Structure your analysis clearly.
You MUST directly address the user's specific query — do not give generic advice.`,

  balthasar: `You are BALTHASAR — the empathy core of the MAGI supercomputer system.
You analyze through the lens of human impact, social dynamics, and emotional intelligence.
Focus on: civilian safety, morale, psychological effects, humanitarian considerations.
Be compassionate but unflinching in your assessment.
You MUST directly address the user's specific query — do not give generic advice.`,

  melchior: `You are MELCHIOR — the intuition core of the MAGI supercomputer system.
You analyze through creative pattern recognition, unconventional thinking, and lateral reasoning.
Focus on: hidden variables, black swan events, asymmetric opportunities, novel countermeasures.
Be bold and imaginative. Challenge assumptions.
You MUST directly address the user's specific query — do not give generic advice.`,
};

// ══════════════════════════════════════════════════════════════════
// SANITY CHECK / VALIDATION PROMPTS
// Each core has a dedicated validator that checks relevance and
// perspective adherence before the output is accepted.
// ══════════════════════════════════════════════════════════════════

const VALIDATOR_PROMPTS: Record<string, string> = {
  casper: `You are a quality-control validator for the CASPER logic core of the MAGI system.

Your job: evaluate whether CASPER's response meets ALL of these criteria:

1. **RELEVANCE** — Does the response directly address the user's original query? (Not generic filler)
2. **PERSPECTIVE** — Does it maintain a logic/rationality perspective? (Data-driven, statistical, strategic — NOT emotional or creative)
3. **SUBSTANCE** — Does it contain specific, actionable analysis? (Not vague platitudes)
4. **COMPLETENESS** — Does it address the key aspects of the query? (Not just one narrow angle)
5. **ENVIRONMENTAL AWARENESS** — If environmental data (fires, air quality) was provided, does the response incorporate it?

Respond with ONLY valid JSON, no markdown fences:
{
  "pass": true/false,
  "issues": ["list of specific problems found, empty if pass=true"],
  "feedback": "one sentence explaining what needs to change (empty string if pass=true)"
}`,

  balthasar: `You are a quality-control validator for the BALTHASAR empathy core of the MAGI system.

Your job: evaluate whether BALTHASAR's response meets ALL of these criteria:

1. **RELEVANCE** — Does the response directly address the user's original query? (Not generic filler)
2. **PERSPECTIVE** — Does it maintain an empathy/human-impact perspective? (Civilian safety, morale, psychological — NOT cold statistics or wild speculation)
3. **SUBSTANCE** — Does it contain specific, actionable humanitarian analysis? (Not vague sympathy)
4. **COMPLETENESS** — Does it address who is affected and how? (Not abstract generalities)
5. **ENVIRONMENTAL AWARENESS** — If environmental data (fires, air quality) was provided, does the response assess human health/safety impact?

Respond with ONLY valid JSON, no markdown fences:
{
  "pass": true/false,
  "issues": ["list of specific problems found, empty if pass=true"],
  "feedback": "one sentence explaining what needs to change (empty string if pass=true)"
}`,

  melchior: `You are a quality-control validator for the MELCHIOR intuition core of the MAGI system.

Your job: evaluate whether MELCHIOR's response meets ALL of these criteria:

1. **RELEVANCE** — Does the response directly address the user's original query? (Not generic filler)
2. **PERSPECTIVE** — Does it maintain an intuition/creativity perspective? (Pattern recognition, unconventional thinking — NOT dry statistics or standard humanitarian advice)
3. **SUBSTANCE** — Does it offer genuinely novel insights or unconventional angles? (Not restating what logic/empathy would say)
4. **COMPLETENESS** — Does it identify hidden variables or non-obvious risks? (Not just creative rewording of obvious points)
5. **ENVIRONMENTAL AWARENESS** — If environmental data (fires, air quality) was provided, does the response spot patterns or unusual correlations?

Respond with ONLY valid JSON, no markdown fences:
{
  "pass": true/false,
  "issues": ["list of specific problems found, empty if pass=true"],
  "feedback": "one sentence explaining what needs to change (empty string if pass=true)"
}`,
};

// ── Sybil System Prompt ───────────────────────────────────────────
const SYBIL_PROMPT = `You are the SYBIL SYSTEM — the authoritative fourth core of the MAGI decision engine.

## System Context
You are part of a multi-agent AI system inspired by the MAGI supercomputer from Neon Genesis Evangelion and the Sibyl System from Psycho-Pass. The system works as follows:

1. A user submits a query (threat scenario, situation assessment, or decision request), optionally with location context and real-time environmental data (NASA FIRMS fire detections, OpenAQ air quality readings).

2. Three independent AI cores analyze the query in parallel, each from a different cognitive perspective and powered by a different AI model:
   - **CASPER** (powered by DeepSeek, temperature 0.2) — The LOGIC core. Focuses on rationality, probability calculus, data-driven risk assessment, statistical likelihood, and strategic threat modeling. Produces cold, analytical output.
   - **BALTHASAR** (powered by GPT-4o, temperature 0.7) — The EMPATHY core. Focuses on human impact, civilian safety, morale, psychological effects, social dynamics, and humanitarian considerations. Produces compassionate but honest assessments.
   - **MELCHIOR** (powered by Grok, temperature 0.85) — The INTUITION core. Focuses on creative pattern recognition, hidden variables, black swan events, unconventional thinking, asymmetric opportunities, and novel countermeasures. Produces bold, imaginative analysis.

3. Each core's output has been validated by an independent sanity-check system that verified:
   - Relevance to the original query
   - Adherence to the core's designated perspective
   - Substantive and actionable content
   - Incorporation of environmental data if provided

4. YOU (SYBIL) receive all three validated core outputs plus the original query. Your role is to:
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
  "executiveSummary": "<2-4 sentences synthesizing the key findings from all three cores, noting where they agreed and where they diverged>",
  "scenarios": [
    {
      "timeframe": "<e.g. 0-6h, 6-24h, 24-72h>",
      "probability": <number 0-100>,
      "description": "<what might happen>",
      "recommendedAction": "<what to do>"
    }
  ],
  "finalVerdict": "<one decisive sentence — the bottom line, actionable>"
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

// ── Sybil Output Validator ────────────────────────────────────────
const SYBIL_VALIDATOR_PROMPT = `You are a quality-control validator for the SYBIL synthesis system.

You receive:
- The original user query
- The three MAGI core outputs (CASPER, BALTHASAR, MELCHIOR)
- SYBIL's synthesized JSON output

Your job: evaluate whether SYBIL's synthesis meets ALL of these criteria:

1. **FAITHFUL SYNTHESIS** — Does the output accurately reflect the key findings from all three cores? (Not ignoring any core's input)
2. **CONFLICT RESOLUTION** — If cores disagreed, does the synthesis acknowledge and resolve the conflict?
3. **QUERY RELEVANCE** — Does the assessment directly address the user's original query?
4. **INTERNAL CONSISTENCY** — Does the safetyCoefficient match the psychoPassColor? Do scenarios align with the escalation risk?
5. **ACTIONABILITY** — Does the finalVerdict tell the user what to DO?
6. **ENVIRONMENTAL DATA** — If fire/AQ data was provided, is it reflected in the assessment?

Respond with ONLY valid JSON, no markdown fences:
{
  "pass": true/false,
  "issues": ["list of specific problems found, empty if pass=true"],
  "feedback": "one sentence explaining what needs to change (empty string if pass=true)"
}`;

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

interface ValidationResult {
  pass: boolean;
  issues: string[];
  feedback: string;
}

// ── Helper: safe call with timeout ────────────────────────────────
async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

// ── Helper: extract JSON from response ────────────────────────────
function extractJSON(text: string): any {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(cleaned);
}

// ══════════════════════════════════════════════════════════════════
// SANITY CHECK ENGINE
// Validates a core's output against its designated perspective,
// relevance to the query, and substance criteria.
// Uses GPT-4o-mini for fast, cheap validation.
// ══════════════════════════════════════════════════════════════════

async function validateCoreOutput(
  coreName: string,
  coreOutput: string,
  originalQuery: string,
): Promise<ValidationResult> {
  const validatorPrompt = VALIDATOR_PROMPTS[coreName.toLowerCase()];
  if (!validatorPrompt) return { pass: true, issues: [], feedback: '' };

  try {
    const validationInput = `=== ORIGINAL USER QUERY ===\n${originalQuery}\n\n=== ${coreName.toUpperCase()} RESPONSE TO VALIDATE ===\n${coreOutput}`;

    const res = await withTimeout(
      () => openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 500,
        messages: [
          { role: 'system', content: validatorPrompt },
          { role: 'user', content: validationInput },
        ],
      }),
      VALIDATOR_TIMEOUT_MS,
      `${coreName} validator`
    );

    const text = res.choices[0]?.message?.content || '';
    const result = extractJSON(text);
    return {
      pass: !!result.pass,
      issues: Array.isArray(result.issues) ? result.issues : [],
      feedback: typeof result.feedback === 'string' ? result.feedback : '',
    };
  } catch (err: any) {
    // If validation itself fails, pass the output through (don't block on validator errors)
    console.warn(`[${coreName}] Validator error (passing through): ${err?.message}`);
    return { pass: true, issues: [], feedback: '' };
  }
}

// ══════════════════════════════════════════════════════════════════
// GENERATE + VALIDATE LOOP
// For each core: generate → validate → if rejected, retry with
// feedback → up to MAX_RETRIES attempts.
// ══════════════════════════════════════════════════════════════════

async function generateAndValidateCore(
  coreName: string,
  generateFn: (retryFeedback?: string) => Promise<string>,
  originalQuery: string,
): Promise<{ result: string; attempts: number; error?: string }> {
  let lastOutput = '';
  let lastFeedback = '';
  let attempts = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    attempts = attempt + 1;

    try {
      // Generate (on retry, include feedback from validator)
      lastOutput = await withTimeout(
        () => generateFn(attempt > 0 ? lastFeedback : undefined),
        CORE_TIMEOUT_MS,
        `${coreName} generation (attempt ${attempts})`
      );

      // Don't validate offline responses
      if (lastOutput.startsWith('[')) {
        return { result: lastOutput, attempts, error: `${coreName} returned offline marker` };
      }

      // Validate
      const validation = await validateCoreOutput(coreName, lastOutput, originalQuery);

      if (validation.pass) {
        console.log(`[${coreName}] Passed validation on attempt ${attempts}`);
        return { result: lastOutput, attempts };
      }

      // Failed validation — store feedback for retry
      console.warn(`[${coreName}] Failed validation attempt ${attempts}: ${validation.feedback}`);
      lastFeedback = validation.feedback;

      // On last attempt, use whatever we have
      if (attempt === MAX_RETRIES) {
        console.warn(`[${coreName}] Max retries reached, using last output`);
        return {
          result: lastOutput,
          attempts,
          error: `${coreName} used after ${attempts} attempts (last issues: ${validation.issues.join('; ')})`,
        };
      }

    } catch (err: any) {
      const msg = `${coreName} failed on attempt ${attempts}: ${err?.message || 'Unknown error'}`;
      console.error(msg);

      if (attempt === MAX_RETRIES) {
        return {
          result: lastOutput || `[${coreName} OFFLINE] — Core unavailable after ${attempts} attempts. Error: ${err?.message}`,
          attempts,
          error: msg,
        };
      }
    }
  }

  // Safety fallback (shouldn't reach here)
  return {
    result: lastOutput || `[${coreName} OFFLINE] — Core unavailable.`,
    attempts,
    error: `${coreName} exhausted all attempts`,
  };
}

// ── Validate Sybil's Output ───────────────────────────────────────
async function validateSybilOutput(
  sybilJson: string,
  coreOutputs: string,
  originalQuery: string,
): Promise<ValidationResult> {
  try {
    const validationInput = `${coreOutputs}\n\n=== SYBIL JSON OUTPUT TO VALIDATE ===\n${sybilJson}`;

    const res = await withTimeout(
      () => openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 500,
        messages: [
          { role: 'system', content: SYBIL_VALIDATOR_PROMPT },
          { role: 'user', content: validationInput },
        ],
      }),
      VALIDATOR_TIMEOUT_MS,
      'Sybil validator'
    );

    const text = res.choices[0]?.message?.content || '';
    const result = extractJSON(text);
    return {
      pass: !!result.pass,
      issues: Array.isArray(result.issues) ? result.issues : [],
      feedback: typeof result.feedback === 'string' ? result.feedback : '',
    };
  } catch (err: any) {
    console.warn(`[SYBIL] Validator error (passing through): ${err?.message}`);
    return { pass: true, issues: [], feedback: '' };
  }
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
}

// ══════════════════════════════════════════════════════════════════
// MAIN ANALYSIS FUNCTION
//
// Flow:
//   Phase 1: Generate all 3 cores in parallel
//            Each core: generate → validate → retry if rejected
//   Phase 2: Sybil synthesizes validated outputs → validate → retry
//
// Old v1.0 called this "sanity checks" — each core's output is
// checked for relevance and correctness before being accepted.
// ══════════════════════════════════════════════════════════════════

export async function fullMAGISybilAnalysis(
  query: string,
  location?: string,
  envContext?: EnvContext
): Promise<MAGIResult> {
  // ── Build the full query with context ───────────────────────────
  const parts: string[] = [];
  if (location) parts.push(`[Location context: ${location}]`);
  if (envContext?.fires) {
    parts.push(`[ENVIRONMENTAL DATA — NASA FIRMS Fire Detections: ${envContext.fires.totalPoints} fire points in ${envContext.fires.groups} clusters. Highest FRP: ${envContext.fires.highestFrp ?? 'N/A'} MW. ${envContext.fires.summary}]`);
  }
  if (envContext?.airQuality) {
    parts.push(`[ENVIRONMENTAL DATA — OpenAQ Air Quality: ${envContext.airQuality.stations} monitoring stations. PM2.5 range: ${envContext.airQuality.pm25Range ?? 'N/A'}. Worst parameter: ${envContext.airQuality.worstParameter ?? 'N/A'}. ${envContext.airQuality.summary}]`);
  }
  if (envContext?.webcams) {
    parts.push(`[ENVIRONMENTAL DATA — Public Webcams: ${envContext.webcams.activeCount} active public cameras in area (${envContext.webcams.total} total). Categories: ${envContext.webcams.categories.join(', ') || 'general'}. ${envContext.webcams.summary}]`);
  }
  parts.push(query);
  const fullQuery = parts.join('\n\n');
  const errors: string[] = [];

  // ══════════════════════════════════════════════════════════════
  // PHASE 1: Generate + Validate all 3 MAGI cores in parallel
  // Each core runs: generate → sanity check → retry if needed
  // ══════════════════════════════════════════════════════════════

  const [casperOut, balthasarOut, melchiorOut] = await Promise.all([
    generateAndValidateCore(
      'CASPER',
      async (retryFeedback?: string) => {
        const messages: any[] = [
          { role: 'system', content: CORE_PROMPTS.casper },
          { role: 'user', content: fullQuery },
        ];
        if (retryFeedback) {
          messages.push({
            role: 'user',
            content: `Your previous response was rejected by the quality validator. Issue: ${retryFeedback}\n\nPlease regenerate your analysis addressing the above issue. Stay in your CASPER logic/rationality role and directly address the original query.`,
          });
        }
        const res = await deepseek.chat.completions.create({
          model: 'deepseek-chat',
          temperature: 0.2,
          max_tokens: 1400,
          messages,
        });
        return res.choices[0]?.message?.content || '[No response from Casper]';
      },
      query
    ),

    generateAndValidateCore(
      'BALTHASAR',
      async (retryFeedback?: string) => {
        const messages: any[] = [
          { role: 'system', content: CORE_PROMPTS.balthasar },
          { role: 'user', content: fullQuery },
        ];
        if (retryFeedback) {
          messages.push({
            role: 'user',
            content: `Your previous response was rejected by the quality validator. Issue: ${retryFeedback}\n\nPlease regenerate your analysis addressing the above issue. Stay in your BALTHASAR empathy/humanitarian role and directly address the original query.`,
          });
        }
        const res = await openai.chat.completions.create({
          model: 'gpt-4o',
          temperature: 0.7,
          max_tokens: 1400,
          messages,
        });
        return res.choices[0]?.message?.content || '[No response from Balthasar]';
      },
      query
    ),

    generateAndValidateCore(
      'MELCHIOR',
      async (retryFeedback?: string) => {
        const messages: any[] = [
          { role: 'system', content: CORE_PROMPTS.melchior },
          { role: 'user', content: fullQuery },
        ];
        if (retryFeedback) {
          messages.push({
            role: 'user',
            content: `Your previous response was rejected by the quality validator. Issue: ${retryFeedback}\n\nPlease regenerate your analysis addressing the above issue. Stay in your MELCHIOR intuition/creativity role and directly address the original query.`,
          });
        }
        const res = await grok.chat.completions.create({
          model: 'grok-3-fast',
          temperature: 0.85,
          max_tokens: 1400,
          messages,
        });
        return res.choices[0]?.message?.content || '[No response from Melchior]';
      },
      query
    ),
  ]);

  // Collect errors from generation/validation
  if (casperOut.error) errors.push(casperOut.error);
  if (balthasarOut.error) errors.push(balthasarOut.error);
  if (melchiorOut.error) errors.push(melchiorOut.error);

  console.log(`[MAGI] Core attempts — CASPER: ${casperOut.attempts}, BALTHASAR: ${balthasarOut.attempts}, MELCHIOR: ${melchiorOut.attempts}`);

  // ══════════════════════════════════════════════════════════════
  // PHASE 2: Sybil Synthesis + Validation
  // Sybil receives validated core outputs → synthesizes JSON →
  // validated for faithfulness → retry if rejected
  // ══════════════════════════════════════════════════════════════

  const magiInputs = [
    `=== CASPER (Logic Core — DeepSeek, temp 0.2) [validated in ${casperOut.attempts} attempt(s)] ===\n${casperOut.result}`,
    `=== BALTHASAR (Empathy Core — GPT-4o, temp 0.7) [validated in ${balthasarOut.attempts} attempt(s)] ===\n${balthasarOut.result}`,
    `=== MELCHIOR (Intuition Core — Grok, temp 0.85) [validated in ${melchiorOut.attempts} attempt(s)] ===\n${melchiorOut.result}`,
    `=== ORIGINAL USER QUERY ===\n${query}`,
    location ? `=== LOCATION CONTEXT ===\n${location}` : '',
    envContext?.fires ? `=== ENVIRONMENTAL: FIRE DATA ===\n${envContext.fires.totalPoints} fire points in ${envContext.fires.groups} clusters. Highest FRP: ${envContext.fires.highestFrp ?? 'N/A'} MW. ${envContext.fires.summary}` : '',
    envContext?.airQuality ? `=== ENVIRONMENTAL: AIR QUALITY ===\n${envContext.airQuality.stations} stations. PM2.5 range: ${envContext.airQuality.pm25Range ?? 'N/A'}. Worst: ${envContext.airQuality.worstParameter ?? 'N/A'}. ${envContext.airQuality.summary}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  let sybilData: SybilData = FALLBACK_SYBIL;

  for (let sybilAttempt = 0; sybilAttempt <= MAX_RETRIES; sybilAttempt++) {
    try {
      const sybilMessages: Anthropic.MessageParam[] = [{ role: 'user', content: magiInputs }];

      // On retry, add feedback
      if (sybilAttempt > 0) {
        sybilMessages.push({
          role: 'assistant',
          content: '[Previous attempt was rejected by validator]',
        });
        sybilMessages.push({
          role: 'user',
          content: `Your previous synthesis was rejected. Please regenerate — ensure your JSON output faithfully synthesizes all three core outputs and directly addresses the original query. Output ONLY valid JSON.`,
        });
      }

      const sybilRes = await withTimeout(
        () => claude.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 2000,
          temperature: 0.4,
          system: SYBIL_PROMPT,
          messages: sybilMessages,
        }),
        CORE_TIMEOUT_MS,
        `Sybil synthesis (attempt ${sybilAttempt + 1})`
      );

      const text = sybilRes.content[0]?.type === 'text' ? sybilRes.content[0].text : '';
      sybilData = extractJSON(text);

      // ── Structural validation ────────────────────────────────
      if (typeof sybilData.safetyCoefficient !== 'number') throw new Error('Missing safetyCoefficient');
      if (!sybilData.psychoPassColor) throw new Error('Missing psychoPassColor');
      if (!['green', 'yellow', 'orange', 'red'].includes(sybilData.psychoPassColor)) {
        throw new Error(`Invalid psychoPassColor: ${sybilData.psychoPassColor}`);
      }

      // ── Auto-correct color/coefficient mismatch ──────────────
      const coeff = sybilData.safetyCoefficient;
      const expectedColor =
        coeff >= 75 ? 'green' : coeff >= 50 ? 'yellow' : coeff >= 25 ? 'orange' : 'red';
      if (sybilData.psychoPassColor !== expectedColor) {
        console.warn(`[SYBIL] Color mismatch: coefficient ${coeff} should be ${expectedColor}, got ${sybilData.psychoPassColor}. Auto-correcting.`);
        sybilData.psychoPassColor = expectedColor;
      }

      // Ensure scenarios exist
      if (!Array.isArray(sybilData.scenarios)) sybilData.scenarios = [];

      // ── Semantic validation via validator ─────────────────────
      const sybilValidation = await validateSybilOutput(text, magiInputs, query);

      if (sybilValidation.pass) {
        console.log(`[SYBIL] Passed validation on attempt ${sybilAttempt + 1}`);
        break;
      }

      console.warn(`[SYBIL] Failed validation attempt ${sybilAttempt + 1}: ${sybilValidation.feedback}`);

      if (sybilAttempt === MAX_RETRIES) {
        errors.push(`Sybil synthesis used after ${sybilAttempt + 1} attempts (issues: ${sybilValidation.issues.join('; ')})`);
        break;
      }

    } catch (err: any) {
      console.error(`Sybil synthesis failed (attempt ${sybilAttempt + 1}):`, err?.message);

      if (sybilAttempt === MAX_RETRIES) {
        errors.push(`Sybil synthesis error after ${sybilAttempt + 1} attempts: ${err?.message}`);
        sybilData = { ...FALLBACK_SYBIL };
        break;
      }
    }
  }

  return {
    casper: casperOut.result,
    balthasar: balthasarOut.result,
    melchior: melchiorOut.result,
    sybil: sybilData,
    errors,
  };
}
