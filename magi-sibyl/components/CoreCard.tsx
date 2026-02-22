'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CoreCardProps {
  name: string;
  model: string;
  content: string;
  color: string;      // tailwind border color class
  icon: string;       // emoji or symbol
}

export default function CoreCard({ name, model, content, color, icon }: CoreCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isOffline = content.startsWith('[');

  return (
    <Card
      className={`p-5 border-l-4 ${color} cursor-pointer hover:bg-zinc-800/50 transition-colors`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <div>
            <span className="font-display font-bold text-sm tracking-wider">{name}</span>
            <span className="text-zinc-500 text-xs ml-2 font-mono">({model})</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOffline && (
            <span className="text-xs bg-red-900/50 text-red-400 px-2 py-0.5 rounded">OFFLINE</span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </div>
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
        {expanded ? content : content.slice(0, 300) + (content.length > 300 ? '...' : '')}
      </p>
      {!expanded && content.length > 300 && (
        <span className="text-xs text-cyan-500 mt-2 inline-block">Click to expand</span>
      )}
    </Card>
  );
}
