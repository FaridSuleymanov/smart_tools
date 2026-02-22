'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SybilData } from '@/lib/types';

const COLOR_MAP: Record<string, { bg: string; text: string; glow: string }> = {
  green:  { bg: 'bg-emerald-500', text: 'text-black', glow: 'shadow-emerald-500/40' },
  yellow: { bg: 'bg-yellow-400',  text: 'text-black', glow: 'shadow-yellow-400/40' },
  orange: { bg: 'bg-orange-500',  text: 'text-black', glow: 'shadow-orange-500/40' },
  red:    { bg: 'bg-red-600',     text: 'text-white', glow: 'shadow-red-600/40' },
};

export default function SybilPanel({ data }: { data: SybilData }) {
  const color = COLOR_MAP[data.psychoPassColor] || COLOR_MAP.yellow;

  return (
    <Card className="p-6 md:p-8 border border-zinc-700 border-glow relative overflow-hidden">
      {/* Subtle background gradient based on threat level */}
      <div
        className={`absolute inset-0 opacity-5 ${color.bg}`}
        style={{ filter: 'blur(80px)' }}
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8">
          <div>
            <h2 className="font-display text-2xl md:text-3xl font-bold tracking-wider text-glow-cyan">
              SYBIL SYSTEM
            </h2>
            <p className="text-zinc-500 text-xs font-mono mt-1">
              FOURTH CORE • COLLECTIVE INTELLIGENCE SYNTHESIS
            </p>
          </div>
          <Badge
            className={`text-lg md:text-xl px-6 py-2 ${color.bg} ${color.text} shadow-lg ${color.glow} font-display font-bold tracking-widest`}
          >
            {data.psychoPassColor.toUpperCase()}
          </Badge>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="bg-zinc-800/50 rounded-lg p-4">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-1">
              Safety Coefficient
            </div>
            <div className="font-mono font-black text-5xl md:text-6xl tabular-nums">
              {data.safetyCoefficient}
            </div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-4">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-1">
              24h Escalation Risk
            </div>
            <div className="font-mono font-black text-5xl md:text-6xl tabular-nums text-red-400">
              {data.escalationRisk24h}%
            </div>
          </div>
        </div>

        {/* Dominant Threat */}
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-2">
            Dominant Threat
          </div>
          <div className="text-lg md:text-xl font-semibold">{data.dominantThreat}</div>
        </div>

        {/* Executive Summary */}
        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-2">
            Executive Summary
          </div>
          <p className="text-sm md:text-base leading-relaxed text-zinc-200">
            {data.executiveSummary}
          </p>
        </div>

        {/* Scenarios */}
        {data.scenarios && data.scenarios.length > 0 && (
          <div className="mb-8">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-3">
              Predicted Scenarios
            </div>
            <div className="space-y-4">
              {data.scenarios.map((s, i) => (
                <div key={i} className="pl-4 border-l-2 border-red-600/60">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-semibold text-zinc-200">
                      {s.timeframe}
                    </span>
                    <span className="text-xs font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                      {s.probability}%
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400 mb-1">{s.description}</p>
                  <p className="text-sm text-emerald-400 font-medium">→ {s.recommendedAction}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Final Verdict */}
        <div className="pt-5 border-t border-zinc-700">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-2">
            Final Verdict
          </div>
          <p className="font-mono text-emerald-400 text-sm md:text-base font-medium">
            {data.finalVerdict}
          </p>
        </div>
      </div>
    </Card>
  );
}
